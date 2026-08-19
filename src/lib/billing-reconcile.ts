// Reconciliación periódica de Stripe Billing.
//
// Los webhooks dan baja latencia, pero no son una base de autorización por sí
// solos: pueden retrasarse, llegar fuera de orden o agotarse sus reintentos. Este
// barrido consulta el objeto actual de Stripe y reconstruye la proyección local.

import { METER_PRICES, PRICE_TO_PLAN, flushPendingUsage, stripe } from './billing';
import { sql, withOrgTx, withSystemTx } from './db';
import { sendOpsAlert } from './ops-alert';
import { PLAN_RANK, type PaidPlan } from './entitlements';

import { log } from './log';
const STRIPE_VERSION = '2025-06-30.basil';
const NON_TERMINAL = new Set(['active', 'trialing', 'past_due', 'unpaid', 'paused', 'incomplete']);

export interface BillingReconcileResult {
    checked: number;
    granted: number;
    revoked: number;
    failed: number;
    duplicateCustomers: number;
    attemptsRecovered: number;
    usageSent: number;
    usageFailed: number;
}

function idOf(value: any): string | null {
    if (typeof value === 'string') return value;
    return value?.id ? String(value.id) : null;
}

function basePlanItem(subscription: any): any | null {
    return (subscription?.items?.data ?? []).find((item: any) => {
        const priceId = idOf(item?.price);
        return !!priceId && !!PRICE_TO_PLAN[priceId];
    }) ?? null;
}

function invoiceLinePriceId(line: any): string | null {
    return idOf(line?.price) ?? idOf(line?.pricing?.price_details?.price);
}

function paidEvidenceOf(invoice: any, minimumPlan: PaidPlan, periodEnd: number): { paidPlan: PaidPlan; paidThrough: number } | null {
    if (invoice?.status !== 'paid' || Number(invoice?.amount_paid || 0) <= 0) return null;
    const lines: any[] = Array.isArray(invoice?.lines?.data) ? invoice.lines.data : [];
    const candidates = lines.map((line: any): { paidPlan: PaidPlan | null; paidThrough: number } => {
        const priceId = invoiceLinePriceId(line);
        const paidPlan = priceId ? PRICE_TO_PLAN[priceId] : null;
        return { paidPlan, paidThrough: Number(line?.period?.end || 0) };
    }).filter((entry: { paidPlan: PaidPlan | null; paidThrough: number }): entry is { paidPlan: PaidPlan; paidThrough: number } => {
        if (!entry.paidPlan) return false;
        return PLAN_RANK[entry.paidPlan] >= PLAN_RANK[minimumPlan]
            && entry.paidThrough >= periodEnd;
    });
    candidates.sort((a: { paidPlan: PaidPlan; paidThrough: number }, b: { paidPlan: PaidPlan; paidThrough: number }) =>
        PLAN_RANK[b.paidPlan] - PLAN_RANK[a.paidPlan] || b.paidThrough - a.paidThrough
    );
    return candidates[0] ?? null;
}

async function expandedLatestInvoice(subscription: any): Promise<any | null> {
    const latest = subscription?.latest_invoice;
    if (!latest) return null;
    if (typeof latest === 'object' && Array.isArray(latest?.lines?.data)) return latest;
    const id = idOf(latest);
    return id ? stripe(`/v1/invoices/${id}`, { 'expand[0]': 'lines.data.price' }, 'GET', { version: STRIPE_VERSION }) : null;
}

async function paidBaseInvoice(subscription: any, minimumPlan: PaidPlan, periodEnd: number): Promise<{ invoice: any; paidPlan: PaidPlan; paidThrough: number } | null> {
    const latest = await expandedLatestInvoice(subscription);
    const latestEvidence = paidEvidenceOf(latest, minimumPlan, periodEnd);
    if (latestEvidence) return { invoice: latest, ...latestEvidence };
    const subscriptionId = idOf(subscription);
    if (!subscriptionId) return null;
    const page = await stripe('/v1/invoices', {
        subscription: subscriptionId,
        status: 'paid',
        limit: '100',
        'expand[0]': 'data.lines.data.price',
    }, 'GET', { version: STRIPE_VERSION });
    for (const invoice of page?.data ?? []) {
        const evidence = paidEvidenceOf(invoice, minimumPlan, periodEnd);
        if (evidence) return { invoice, ...evidence };
    }
    return null;
}

async function recoverCheckoutAttempts(): Promise<number> {
    await withSystemTx(sql`
        update billing_checkout_attempts set status = 'expired', updated_at = now()
         where status in ('creating','incomplete') and expires_at <= now()`);
    const [attempts] = await withSystemTx(sql`
        select id, org_id, stripe_session_id
          from billing_checkout_attempts
         where status in ('creating','incomplete') and stripe_session_id is not null
         order by created_at asc limit 100`);
    let recovered = 0;
    for (const attempt of attempts) {
        try {
            const session = await stripe(`/v1/checkout/sessions/${attempt.stripe_session_id}`, undefined, 'GET');
            const subscriptionId = idOf(session?.subscription);
            if (session?.status === 'expired') {
                await withOrgTx(String(attempt.org_id), sql`
                    update billing_checkout_attempts set status = 'expired', updated_at = now()
                     where id = ${attempt.id}`);
                recovered++;
            } else if (session?.status === 'complete' && subscriptionId) {
                await withOrgTx(String(attempt.org_id),
                    sql`update billing_checkout_attempts
                           set status = 'incomplete', stripe_subscription_id = ${subscriptionId}, updated_at = now()
                         where id = ${attempt.id}`,
                    sql`update orgs
                           set stripe_subscription_id = coalesce(stripe_subscription_id, ${subscriptionId}),
                               stripe_customer_id = coalesce(stripe_customer_id, ${idOf(session?.customer)}),
                               subscription_status = coalesce(subscription_status, 'incomplete')
                         where id = ${attempt.org_id}`,
                );
                recovered++;
            }
        } catch (error) {
            log.error('tentativa de reconciliación falló', { route: 'billing-reconcile', attemptId: attempt.id, err: error });
        }
    }
    return recovered;
}

async function reconcileOne(org: any, result: BillingReconcileResult): Promise<void> {
    const orgId = String(org.id);
    const subscriptionId = String(org.stripe_subscription_id || '');
    if (!subscriptionId) return;
    result.checked++;

    try {
        const subscription = await stripe(`/v1/subscriptions/${subscriptionId}`, {
            'expand[0]': 'items.data.price',
        }, 'GET', { version: STRIPE_VERSION });
        const status = String(subscription?.status || 'unverified');
        const customerId = idOf(subscription?.customer);
        const baseItem = basePlanItem(subscription);
        const basePriceId = idOf(baseItem?.price) || '';
        const periodEnd = Number(baseItem?.current_period_end || subscription?.current_period_end || 0);
        const plan: PaidPlan | 'free' = basePriceId ? (PRICE_TO_PLAN[basePriceId] || 'free') : 'free';
        const itemPrices = new Set((subscription?.items?.data ?? []).map((item: any) => idOf(item?.price)));
        const metersComplete = plan !== 'free' && Object.values(METER_PRICES[plan]).filter(Boolean).every((price) => itemPrices.has(price));
        const evidence = plan !== 'free' && periodEnd
            ? await paidBaseInvoice(subscription, plan, periodEnd)
            : null;
        const invoice = evidence?.invoice ?? null;
        const paidThrough = evidence?.paidThrough ?? 0;
        const paidPlan = evidence?.paidPlan ?? null;
        const amountPaid = Number(invoice?.amount_paid || 0);
        const invoicePaid = invoice?.status === 'paid' && amountPaid > 0;
        const grants = status === 'active'
            && plan !== 'free'
            && metersComplete
            && periodEnd * 1000 > Date.now()
            && invoicePaid
            && paidThrough >= periodEnd
            && !!customerId;
        const interval = baseItem?.price?.recurring?.interval;
        const cycle = interval === 'year' ? 'anual' : 'mensual';

        await withOrgTx(orgId,
            sql`update orgs set
                    plan = ${grants ? plan : 'free'},
                    subscription_status = ${status},
                    stripe_subscription_id = ${subscriptionId},
                    stripe_customer_id = coalesce(${customerId}, stripe_customer_id),
                    billing_cycle = ${cycle},
                    current_period_end = ${periodEnd ? new Date(periodEnd * 1000).toISOString() : null},
                    billing_last_paid_at = ${invoicePaid ? new Date(Number(invoice?.status_transitions?.paid_at || Math.floor(Date.now() / 1000)) * 1000).toISOString() : null},
                    billing_paid_through = ${invoicePaid && paidThrough ? new Date(paidThrough * 1000).toISOString() : null},
                    billing_paid_plan = ${invoicePaid ? paidPlan : null},
                    billing_last_invoice_id = ${invoicePaid ? idOf(invoice) : null},
                    billing_last_amount_paid = ${invoicePaid ? amountPaid : null},
                    billing_currency = ${invoicePaid ? String(invoice?.currency || '').toUpperCase() || null : null}
                  where id = ${orgId}`,
            sql`update billing_checkout_attempts
                    set status = ${grants ? 'completed' : (['canceled','incomplete_expired'].includes(status) ? 'expired' : 'incomplete')},
                        updated_at = now()
                  where org_id = ${orgId} and stripe_subscription_id = ${subscriptionId}
                    and status in ('creating','incomplete')`,
        );

        if (grants) result.granted++; else result.revoked++;
        if (plan === 'free') {
            await sendOpsAlert('Precio de plan desconocido en Stripe', `Organización ${orgId}; suscripción ${subscriptionId}`);
        } else if (!metersComplete) {
            await sendOpsAlert('Suscripción sin todos los medidores requeridos', `Organización ${orgId}; suscripción ${subscriptionId}; plan ${plan}`);
        }

        if (customerId) {
            const subscriptions = await stripe('/v1/subscriptions', { customer: customerId, status: 'all', limit: '20' }, 'GET', { version: STRIPE_VERSION });
            const active = (subscriptions?.data ?? []).filter((item: any) => NON_TERMINAL.has(String(item?.status || '')));
            if (active.length > 1) {
                result.duplicateCustomers++;
                await sendOpsAlert('Cliente con múltiples suscripciones de Cord', `Organización ${orgId}; customer ${customerId}; suscripciones ${active.map((item: any) => item.id).join(', ')}`);
            }
        }
    } catch (error) {
        result.failed++;
        await withOrgTx(orgId, sql`
            update orgs set plan = 'free', subscription_status = 'unverified'
             where id = ${orgId}`);
        const message = error instanceof Error ? error.message.slice(0, 300) : 'error desconocido';
        await sendOpsAlert('No se pudo reconciliar una suscripción', `Organización ${orgId}; suscripción ${subscriptionId}; ${message}`);
    }
}

export async function reconcileBilling(): Promise<BillingReconcileResult> {
    const result: BillingReconcileResult = {
        checked: 0, granted: 0, revoked: 0, failed: 0, duplicateCustomers: 0,
        attemptsRecovered: 0, usageSent: 0, usageFailed: 0,
    };
    result.attemptsRecovered = await recoverCheckoutAttempts();
    const orgs = await sql`
        select id, stripe_subscription_id
          from orgs
         where sandbox_of is null and stripe_subscription_id is not null
         order by id`;
    for (const org of orgs) await reconcileOne(org, result);
    const usage = await flushPendingUsage(250);
    result.usageSent = usage.sent;
    result.usageFailed = usage.failed;
    await sql`
        insert into platform_health (key, last_success_at, metadata, updated_at)
        values ('billing_reconcile', now(), ${JSON.stringify(result)}::jsonb, now())
        on conflict (key) do update
          set last_success_at = now(), metadata = excluded.metadata, updated_at = now()`;
    return result;
}

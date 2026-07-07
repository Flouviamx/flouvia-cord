// POST /api/stripe/webhook — Stripe avisa de pagos, altas y CAMBIOS DE PLAN.
// Verifica la firma con STRIPE_WEBHOOK_SECRET (HMAC, sin SDK) y sincroniza Neon
// en tiempo real. Configura el endpoint en el dashboard de Stripe apuntando a
// https://cord.flouvia.com/api/stripe/webhook con estos eventos:
//   • checkout.session.completed
//   • customer.subscription.created / .updated / .deleted
//   • invoice.paid / invoice.payment_failed
export const prerender = false;

import type { APIRoute } from 'astro';
import crypto from 'node:crypto';
import { sql, logAudit } from '../../../lib/db';
import { dispatchQuoteEvent } from '../../../lib/webhooks';
import { PRICE_TO_PLAN, isPaidPlan } from '../../../lib/billing';

const WH_SECRET = import.meta.env.STRIPE_WEBHOOK_SECRET || process.env.STRIPE_WEBHOOK_SECRET;
const CONNECT_WH_SECRET = import.meta.env.STRIPE_CONNECT_WEBHOOK_SECRET || process.env.STRIPE_CONNECT_WEBHOOK_SECRET;

function verifySig(raw: string, sig: string, secret: string) {
    if (!secret) return false;
    try {
        const parts = Object.fromEntries(sig.split(',').map((p) => p.split('=')));
        const expected = crypto.createHmac('sha256', secret).update(`${parts.t}.${raw}`).digest('hex');
        const a = Buffer.from(parts.v1 || '', 'hex');
        const b = Buffer.from(expected, 'hex');
        return a.length === b.length && crypto.timingSafeEqual(a, b);
    } catch {
        return false;
    }
}

export const POST: APIRoute = async ({ request }) => {
    const raw = await request.text();

    if ((!WH_SECRET && !CONNECT_WH_SECRET) && process.env.VERCEL) {
        return new Response('webhook mal configurado (falta secret)', { status: 500 });
    }
    if (WH_SECRET || CONNECT_WH_SECRET) {
        const sig = request.headers.get('stripe-signature') || '';
        let valid = false;
        if (WH_SECRET && verifySig(raw, sig, WH_SECRET as string)) valid = true;
        if (!valid && CONNECT_WH_SECRET && verifySig(raw, sig, CONNECT_WH_SECRET as string)) valid = true;
        if (!valid) {
            return new Response('firma inválida', { status: 400 });
        }
    }

    let event: any;
    try { event = JSON.parse(raw); } catch { return new Response('payload inválido', { status: 400 }); }

    // Idempotencia: si ya procesamos este event.id, salimos sin reprocesar.
    try {
        const ins = await sql`insert into stripe_events (id, type) values (${event.id}, ${event.type})
                              on conflict (id) do nothing returning id`;
        if (!ins.length) return ok();
    } catch { /* tabla aún no migrada → seguimos (sin idempotencia) */ }

    const obj = event.data?.object ?? {};

    switch (event.type) {
        // ── Pago de una cotización individual (Checkout mode=payment) ──────────
        case 'checkout.session.completed':
        case 'checkout.session.async_payment_succeeded': {
            if (obj.mode === 'subscription') {
                await linkSubscription(obj);
            } else {
                await markQuotePaid(obj, event.account);
            }
            break;
        }
        // ── Alta / cambio de plan / renovación ────────────────────────────────
        case 'customer.subscription.created':
        case 'customer.subscription.updated': {
            await syncSubscription(obj);
            break;
        }
        case 'customer.subscription.deleted': {
            await downgradeToFree(obj);
            break;
        }
        // ── Cobros (incluye el excedente medido del periodo) ──────────────────
        case 'invoice.paid': {
            await setStatusByCustomer(obj.customer, 'active');
            break;
        }
        case 'invoice.payment_failed': {
            await setStatusByCustomer(obj.customer, 'past_due');
            break;
        }
        // ── Actualización de cuenta Connect ───────────────────────────────────
        case 'account.updated': {
            await updateAccountStatus(obj);
            break;
        }
    }

    return ok();
};

// Marca la cotización como pagada (flujo de pago en línea por link público).
// `account` = event.account de Stripe (la cuenta CONECTADA del dueño en charges
// directas). Se valida contra la org de la cotización para que un merchant
// conectado no pueda marcar pagada una cotización de OTRA org.
async function markQuotePaid(session: any, account?: string) {
    const cid = session?.metadata?.cotizacion_id;
    if (!cid) return;
    // Métodos diferidos (SPEI/customer_balance): `checkout.session.completed`
    // llega con payment_status 'unpaid' cuando el cliente termina el checkout y
    // recibe la CLABE, pero AÚN NO transfiere. Solo marcar pagado cuando el dinero
    // realmente llegó (payment_status 'paid' — el card es síncrono; el SPEI lo
    // confirma después vía checkout.session.async_payment_succeeded).
    const ps = session?.payment_status;
    if (ps && ps !== 'paid' && ps !== 'no_payment_required') return;
    const rows = await sql`select id, org_id, status, (select stripe_account_id from orgs where id = c.org_id) as acct from cotizaciones c where c.id = ${cid}`;
    // Defensa en profundidad: el evento debe provenir de la cuenta conectada de la
    // org dueña de la cotización (o de la plataforma, si aún no hay Connect).
    if (rows.length && account && rows[0].acct && rows[0].acct !== account) return;
    if (rows.length && ['approved', 'invoiced'].includes(rows[0].status as string)) {
        await sql`update cotizaciones set status = 'paid' where id = ${cid}`;
        await sql`insert into eventos (org_id, cotizacion_id, tipo, detalle)
                  values (${rows[0].org_id}, ${cid}, 'paid', 'Pago recibido vía Stripe')`;
        await logAudit(rows[0].org_id as string, { accion: 'cotizacion.paid', entidad: 'cotizacion', entidad_id: cid, detalle: 'Pago en línea (Stripe)' });
        // Fondo: no demorar el 200 a Stripe con nuestro webhook saliente (evita reintentos).
        after(dispatchQuoteEvent(rows[0].org_id as string, cid, 'quote.paid'));
    }
}

// Liga la suscripción recién creada a la org (del metadata del checkout).
async function linkSubscription(session: any) {
    const orgId = session?.metadata?.org_id;
    if (orgId && session.subscription) {
        await sql`update orgs set stripe_subscription_id = ${session.subscription},
                  stripe_customer_id = coalesce(stripe_customer_id, ${session.customer})
                  where id = ${orgId}`;
    }
}

// Resuelve el plan desde los items de la suscripción (o el metadata).
function planOf(sub: any): string {
    const metaPlan = sub?.metadata?.plan;
    if (metaPlan && isPaidPlan(metaPlan)) return metaPlan;
    for (const item of sub?.items?.data ?? []) {
        const p = PRICE_TO_PLAN[item?.price?.id];
        if (p) return p;
    }
    return 'free';
}

// Sincroniza plan / estado / fin de ciclo. ESTE es el "cambio de plan en vivo".
async function syncSubscription(sub: any) {
    const plan = planOf(sub);
    const status = (sub.status as string) || 'active';
    const cycle = sub?.metadata?.cycle || (sub?.items?.data?.[0]?.price?.recurring?.interval === 'year' ? 'anual' : 'mensual');
    const periodEnd = sub.current_period_end ? Number(sub.current_period_end) : null;

    // Localiza la org por subscription_id o por customer_id.
    const rows = await sql`select id from orgs where stripe_subscription_id = ${sub.id} or stripe_customer_id = ${sub.customer} limit 1`;
    if (!rows.length) return;
    const orgId = rows[0].id as string;

    // El plan SOLO se otorga cuando la suscripción está pagada/vigente. Con el
    // Payment Element la suscripción nace `incomplete` (antes de pagar): en ese
    // estado NO se debe upgradear el plan — se hace al llegar `active` (vía
    // invoice.paid / subscription.updated). El resto de campos sí se sincroniza.
    const grantsPlan = status === 'active' || status === 'trialing' || status === 'past_due';

    if (grantsPlan) {
        await sql`update orgs set
                    plan = ${plan},
                    subscription_status = ${status},
                    billing_cycle = ${cycle},
                    stripe_subscription_id = ${sub.id},
                    stripe_customer_id = coalesce(stripe_customer_id, ${sub.customer}),
                    current_period_end = ${periodEnd ? new Date(periodEnd * 1000).toISOString() : null}
                  where id = ${orgId}`;
    } else {
        await sql`update orgs set
                    subscription_status = ${status},
                    billing_cycle = ${cycle},
                    stripe_subscription_id = ${sub.id},
                    stripe_customer_id = coalesce(stripe_customer_id, ${sub.customer}),
                    current_period_end = ${periodEnd ? new Date(periodEnd * 1000).toISOString() : null}
                  where id = ${orgId}`;
    }
    await logAudit(orgId, { accion: 'billing.plan_sync', entidad: 'org', entidad_id: orgId, detalle: `Plan ${grantsPlan ? plan : '(sin cambio)'} (${status})` });
}

// Cancelación → vuelve a Gratis.
async function downgradeToFree(sub: any) {
    const rows = await sql`select id from orgs where stripe_subscription_id = ${sub.id} or stripe_customer_id = ${sub.customer} limit 1`;
    if (!rows.length) return;
    const orgId = rows[0].id as string;
    await sql`update orgs set plan = 'free', subscription_status = 'canceled', stripe_subscription_id = null where id = ${orgId}`;
    await logAudit(orgId, { accion: 'billing.canceled', entidad: 'org', entidad_id: orgId, detalle: 'Suscripción cancelada → Gratis' });
}

async function setStatusByCustomer(customer: string | undefined, status: string) {
    if (!customer) return;
    await sql`update orgs set subscription_status = ${status} where stripe_customer_id = ${customer}`;
}

async function updateAccountStatus(account: any) {
    if (!account.id) return;
    const chargesEnabled = !!account.charges_enabled;
    await sql`update orgs set stripe_charges_enabled = ${chargesEnabled} where stripe_account_id = ${account.id}`;
}

function ok() {
    return new Response(JSON.stringify({ received: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

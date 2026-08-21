// POST /api/billing/subscribe — alta de plan. Dos modos:
//  • ui:'element' (default de la app): crea la SUSCRIPCIÓN directo en estado
//    `incomplete` y devuelve el client_secret para montar el Payment Element
//    custom en /app/checkout. El cobro lo confirma el cliente; el webhook activa
//    el plan al concretarse el pago (status active).
//  • sin ui (fallback): Stripe Checkout hosteado (modo suscripción) → { url }.
// Ambos incluyen el precio base + los precios MEDIDOS (overage) del plan.
// Ruta INTERNA (el middleware exige sesión).
export const prerender = false;

import type { APIRoute } from 'astro';
import { randomUUID } from 'node:crypto';
import { sql, getActiveOrgId, logAudit, reqIp, withOrgTx } from '../../../lib/db';
import { getOrg, requirePerm } from '../../../lib/queries';
import { currentLocale } from '../../../lib/context';
import { t } from '../../../i18n/app';
import {
    STRIPE_KEY, PLAN_PRICES, METER_PRICES, isPaidPlan, getOrCreateCustomer, stripe,
    priceFor, meterPricesFor, platformCurrencyForOrg, type Cycle,
} from '../../../lib/billing';
import { normalizePlatformCurrency, type PlatformCurrency } from '../../../lib/plan-currency';
import { stripeCurrency } from '../../../lib/currency';
import { siteOrigin } from '../../../lib/email';
import { PLAN_RANK, type PaidPlan } from '../../../lib/entitlements';

// API version mínima para billing_mode flexible + invoice.confirmation_secret.
const STRIPE_VERSION = '2025-06-30.basil';

function priceIdOf(value: any): string {
    return typeof value === 'string' ? value : String(value?.id || '');
}

function currentBaseItem(subscription: any): any | null {
    return (subscription?.items?.data ?? []).find((item: any) =>
        Object.values(PLAN_PRICES).some((cycles) => Object.values(cycles).includes(priceIdOf(item?.price)))
    ) ?? null;
}

function currentPaidPlan(subscription: any): PaidPlan | null {
    const priceId = priceIdOf(currentBaseItem(subscription)?.price);
    for (const [plan, cycles] of Object.entries(PLAN_PRICES) as Array<[PaidPlan, Record<Cycle, string>]>) {
        if (Object.values(cycles).includes(priceId)) return plan;
    }
    return null;
}

function meterDimension(priceId: string): string | null {
    for (const prices of Object.values(METER_PRICES)) {
        for (const [dimension, candidate] of Object.entries(prices)) {
            if (candidate === priceId) return dimension;
        }
    }
    return null;
}

function appendDesiredItems(params: Record<string, string>, prefix: string, plan: PaidPlan, cycle: Cycle, currency: PlatformCurrency): void {
    const prices = [priceFor(plan, cycle, currency), ...meterPricesFor(plan, currency)];
    prices.forEach((price, index) => { params[`${prefix}[${index}][price]`] = price; });
}

// Ojo: los caminos de CAMBIO (este y `schedulePlanChange`) nunca mandan
// `currency`. Una suscripción viva conserva la suya y todos sus items deben
// compartirla; re-derivarla del país aquí es cómo se produce el error duro de
// Stripe "items must share the subscription currency" a mitad de un upgrade.
function subscriptionChangeParams(subscription: any, orgId: string, plan: PaidPlan, cycle: Cycle, currency: PlatformCurrency): Record<string, string> {
    const params: Record<string, string> = {
        payment_behavior: 'pending_if_incomplete',
        proration_behavior: 'always_invoice',
        'expand[0]': 'latest_invoice.confirmation_secret',
        'metadata[org_id]': orgId,
        'metadata[plan]': plan,
        'metadata[cycle]': cycle,
    };
    const existing = subscription?.items?.data ?? [];
    const used = new Set<string>();
    let index = 0;
    const base = currentBaseItem(subscription);
    if (base) {
        params[`items[${index}][id]`] = String(base.id);
        params[`items[${index}][price]`] = priceFor(plan, cycle, currency);
        used.add(String(base.id));
        index++;
    }
    for (const [dimension, desiredPrice] of Object.entries(METER_PRICES[plan])) {
        if (!desiredPrice) continue;
        const item = existing.find((candidate: any) => meterDimension(priceIdOf(candidate?.price)) === dimension);
        if (item) {
            params[`items[${index}][id]`] = String(item.id);
            used.add(String(item.id));
        }
        params[`items[${index}][price]`] = desiredPrice;
        index++;
    }
    for (const item of existing) {
        if (used.has(String(item.id))) continue;
        params[`items[${index}][id]`] = String(item.id);
        params[`items[${index}][deleted]`] = 'true';
        index++;
    }
    return params;
}

async function ensureFlexible(subscription: any, idempotencyKey: string): Promise<any> {
    if (subscription?.billing_mode?.type === 'flexible') return subscription;
    return stripe(`/v1/subscriptions/${subscription.id}/migrate`, {
        'billing_mode[type]': 'flexible',
    }, 'POST', { version: STRIPE_VERSION, idempotencyKey: `${idempotencyKey}:flexible` });
}

async function schedulePlanChange(subscription: any, orgId: string, plan: PaidPlan, cycle: Cycle, idempotencyKey: string, currency: PlatformCurrency): Promise<any> {
    const scheduleId = priceIdOf(subscription?.schedule);
    const schedule = scheduleId
        ? await stripe(`/v1/subscription_schedules/${scheduleId}`, undefined, 'GET', { version: STRIPE_VERSION })
        : await stripe('/v1/subscription_schedules', { from_subscription: String(subscription.id) }, 'POST', {
            version: STRIPE_VERSION,
            idempotencyKey: `${idempotencyKey}:schedule`,
        });
    const phase = schedule?.phases?.find((candidate: any) => Number(candidate.start_date) <= Date.now() / 1000 && Number(candidate.end_date) > Date.now() / 1000)
        ?? schedule?.phases?.[0];
    const base = currentBaseItem(subscription);
    const periodEnd = Number(base?.current_period_end || subscription?.current_period_end || phase?.end_date || 0);
    if (!phase || !periodEnd || periodEnd * 1000 <= Date.now()) throw new Error('No pudimos determinar el cierre del periodo actual.');

    const params: Record<string, string> = {
        end_behavior: 'release',
        'phases[0][start_date]': String(phase.start_date),
        'phases[0][end_date]': String(periodEnd),
        'phases[0][proration_behavior]': 'none',
        'phases[1][start_date]': String(periodEnd),
        'phases[1][duration][interval]': cycle === 'anual' ? 'year' : 'month',
        'phases[1][duration][interval_count]': '1',
        'phases[1][proration_behavior]': 'none',
        'phases[1][metadata][org_id]': orgId,
        'phases[1][metadata][plan]': plan,
        'phases[1][metadata][cycle]': cycle,
    };
    (phase.items ?? []).forEach((item: any, index: number) => {
        params[`phases[0][items][${index}][price]`] = priceIdOf(item.price);
        if (item.quantity && item?.price?.recurring?.usage_type !== 'metered') {
            params[`phases[0][items][${index}][quantity]`] = String(item.quantity);
        }
    });
    appendDesiredItems(params, 'phases[1][items]', plan, cycle, currency);
    return stripe(`/v1/subscription_schedules/${schedule.id}`, params, 'POST', {
        version: STRIPE_VERSION,
        idempotencyKey: `${idempotencyKey}:schedule-update`,
    });
}

export const POST: APIRoute = async ({ request }) => {
    const denied = await requirePerm('ajustes');
    if (denied) return denied;
    if (!STRIPE_KEY) return json({ error: 'La facturación aún no está configurada.' }, 503);

    let body: any = {};
    try { body = await request.json(); } catch { /* sin body */ }
    const plan = String(body.plan || '');
    const cycle: Cycle = body.cycle === 'anual' ? 'anual' : 'mensual';
    const useElement = body.ui === 'element';
    if (!isPaidPlan(plan)) return json({ error: 'Plan inválido' }, 400);
    // Developer no tiene precio de autoservicio (ago 2026): capacidad y
    // condiciones se acuerdan hablando con ventas, no vía checkout self-serve.
    // Las suscripciones YA activas siguen renovando solas — esto solo bloquea
    // ABRIR una suscripción nueva a este plan por esta vía.
    if (plan === 'developer') return json({ error: 'El plan Developer se contrata hablando con ventas.', code: 'developer_contact_sales' }, 400);

    const orgId = await getActiveOrgId();

    // El ENTORNO DE PRUEBA nunca toca Stripe Billing real.
    const [[sb]] = await withOrgTx(orgId, sql`select sandbox_of from orgs where id = ${orgId}`);
    if (sb?.sandbox_of) {
        return json({ error: t(currentLocale(), 'err.test.plan') }, 409);
    }

    const org = await getOrg();
    const origin = siteOrigin();

    try {
        const customer = await getOrCreateCustomer(orgId, org.email, org.nombre);

        // Divisa de plataforma: MXN a México, USD al resto. Se resuelve UNA vez.
        //
        // Stripe congela `customer.currency` en la primera factura, así que la del
        // customer manda sobre la que derivamos del país: mandar un `currency` que
        // lo contradice es un 400 con el cobro a medias. Un cliente que ya pagó en
        // pesos sigue en pesos aunque hoy su país diga otra cosa.
        let currency = await platformCurrencyForOrg(orgId);
        const cus = await stripe(`/v1/customers/${customer}`, undefined, 'GET');
        const locked = normalizePlatformCurrency(cus?.currency);
        if (locked && locked !== currency) currency = locked;

        // Expira locks abandonados. Una Subscription `incomplete` queda terminal
        // en Stripe después de su ventana; el webhook/reconciliador sincroniza el
        // estado real, pero este TTL evita un lock local eterno si el evento faltó.
        await withOrgTx(orgId, sql`
            update billing_checkout_attempts
               set status = 'expired', updated_at = now()
             where org_id = ${orgId} and status in ('creating','incomplete') and expires_at <= now()`);

        const [[open]] = await withOrgTx(orgId, sql`
            select * from billing_checkout_attempts
             where org_id = ${orgId} and status in ('creating','incomplete')
             order by created_at desc limit 1`);
        if (open) {
            // El lock existe para que no nazcan dos suscripciones a la vez, no para
            // castigar a quien cambió de opinión. Se libera cuando el intento previo
            // demostrablemente no cobró nada; se conserva cuando sí hay dinero de por
            // medio (`active`/`past_due`), que se resuelve en el portal.
            const sameSelection = open.plan === plan && open.cycle === cycle;
            const TERMINAL = new Set(['canceled', 'incomplete_expired']);
            // `release` = liberar el lock local. `cancelFirst` = además hay algo vivo
            // en Stripe que hay que matar ANTES, para no dejarlo huérfano y cobrando.
            let release = false;
            let cancelFirst = false;

            if (open.mode === 'element') {
                if (!open.stripe_subscription_id) {
                    // Quedó en 'creating': murió antes de crear nada en Stripe. No hay
                    // qué cancelar y no puede reanudarse — es basura que bloquea 24 h.
                    release = true;
                } else {
                    const existing = await stripe(`/v1/subscriptions/${open.stripe_subscription_id}`, {
                        'expand[0]': 'latest_invoice.confirmation_secret',
                    }, 'GET', { version: STRIPE_VERSION });
                    const clientSecret = existing?.latest_invoice?.confirmation_secret?.client_secret;
                    const existingStatus = String(existing?.status || '');
                    if (clientSecret && ['incomplete', 'active', 'past_due'].includes(existingStatus) && sameSelection) {
                        return json({ client_secret: clientSecret, resumed: true });
                    }
                    if (TERMINAL.has(existingStatus)) {
                        release = true;              // ya está muerta en Stripe
                    } else if (existingStatus === 'incomplete' && !sameSelection) {
                        release = true;              // nunca se cobró y quiere otro plan
                        cancelFirst = true;
                    }
                }
            }

            if (open.mode === 'checkout') {
                if (!open.stripe_session_id) {
                    release = true;
                } else {
                    const existing = await stripe(`/v1/checkout/sessions/${open.stripe_session_id}`, undefined, 'GET');
                    const sessionStatus = String(existing?.status || '');
                    if (existing?.url && sessionStatus === 'open' && sameSelection) {
                        return json({ url: existing.url, resumed: true });
                    }
                    if (sessionStatus !== 'open') {
                        release = true;              // expirada o ya completada
                    } else if (!sameSelection) {
                        release = true;
                        cancelFirst = true;
                    }
                }
            }

            if (release) {
                if (cancelFirst) {
                    // Si Stripe falla aquí NO se libera el lock: preferimos dejar al
                    // usuario bloqueado un rato antes que soltar una suscripción viva
                    // sin registro local que la reclame.
                    try {
                        if (open.mode === 'element') {
                            await stripe(`/v1/subscriptions/${open.stripe_subscription_id}`, undefined, 'DELETE', { version: STRIPE_VERSION });
                        } else {
                            await stripe(`/v1/checkout/sessions/${open.stripe_session_id}/expire`, undefined, 'POST');
                        }
                    } catch {
                        return json({ error: 'No pudimos liberar tu intento de pago anterior. Intenta de nuevo en un momento.' }, 503);
                    }
                }
                await withOrgTx(orgId,
                    sql`update billing_checkout_attempts
                           set status = 'canceled', last_error = 'abandoned_for_new_selection', updated_at = now()
                         where id = ${open.id} and org_id = ${orgId}`,
                    // Solo limpia la proyección local si sigue apuntando a la
                    // suscripción que acabamos de descartar (el webhook pudo haberla
                    // reemplazado por otra en el intertanto).
                    sql`update orgs
                           set subscription_status = 'canceled', stripe_subscription_id = null,
                               current_period_end = null, billing_paid_through = null, billing_paid_plan = null
                         where id = ${orgId} and stripe_subscription_id is not distinct from ${open.stripe_subscription_id}
                           and ${open.stripe_subscription_id}::text is not null`,
                );
                await logAudit(orgId, { accion: 'billing.intento_abandonado', entidad: 'org', entidad_id: orgId, detalle: `${open.plan}/${open.cycle} → ${plan}/${cycle}`, ip: reqIp(request) });
            } else {
                return json({ error: 'Ya hay un pago de suscripción en proceso. Complétalo o gestiona tu suscripción actual.' }, 409);
            }
        }

        // Una deuda, pausa o alta incompleta se recupera sobre la suscripción
        // existente desde el portal. Nunca se crea una segunda para evadirla.
        const [[billing]] = await withOrgTx(orgId, sql`
            select subscription_status, stripe_subscription_id
              from orgs where id = ${orgId} limit 1`);
        if (billing?.stripe_subscription_id) {
            // La fila local puede estar atrasada. Stripe es la autoridad y una
            // falla al consultarlo bloquea la creación: nunca asumimos que un id
            // desconocido ya terminó porque eso permitiría duplicar suscripciones.
            let existingSubscription: any;
            try {
                existingSubscription = await stripe(`/v1/subscriptions/${billing.stripe_subscription_id}`, undefined, 'GET', { version: STRIPE_VERSION });
            } catch {
                return json({ error: 'No pudimos verificar tu suscripción existente. Intenta de nuevo o entra al portal de facturación.' }, 503);
            }
            const terminal = new Set(['canceled', 'incomplete_expired']);
            const existingStatus = String(existingSubscription?.status || '');
            if (existingStatus === 'active') {
                existingSubscription = await stripe(`/v1/subscriptions/${billing.stripe_subscription_id}`, {
                    'expand[0]': 'items.data.price',
                    'expand[1]': 'latest_invoice.confirmation_secret',
                }, 'GET', { version: STRIPE_VERSION });
                const currentPlan = currentPaidPlan(existingSubscription);
                const currentInterval = currentBaseItem(existingSubscription)?.price?.recurring?.interval;
                const currentCycle: Cycle = currentInterval === 'year' ? 'anual' : 'mensual';
                if (!currentPlan) return json({ error: 'No pudimos identificar el plan actual. Entra al portal de facturación.' }, 409);
                if (currentPlan === plan && currentCycle === cycle) return json({ error: 'Ese ya es tu plan y ciclo actuales.' }, 409);

                const attemptId = randomUUID();
                const idempotencyKey = `billing-change:${attemptId}`;
                try {
                    await withOrgTx(orgId, sql`
                        insert into billing_checkout_attempts
                            (id, org_id, plan, cycle, mode, status, idempotency_key, stripe_subscription_id)
                        values (${attemptId}, ${orgId}, ${plan}, ${cycle}, 'element', 'creating', ${idempotencyKey}, ${existingSubscription.id})`);
                } catch {
                    return json({ error: 'Ya hay un cambio de suscripción en proceso.' }, 409);
                }

                const isUpgrade = PLAN_RANK[plan] > PLAN_RANK[currentPlan];
                existingSubscription = await ensureFlexible(existingSubscription, idempotencyKey);
                if (!isUpgrade) {
                    const schedule = await schedulePlanChange(existingSubscription, orgId, plan, cycle, idempotencyKey, currency);
                    await withOrgTx(orgId, sql`
                        update billing_checkout_attempts set status = 'completed', updated_at = now()
                         where id = ${attemptId} and org_id = ${orgId}`);
                    await logAudit(orgId, { accion: 'billing.cambio_programado', entidad: 'org', entidad_id: orgId, detalle: `${currentPlan}/${currentCycle} → ${plan}/${cycle}; schedule ${schedule.id}`, ip: reqIp(request) });
                    return json({ changed: true, scheduled: true, redirect_url: `${origin}/app/ajustes/plan?cambio_programado=1` });
                }

                const changed = await stripe(`/v1/subscriptions/${existingSubscription.id}`, subscriptionChangeParams(existingSubscription, orgId, plan, cycle, currency), 'POST', {
                    version: STRIPE_VERSION,
                    idempotencyKey,
                });
                const clientSecret = changed?.latest_invoice?.confirmation_secret?.client_secret;
                await withOrgTx(orgId, sql`
                    update billing_checkout_attempts set status = 'incomplete', updated_at = now()
                     where id = ${attemptId} and org_id = ${orgId}`);
                if (!clientSecret) throw new Error('Stripe no devolvió la confirmación del prorrateo. El cambio quedó pendiente para recuperarse.');
                await logAudit(orgId, { accion: 'billing.upgrade', entidad: 'org', entidad_id: orgId, detalle: `${currentPlan}/${currentCycle} → ${plan}/${cycle}`, ip: reqIp(request) });
                return json({ client_secret: clientSecret, change: true });
            }
            if (!terminal.has(existingStatus)) {
                return json({ error: 'Ya existe una suscripción que debes gestionar o recuperar antes de iniciar otra.' }, 409);
            }
            await withOrgTx(orgId, sql`update orgs set
                plan = 'free', subscription_status = ${String(existingSubscription.status)},
                stripe_subscription_id = null, current_period_end = null,
                billing_paid_through = null, billing_paid_plan = null where id = ${orgId}`);
        }

        const attemptId = randomUUID();
        const idempotencyKey = `billing-subscription:${attemptId}`;
        try {
            await withOrgTx(orgId, sql`
                insert into billing_checkout_attempts
                    (id, org_id, plan, cycle, mode, status, idempotency_key)
                values (${attemptId}, ${orgId}, ${plan}, ${cycle}, ${useElement ? 'element' : 'checkout'}, 'creating', ${idempotencyKey})`);
        } catch (error) {
            // El índice parcial es la autoridad ante dos requests simultáneas.
            return json({ error: 'Ya hay un pago de suscripción en proceso.' }, 409);
        }

        if (useElement) {
            const params: Record<string, string> = {
                customer,
                currency: stripeCurrency(currency),
                'items[0][price]': priceFor(plan, cycle, currency),
                payment_behavior: 'default_incomplete',
                'payment_settings[save_default_payment_method]': 'on_subscription',
                'billing_mode[type]': 'flexible',
                'expand[0]': 'latest_invoice.confirmation_secret',
                'metadata[org_id]': orgId,
                'metadata[plan]': plan,
                'metadata[cycle]': cycle,
            };
            // Items medidos (overage): sin quantity → uso.
            let i = 1;
            for (const price of meterPricesFor(plan, currency)) {
                params[`items[${i}][price]`] = price;
                i++;
            }

            const sub = await stripe('/v1/subscriptions', params, 'POST', {
                version: STRIPE_VERSION,
                idempotencyKey,
            });
            const clientSecret = sub?.latest_invoice?.confirmation_secret?.client_secret;
            await withOrgTx(orgId,
                sql`update billing_checkout_attempts
                       set status = 'incomplete', stripe_subscription_id = ${sub.id}, updated_at = now()
                     where id = ${attemptId} and org_id = ${orgId}`,
                sql`update orgs
                       set stripe_subscription_id = ${sub.id}, stripe_customer_id = coalesce(stripe_customer_id, ${customer}),
                           subscription_status = ${String(sub.status || 'incomplete')}
                     where id = ${orgId}`,
            );
            if (!clientSecret) return json({ error: 'No se pudo iniciar el pago. La suscripción quedó pendiente para recuperarse de forma segura.' }, 502);
            await logAudit(orgId, { accion: 'billing.checkout', entidad: 'org', entidad_id: orgId, detalle: `Payment Element ${plan} (${cycle})`, ip: reqIp(request) });
            return json({ client_secret: clientSecret });
        }

        // ── Fallback: Checkout hosteado ──
        // Stripe Checkout no puede crear suscripciones de intervalos mixtos.
        // El camino principal (Payment Element) sí crea flexible annual+meters.
        if (cycle === 'anual') {
            await withOrgTx(orgId, sql`update billing_checkout_attempts set status = 'failed', last_error = 'checkout_mixed_interval_unsupported', updated_at = now() where id = ${attemptId}`);
            return json({ error: 'La facturación anual se completa dentro de Cord. Vuelve a elegir el plan desde la app.' }, 422);
        }
        // Item 0 = precio base (flat). Items siguientes = precios medidos (sin qty).
        const params: Record<string, string> = {
            mode: 'subscription',
            customer,
            currency: stripeCurrency(currency),
            success_url: `${origin}/app/ajustes/plan?suscrito=1`,
            cancel_url: `${origin}/app/ajustes/plan`,
            'line_items[0][price]': priceFor(plan, cycle, currency),
            'line_items[0][quantity]': '1',
            'subscription_data[metadata][org_id]': orgId,
            'subscription_data[metadata][plan]': plan,
            'subscription_data[metadata][cycle]': cycle,
            'metadata[org_id]': orgId,
            'metadata[plan]': plan,
            'metadata[cycle]': cycle,
        };
        let i = 1;
        for (const price of meterPricesFor(plan, currency)) {
            params[`line_items[${i}][price]`] = price;
            i++;
        }

        const session = await stripe('/v1/checkout/sessions', params, 'POST', { idempotencyKey });
        await withOrgTx(orgId, sql`
            update billing_checkout_attempts
               set status = 'incomplete', stripe_session_id = ${session.id}, updated_at = now()
             where id = ${attemptId} and org_id = ${orgId}`);
        await logAudit(orgId, { accion: 'billing.checkout', entidad: 'org', entidad_id: orgId, detalle: `Checkout ${plan} (${cycle})`, ip: reqIp(request) });
        return json({ url: session.url });
    } catch (e: any) {
        // Solo cierra tentativas que aún no alcanzaron a crear un objeto Stripe.
        // Las que ya guardaron subscription/session permanecen recuperables.
        await withOrgTx(orgId, sql`
            update billing_checkout_attempts
               set status = 'failed', last_error = ${String(e?.message || 'error').slice(0, 500)}, updated_at = now()
             where org_id = ${orgId} and status = 'creating'`).catch(() => null);
        return json({ error: e?.message || 'No se pudo iniciar el checkout' }, 502);
    }
};

function json(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

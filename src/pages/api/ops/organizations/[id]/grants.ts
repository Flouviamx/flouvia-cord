// Cortesías de Cord Ops sobre una organización: días gratis y plan regalado
// (POST), y revocación (PATCH). La decisión de qué hacer vive en
// src/lib/ops-grants.ts; aquí se lee el estado REAL de la suscripción en
// Stripe, se reserva la cortesía en la base ANTES de llamar al proveedor (sus
// llaves de idempotencia salen del id de la cortesía) y se audita todo.
//
// Mueve dinero: solo admin, con autenticación reciente, confirmación por
// nombre de la organización, límite estricto y sin mensajes crudos de Stripe
// (regla 33).
export const prerender = false;

import type { APIRoute } from 'astro';
import { sql, withOpsTx } from '../../../../../lib/db';
import { PLAN_PRICES, PRICE_TO_PLAN, stripe } from '../../../../../lib/billing';
import { hasPaidBillingEvidence, normalizePlan } from '../../../../../lib/entitlements';
import { trustedIp } from '../../../../../lib/ip';
import { log } from '../../../../../lib/log';
import { opsAuditQuery, requireFreshOpsAuth } from '../../../../../lib/ops-auth';
import { parseGrantRequest, planGrant, type GrantSubject } from '../../../../../lib/ops-grants';
import { strictRateLimit } from '../../../../../lib/ratelimit';
import { translateStripeError } from '../../../../../lib/stripe-catalogs';

const STRIPE_VERSION = '2025-06-30.basil';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});
const unix = (d: Date) => String(Math.floor(d.getTime() / 1000));

async function loadOrg(orgId: string) {
    const [rows, grants] = await withOpsTx(
        sql`select id, nombre, sandbox_of, coalesce(plan, 'free') plan, subscription_status, current_period_end,
                   billing_paid_through, billing_paid_plan, stripe_subscription_id, stripe_customer_id
            from orgs where id = ${orgId} limit 1`,
        sql`select id from ops_plan_grants where org_id = ${orgId} and status = 'active' and expires_at > now() limit 1`,
    );
    return { org: rows[0] as any, activeGrant: grants.length > 0 };
}

/** La suscripción como la ve Stripe ahora: estado, ciclo, fin de periodo y producto base. */
async function readSubscription(id: string): Promise<NonNullable<GrantSubject['subscription']>> {
    const sub = await stripe(`/v1/subscriptions/${encodeURIComponent(id)}`, undefined, 'GET', { version: STRIPE_VERSION });
    const items: any[] = sub?.items?.data ?? [];
    const base = items.find((i) => PRICE_TO_PLAN[String(i?.price?.id)]);
    const basePlan = base ? PRICE_TO_PLAN[String(base.price.id)] : null;
    const cycle = base && basePlan ? (PLAN_PRICES[basePlan].mensual === base.price.id ? 'mensual' : 'anual') : null;
    const periodEnd = Number(base?.current_period_end || sub?.current_period_end || 0);
    return {
        id: String(sub.id),
        status: String(sub.status),
        cycle,
        periodEnd: periodEnd ? new Date(periodEnd * 1000) : null,
        baseProduct: base ? String(typeof base.price.product === 'string' ? base.price.product : base.price.product?.id ?? '') || null : null,
        hasSchedule: !!sub.schedule,
        hasDiscounts: Array.isArray(sub.discounts) ? sub.discounts.length > 0 : !!sub.discount,
        cancelAtPeriodEnd: !!sub.cancel_at_period_end,
    };
}

export const POST: APIRoute = async ({ params, request, locals }) => {
    const operator = locals.opsOperator;
    if (!operator) return json({ error: 'No autenticado' }, 401);
    if (operator.role !== 'admin') return json({ error: 'Permiso insuficiente' }, 403);
    const orgId = params.id || '';
    if (!UUID.test(orgId)) return json({ error: 'Organización inválida' }, 400);
    let body: any;
    try { body = await request.json(); } catch { return json({ error: 'JSON inválido' }, 400); }
    const req = parseGrantRequest(body);
    if ('error' in req) return json({ error: req.error }, 400);
    const dryRun = body?.dryRun === true;
    if (!dryRun) {
        const stale = requireFreshOpsAuth(operator);
        if (stale) return stale;
    }
    const limited = await strictRateLimit(`ops-grant:${operator.userId}`, dryRun ? 60 : 10, 3600);
    if (!limited.ok) return json({ error: 'Demasiadas cortesías en poco tiempo. Espera unos minutos.' }, 429);

    try {
        const { org, activeGrant } = await loadOrg(orgId);
        if (!org) return json({ error: 'Organización no encontrada' }, 404);
        if (!dryRun && body?.confirmation !== org.nombre) return json({ error: 'La confirmación no coincide con el nombre de la organización' }, 400);

        const paying = hasPaidBillingEvidence({
            plan: org.plan, subscriptionStatus: org.subscription_status, currentPeriodEnd: org.current_period_end,
            billingPaidThrough: org.billing_paid_through, billingPaidPlan: org.billing_paid_plan,
            stripeSubscriptionId: org.stripe_subscription_id, stripeCustomerId: org.stripe_customer_id,
        });
        // Sin el estado real de la suscripción no se decide nada: un error del
        // procesador aquí es "no se pudo leer", no "no se pudo dar".
        let subscription: GrantSubject['subscription'] = null;
        if (org.stripe_subscription_id) {
            try { subscription = await readSubscription(String(org.stripe_subscription_id)); }
            catch (error) {
                log.error('no se pudo leer la suscripción para una cortesía', { route: 'ops/grants', orgId, err: error });
                return json({ error: 'No se pudo leer su suscripción en el procesador. Inténtalo en unos minutos.' }, 502);
            }
        }
        const decision = planGrant(req, {
            isSandbox: !!org.sandbox_of, paying, paidPlan: paying ? normalizePlan(org.plan) : 'free',
            subscription, activeGrant,
        });
        if (!decision.ok) return json({ error: decision.error }, 409);
        if (dryRun) return json({ ok: true, mechanism: decision.mechanism, plan: decision.plan, expiresAt: decision.expiresAt, summary: decision.summary });

        // 1. Reservar la cortesía y auditar, en la misma transacción. Una
        //    vencida que siguiera marcada como activa se cierra primero (el
        //    índice único admite una sola activa por organización).
        const audit = (action: string, metadata: Record<string, unknown>, result: 'success' | 'failure' = 'success') => opsAuditQuery({
            actorUserId: operator.userId, actorEmail: operator.email, action, targetType: 'organization', targetId: orgId,
            result, metadata, ip: trustedIp(request), userAgent: request.headers.get('user-agent') || 'desconocido',
        });
        const [, inserted] = await withOpsTx(
            sql`update ops_plan_grants set status = 'expired' where org_id = ${orgId} and status = 'active' and expires_at <= now()`,
            sql`insert into ops_plan_grants (org_id, plan, kind, mechanism, expires_at, reason, operator_id, operator_email, stripe_subscription_id)
                values (${orgId}, ${decision.plan}, ${req.kind}, ${decision.mechanism}, ${decision.expiresAt}, ${req.reason},
                        ${operator.userId}, ${operator.email}, ${decision.mechanism === 'acceso' ? null : subscription?.id ?? null})
                returning id`,
            audit('ops.plan_grant_created', { kind: req.kind, amount: req.amount, plan: decision.plan, mechanism: decision.mechanism, reason: req.reason }),
        );
        const grantId = String(inserted[0].id);

        // 2. Stripe, solo donde aplica. Llaves de idempotencia del id de la
        //    cortesía: un reintento no crea un segundo cupón ni mueve dos veces.
        if (decision.mechanism !== 'acceso' && subscription) {
            const metadata = { 'metadata[ops_grant_id]': grantId, 'metadata[ops_operator_id]': operator.userId, 'metadata[ops_action]': req.kind };
            try {
                if (decision.mechanism === 'trial') {
                    await stripe(`/v1/subscriptions/${encodeURIComponent(subscription.id)}`, {
                        trial_end: unix(decision.trialEnd!), proration_behavior: 'none', ...metadata,
                    }, 'POST', { version: STRIPE_VERSION, idempotencyKey: `ops-grant:${grantId}:trial` });
                } else {
                    const coupon = await stripe('/v1/coupons', {
                        percent_off: '100', duration: 'repeating', duration_in_months: String(decision.couponMonths),
                        'applies_to[products][0]': subscription.baseProduct!, max_redemptions: '1', name: 'Cortesía Cord', ...metadata,
                    }, 'POST', { version: STRIPE_VERSION, idempotencyKey: `ops-grant:${grantId}:coupon` });
                    await stripe(`/v1/subscriptions/${encodeURIComponent(subscription.id)}`, {
                        'discounts[0][coupon]': String(coupon.id), ...metadata,
                    }, 'POST', { version: STRIPE_VERSION, idempotencyKey: `ops-grant:${grantId}:discount` });
                    await withOpsTx(sql`update ops_plan_grants set stripe_coupon_id = ${String(coupon.id)} where id = ${grantId}`);
                }
            } catch (error) {
                // Stripe no aceptó: la cortesía no se da a medias. Se revoca
                // la reserva y queda la falla en la bitácora.
                log.error('cortesía de Ops rechazada por el procesador', { route: 'ops/grants', orgId, err: error });
                await withOpsTx(
                    sql`update ops_plan_grants set status = 'revoked', revoked_at = now(), revoked_by = 'sistema: el procesador la rechazó' where id = ${grantId}`,
                    audit('ops.plan_grant_failed', { grant: grantId, mechanism: decision.mechanism }, 'failure'),
                ).catch(() => null);
                return json({ error: `El procesador no aceptó el cambio: ${translateStripeError(error)}. No se dio la cortesía.` }, 502);
            }
        }
        return json({ success: true, message: decision.summary });
    } catch (error) {
        log.error('error no controlado', { route: 'ops/grants', err: error });
        return json({ error: 'No se pudo dar la cortesía. Revisa la ficha antes de reintentar.' }, 500);
    }
};

// Revocar: lo deshace en Stripe primero (si Stripe falla, la cortesía sigue
// viva y el negocio no pierde acceso a medias) y después cierra la fila.
export const PATCH: APIRoute = async ({ params, request, locals }) => {
    const operator = locals.opsOperator;
    if (!operator) return json({ error: 'No autenticado' }, 401);
    if (operator.role !== 'admin') return json({ error: 'Permiso insuficiente' }, 403);
    const orgId = params.id || '';
    if (!UUID.test(orgId)) return json({ error: 'Organización inválida' }, 400);
    let body: any;
    try { body = await request.json(); } catch { return json({ error: 'JSON inválido' }, 400); }
    if (body?.action !== 'revoke_grant') return json({ error: 'Acción no permitida' }, 400);
    const grantId = typeof body?.targetId === 'string' && UUID.test(body.targetId) ? body.targetId : '';
    if (!grantId) return json({ error: 'Cortesía inválida' }, 400);
    const stale = requireFreshOpsAuth(operator);
    if (stale) return stale;
    const limited = await strictRateLimit(`ops-grant:${operator.userId}`, 10, 3600);
    if (!limited.ok) return json({ error: 'Demasiados cambios en poco tiempo. Espera unos minutos.' }, 429);

    try {
        const [orgs, grants] = await withOpsTx(
            sql`select nombre from orgs where id = ${orgId}`,
            sql`select id, mechanism, stripe_subscription_id from ops_plan_grants where id = ${grantId} and org_id = ${orgId} and status = 'active'`,
        );
        if (!orgs.length) return json({ error: 'Organización no encontrada' }, 404);
        if (body?.confirmation !== orgs[0].nombre) return json({ error: 'La confirmación no coincide con el nombre de la organización' }, 400);
        const grant = grants[0] as any;
        if (!grant) return json({ error: 'Esa cortesía ya no está vigente.' }, 409);

        if (grant.stripe_subscription_id && grant.mechanism !== 'acceso') {
            const subPath = `/v1/subscriptions/${encodeURIComponent(String(grant.stripe_subscription_id))}`;
            try {
                if (grant.mechanism === 'trial') {
                    // Terminar el periodo sin cobro: Stripe factura el periodo nuevo AHORA.
                    await stripe(subPath, { trial_end: 'now', proration_behavior: 'none' }, 'POST', { version: STRIPE_VERSION, idempotencyKey: `ops-grant:${grantId}:revoke` });
                } else {
                    await stripe(subPath, { discounts: '' }, 'POST', { version: STRIPE_VERSION, idempotencyKey: `ops-grant:${grantId}:revoke` });
                }
            } catch (error) {
                log.error('revocación de cortesía rechazada por el procesador', { route: 'ops/grants', orgId, err: error });
                return json({ error: `El procesador no aceptó el cambio: ${translateStripeError(error)}. La cortesía sigue vigente.` }, 502);
            }
        }
        await withOpsTx(
            sql`update ops_plan_grants set status = 'revoked', revoked_at = now(), revoked_by = ${operator.email} where id = ${grantId} and status = 'active'`,
            opsAuditQuery({
                actorUserId: operator.userId, actorEmail: operator.email, action: 'ops.plan_grant_revoked', targetType: 'organization', targetId: orgId,
                metadata: { grant: grantId, mechanism: grant.mechanism }, ip: trustedIp(request), userAgent: request.headers.get('user-agent') || 'desconocido',
            }),
        );
        return json({ success: true, message: grant.mechanism === 'trial' ? 'Cortesía revocada. El procesador cobra el periodo nuevo ahora.' : 'Cortesía revocada.' });
    } catch (error) {
        log.error('error no controlado', { route: 'ops/grants', err: error });
        return json({ error: 'No se pudo revocar la cortesía. Revisa la ficha antes de reintentar.' }, 500);
    }
};

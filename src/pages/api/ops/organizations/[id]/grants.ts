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
import { sendOpsAlert } from '../../../../../lib/ops-alert';
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
/**
 * ¿Stripe rechazó la petición con certeza? Solo un 4xx lo prueba (salvo 409
 * y 429, que no dicen si el cambio se aplicó). Un 5xx, un timeout o un corte
 * de red NO prueban que no se aplicó.
 */
const definitelyRejected = (error: unknown) => {
    const status = Number((error as { stripeStatus?: number })?.stripeStatus);
    return status >= 400 && status < 500 && status !== 409 && status !== 429;
};
/** Id del cupón de un descuento, en las formas que han usado las versiones de la API. */
const discountCoupon = (d: any): string | null => {
    const c = d?.coupon ?? d?.source?.coupon ?? null;
    return typeof c === 'string' ? c : c?.id ?? null;
};

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
        hasPendingChange: !!sub.pending_update || !!sub.pause_collection,
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
    // Revisar no gasta el cupo de dar: claves separadas.
    const limited = await strictRateLimit(`${dryRun ? 'ops-grant-review' : 'ops-grant'}:${operator.userId}`, dryRun ? 60 : 10, 3600);
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
        // Lo que se confirma es lo que se revisó: si la suscripción cambió
        // entre los dos pasos (pagó, canceló, cambió de plan), se revisa otra vez.
        if (body?.expect && (body.expect.mechanism !== decision.mechanism || body.expect.plan !== decision.plan)) {
            return json({ error: 'Su suscripción cambió desde que revisaste. Revisa otra vez antes de confirmar.' }, 409);
        }

        // 1. Reservar la cortesía y auditar, en la misma transacción. Una
        //    vencida que siguiera marcada como activa se cierra primero (el
        //    índice único admite una sola activa por organización).
        const audit = (action: string, metadata: Record<string, unknown>, result: 'success' | 'failure' = 'success') => opsAuditQuery({
            actorUserId: operator.userId, actorEmail: operator.email, action, targetType: 'organization', targetId: orgId,
            result, metadata, ip: trustedIp(request), userAgent: request.headers.get('user-agent') || 'desconocido',
        });
        const [, inserted] = await withOpsTx(
            sql`update ops_plan_grants set status = 'expired' where org_id = ${orgId} and status = 'active' and expires_at <= now()`,
            sql`insert into ops_plan_grants (org_id, plan, kind, mechanism, expires_at, reason, operator_id, operator_email, stripe_subscription_id, original_period_end)
                values (${orgId}, ${decision.plan}, ${req.kind}, ${decision.mechanism}, ${decision.expiresAt}, ${req.reason},
                        ${operator.userId}, ${operator.email}, ${decision.mechanism === 'acceso' ? null : subscription?.id ?? null},
                        ${decision.originalPeriodEnd ?? null})
                returning id`,
            audit('ops.plan_grant_created', { kind: req.kind, amount: req.amount, plan: decision.plan, mechanism: decision.mechanism, reason: req.reason }),
        );
        const grantId = String(inserted[0].id);

        // 2. Stripe, solo donde aplica. Llaves de idempotencia del id de la
        //    cortesía: un reintento no crea un segundo cupón ni mueve dos veces.
        if (decision.mechanism !== 'acceso' && subscription) {
            const metadata = { 'metadata[ops_grant_id]': grantId, 'metadata[ops_operator_id]': operator.userId, 'metadata[ops_action]': req.kind, 'metadata[ops_plan]': decision.plan };
            let couponId: string | null = null;
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
                    couponId = String(coupon.id);
                    await stripe(`/v1/subscriptions/${encodeURIComponent(subscription.id)}`, {
                        'discounts[0][coupon]': couponId, ...metadata,
                    }, 'POST', { version: STRIPE_VERSION, idempotencyKey: `ops-grant:${grantId}:discount` });
                }
            } catch (error) {
                log.error('cortesía de Ops: el procesador falló', { route: 'ops/grants', orgId, grant: grantId, err: error });
                if (!definitelyRejected(error)) {
                    // No se sabe si Stripe aplicó el cambio. Si lo aplicó y se
                    // revocara la reserva, el negocio quedaría en `trialing` o
                    // con un cupón y SIN acceso. La cortesía queda vigente.
                    await withOpsTx(audit('ops.plan_grant_failed', { grant: grantId, mechanism: decision.mechanism, ambiguous: true }, 'failure'))
                        .catch((err) => log.error('auditoría de cortesía no escrita', { route: 'ops/grants', err }));
                    await sendOpsAlert('Cortesía sin confirmar en el procesador', `Organización ${orgId}; cortesía ${grantId} (${decision.mechanism}). Revisa la suscripción ${subscription.id}: si no cambió, revoca la cortesía.`);
                    return json({ error: 'No se pudo confirmar si el procesador aplicó el cambio. La cortesía queda vigente para no dejarlo sin acceso; revisa su suscripción en el procesador y, si no cambió, revócala.' }, 502);
                }
                // Rechazo definitivo: nada se aplicó (el cupón huérfano, si se
                // creó, es de un solo uso y nadie lo tiene). No se da a medias.
                try {
                    await withOpsTx(
                        sql`update ops_plan_grants set status = 'revoked', revoked_at = now(), revoked_by = 'sistema: el procesador la rechazó' where id = ${grantId}`,
                        audit('ops.plan_grant_failed', { grant: grantId, mechanism: decision.mechanism }, 'failure'),
                    );
                } catch (err) {
                    log.error('cortesía rechazada por el procesador quedó activa: revócala a mano', { route: 'ops/grants', orgId, grant: grantId, err });
                }
                return json({ error: `El procesador no aceptó el cambio: ${translateStripeError(error)}. No se dio la cortesía.` }, 502);
            }
            // Ya aplicado en Stripe: guardar el cupón es para revocarlo
            // después. Si esta escritura falla, la cortesía sigue siendo válida.
            if (couponId) {
                await withOpsTx(sql`update ops_plan_grants set stripe_coupon_id = ${couponId} where id = ${grantId}`)
                    .catch((err) => log.error('no se guardó el cupón de la cortesía', { route: 'ops/grants', grant: grantId, coupon: couponId, err }));
            }
        }
        return json({ success: true, message: decision.summary });
    } catch (error) {
        // Dos admins a la vez: el índice de una sola cortesía viva rechaza al
        // segundo antes de tocar el procesador.
        if ((error as { code?: string })?.code === '23505') return json({ error: 'Ya tiene una cortesía vigente. Recarga la ficha.' }, 409);
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
            sql`select id, mechanism, stripe_subscription_id, stripe_coupon_id, original_period_end from ops_plan_grants
                where id = ${grantId} and org_id = ${orgId} and status = 'active' and expires_at > now()`,
        );
        if (!orgs.length) return json({ error: 'Organización no encontrada' }, 404);
        if (body?.confirmation !== orgs[0].nombre) return json({ error: 'La confirmación no coincide con el nombre de la organización' }, 400);
        const grant = grants[0] as any;
        if (!grant) return json({ error: 'Esa cortesía ya no está vigente.' }, 409);

        // Qué se deshizo en el procesador, para la bitácora y el mensaje.
        let undone: 'trial' | 'cupon' | 'nada' = 'nada';
        if (grant.stripe_subscription_id && grant.mechanism !== 'acceso') {
            const subPath = `/v1/subscriptions/${encodeURIComponent(String(grant.stripe_subscription_id))}`;
            try {
                // Primero el estado REAL: la prueba pudo terminar sola, el
                // cliente pudo cancelar, o el cupón pudo ya no estar.
                let sub: any = null;
                try {
                    sub = await stripe(subPath, { 'expand[0]': 'discounts' }, 'GET', { version: STRIPE_VERSION });
                } catch (error) {
                    if (Number((error as { stripeStatus?: number })?.stripeStatus) !== 404) throw error;
                }
                const live = sub && !['canceled', 'incomplete_expired'].includes(String(sub.status));
                if (live && grant.mechanism === 'trial' && sub.status === 'trialing' && sub.metadata?.ops_grant_id === grantId) {
                    // El cobro vuelve a la fecha que YA había pagado, nunca antes:
                    // terminar la prueba "ahora" cobraba un periodo nuevo y
                    // perdía lo ya pagado (en un anual, meses enteros). Si esa
                    // fecha ya pasó, se cobra ahora: es lo que debía desde entonces.
                    const original = grant.original_period_end ? new Date(grant.original_period_end) : null;
                    const backTo = original && original.getTime() > Date.now() + 60_000 ? unix(original) : 'now';
                    await stripe(subPath, { trial_end: backTo, proration_behavior: 'none' }, 'POST', { version: STRIPE_VERSION, idempotencyKey: `ops-grant:${grantId}:revoke` });
                    undone = 'trial';
                } else if (live && grant.mechanism === 'cupon') {
                    // Quitar SOLO el descuento de esta cortesía; los demás se conservan.
                    const discounts: any[] = Array.isArray(sub.discounts) ? sub.discounts : [];
                    const ours = (d: any) => !!grant.stripe_coupon_id && discountCoupon(d) === grant.stripe_coupon_id;
                    if (discounts.some(ours)) {
                        const keep = discounts.filter((d) => !ours(d)).map((d) => (typeof d === 'string' ? d : String(d.id)));
                        const params: Record<string, string> = keep.length
                            ? Object.fromEntries(keep.map((id, i) => [`discounts[${i}][discount]`, id]))
                            : { discounts: '' };
                        await stripe(subPath, params, 'POST', { version: STRIPE_VERSION, idempotencyKey: `ops-grant:${grantId}:revoke` });
                        undone = 'cupon';
                    }
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
                metadata: { grant: grantId, mechanism: grant.mechanism, undone }, ip: trustedIp(request), userAgent: request.headers.get('user-agent') || 'desconocido',
            }),
        );
        return json({ success: true, message: undone === 'trial' ? 'Cortesía revocada. Su cobro vuelve a la fecha que ya tenía pagada (o se cobra ahora si ya pasó).'
            : undone === 'cupon' ? 'Cortesía revocada. Su próxima mensualidad se cobra completa.'
            : grant.mechanism === 'acceso' ? 'Cortesía revocada.'
            : 'Cortesía revocada. En el procesador ya no había nada que deshacer (la prueba terminó, el cupón ya no estaba o la suscripción se canceló).' });
    } catch (error) {
        log.error('error no controlado', { route: 'ops/grants', err: error });
        return json({ error: 'No se pudo revocar la cortesía. Revisa la ficha antes de reintentar.' }, 500);
    }
};

// POST /api/billing/cancelar — programa la cancelación al cierre del periodo, o
// la revierte con `{ reanudar: true }`.
//
// Nunca corta a mitad del periodo: el negocio ya pagó hasta esa fecha y quitarle
// el acceso antes sería cobrarle un servicio que no prestó.
export const prerender = false;

import type { APIRoute } from 'astro';
import { sql, withOrgTx, logAudit, reqIp } from '../../../lib/db';
import { stripe } from '../../../lib/billing';
import { billingContext, json } from '../../../lib/billing-surface';

export const POST: APIRoute = async ({ request }) => {
    const gate = await billingContext();
    if ('denied' in gate) return gate.denied;
    const { orgId, customer, subscriptionId } = gate.ctx;

    if (!subscriptionId) return json({ error: 'No tienes una suscripción activa que cancelar.' }, 409);

    let body: any = {};
    try { body = await request.json(); } catch { /* sin body */ }
    const reanudar = body?.reanudar === true;

    try {
        // El id viene de nuestra propia fila, no del cliente, pero se verifica el
        // dueño igual: una fila desincronizada no puede terminar cancelando la
        // suscripción de otro negocio.
        const sub = await stripe(`/v1/subscriptions/${subscriptionId}`, undefined, 'GET');
        const owner = typeof sub?.customer === 'string' ? sub.customer : sub?.customer?.id;
        if (owner !== customer) return json({ error: 'No encontramos tu suscripción.' }, 404);

        const updated = await stripe(`/v1/subscriptions/${subscriptionId}`, {
            cancel_at_period_end: reanudar ? 'false' : 'true',
        }, 'POST');

        // Se espeja de inmediato para que la UI no dependa de que el webhook
        // llegue antes que el siguiente render.
        await withOrgTx(orgId, sql`
            update orgs set cancel_at_period_end = ${Boolean(updated?.cancel_at_period_end)}
             where id = ${orgId}`);

        await logAudit(orgId, {
            accion: reanudar ? 'billing.cancelacion_revertida' : 'billing.cancelacion_programada',
            entidad: 'org', entidad_id: orgId,
            detalle: subscriptionId, ip: reqIp(request),
        });
        return json({ ok: true, cancelAtPeriodEnd: Boolean(updated?.cancel_at_period_end) });
    } catch {
        return json({ error: 'No pudimos actualizar tu suscripción. Intenta de nuevo.' }, 502);
    }
};

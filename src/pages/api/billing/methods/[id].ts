// PATCH  /api/billing/methods/:id — marcar una tarjeta como predeterminada.
// DELETE /api/billing/methods/:id — eliminarla.
export const prerender = false;

import type { APIRoute } from 'astro';
import { stripe } from '../../../../lib/billing';
import { logAudit, reqIp } from '../../../../lib/db';
import { billingContext, fetchOwned, json } from '../../../../lib/billing-surface';

/** Estados en los que la suscripción todavía depende de una tarjeta viva. */
const NEEDS_CARD = new Set(['active', 'trialing', 'past_due', 'incomplete', 'unpaid']);

export const PATCH: APIRoute = async ({ params, request }) => {
    const gate = await billingContext();
    if ('denied' in gate) return gate.denied;
    const { orgId, customer, subscriptionId } = gate.ctx;

    const owned = await fetchOwned(`/v1/payment_methods/${params.id}`, customer);
    if ('denied' in owned) return owned.denied;

    try {
        // Las DOS, siempre. El customer decide qué se usa en facturas nuevas; la
        // suscripción tiene su propio default y, si se deja atrás, la próxima
        // renovación sigue cobrando a la tarjeta vieja.
        await stripe(`/v1/customers/${customer}`, {
            'invoice_settings[default_payment_method]': String(params.id),
        }, 'POST');
        if (subscriptionId) {
            await stripe(`/v1/subscriptions/${subscriptionId}`, {
                default_payment_method: String(params.id),
            }, 'POST');
        }
        await logAudit(orgId, { accion: 'billing.metodo_predeterminado', entidad: 'org', entidad_id: orgId, detalle: String(params.id), ip: reqIp(request) });
        return json({ ok: true });
    } catch {
        return json({ error: 'No pudimos actualizar tu método de pago. Intenta de nuevo.' }, 502);
    }
};

export const DELETE: APIRoute = async ({ params, request }) => {
    const gate = await billingContext();
    if ('denied' in gate) return gate.denied;
    const { orgId, customer, status } = gate.ctx;

    const owned = await fetchOwned(`/v1/payment_methods/${params.id}`, customer);
    if ('denied' in owned) return owned.denied;

    try {
        // Quedarse sin tarjeta con una suscripción viva es cómo una cuenta cae en
        // impago sin que nadie lo decida. Se bloquea aquí, no se avisa después.
        const list = await stripe('/v1/payment_methods', { customer, type: 'card', limit: '20' }, 'GET');
        const total = (list?.data ?? []).length;
        if (total <= 1 && status && NEEDS_CARD.has(status)) {
            return json({
                error: 'Es tu única tarjeta y tu suscripción sigue activa. Agrega otra antes de eliminarla.',
                code: 'last_payment_method',
            }, 409);
        }

        await stripe(`/v1/payment_methods/${params.id}/detach`, {}, 'POST');
        await logAudit(orgId, { accion: 'billing.metodo_eliminado', entidad: 'org', entidad_id: orgId, detalle: String(params.id), ip: reqIp(request) });
        return json({ ok: true });
    } catch {
        return json({ error: 'No pudimos eliminar la tarjeta. Intenta de nuevo.' }, 502);
    }
};

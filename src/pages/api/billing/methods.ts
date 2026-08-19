// GET  /api/billing/methods — tarjetas guardadas de la org y cuál es la predeterminada.
// POST /api/billing/methods — inicia el alta de una tarjeta nueva (SetupIntent).
//
// Sustituye la sección de método de pago del Customer Portal. Los datos de la
// tarjeta NUNCA tocan a Cord: el navegador los manda directo al procesador con
// Payment Element, y aquí solo viaja el `client_secret` del intento.
export const prerender = false;

import type { APIRoute } from 'astro';
import { stripe } from '../../../lib/billing';
import { logAudit, reqIp } from '../../../lib/db';
import { billingContext, json } from '../../../lib/billing-surface';

export const GET: APIRoute = async () => {
    const gate = await billingContext();
    if ('denied' in gate) return gate.denied;
    const { customer, subscriptionId } = gate.ctx;

    try {
        // La predeterminada puede vivir en dos lugares y no siempre coinciden: la
        // de la suscripción es la que realmente cobra la próxima factura, así que
        // manda sobre la del customer.
        const [list, cus, sub] = await Promise.all([
            stripe('/v1/payment_methods', { customer, type: 'card', limit: '20' }, 'GET'),
            stripe(`/v1/customers/${customer}`, undefined, 'GET'),
            subscriptionId
                ? stripe(`/v1/subscriptions/${subscriptionId}`, undefined, 'GET').catch(() => null)
                : Promise.resolve(null),
        ]);

        const idOf = (v: any) => (typeof v === 'string' ? v : v?.id || null);
        const defaultId = idOf(sub?.default_payment_method) ?? idOf(cus?.invoice_settings?.default_payment_method);

        return json({
            methods: (list?.data ?? []).map((pm: any) => ({
                id: pm.id,
                brand: pm.card?.brand ?? null,
                last4: pm.card?.last4 ?? null,
                expMonth: pm.card?.exp_month ?? null,
                expYear: pm.card?.exp_year ?? null,
                isDefault: pm.id === defaultId,
            })),
        });
    } catch {
        return json({ error: 'No pudimos cargar tus métodos de pago. Intenta de nuevo.' }, 502);
    }
};

export const POST: APIRoute = async ({ request }) => {
    const gate = await billingContext();
    if ('denied' in gate) return gate.denied;
    const { orgId, customer } = gate.ctx;

    try {
        const intent = await stripe('/v1/setup_intents', {
            customer,
            // off_session: la tarjeta se guarda para cobrar la renovación sin que
            // el titular esté presente. Sin esto el banco puede rechazar el cargo
            // recurrente por falta de mandato.
            usage: 'off_session',
            'payment_method_types[0]': 'card',
            'metadata[org_id]': orgId,
        }, 'POST');
        await logAudit(orgId, { accion: 'billing.metodo_alta_inicio', entidad: 'org', entidad_id: orgId, detalle: 'SetupIntent', ip: reqIp(request) });
        return json({ client_secret: intent.client_secret });
    } catch {
        return json({ error: 'No pudimos iniciar el alta de la tarjeta. Intenta de nuevo.' }, 502);
    }
};

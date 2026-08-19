// POST /api/billing/pagar — liquidar la factura pendiente de la suscripción.
//
// Este endpoint es el que impide que retirar el portal deje a alguien atrapado.
// Cuando una tarjeta rebota, la suscripción entra en `past_due` y hasta ago 2026
// la ÚNICA forma de pagar era el Customer Portal. Sin esto, el negocio veía un
// aviso de impago y ningún botón que lo resolviera.
export const prerender = false;

import type { APIRoute } from 'astro';
import { logAudit, reqIp } from '../../../lib/db';
import { stripe } from '../../../lib/billing';
import { billingContext, json } from '../../../lib/billing-surface';
import { fromMinorUnits } from '../../../lib/currency';

export const POST: APIRoute = async ({ request }) => {
    const gate = await billingContext();
    if ('denied' in gate) return gate.denied;
    const { orgId, customer } = gate.ctx;

    try {
        // Se busca por customer y estado, no por un id que mande el cliente: así
        // no hay forma de pedir el secreto de pago de una factura ajena.
        const list = await stripe('/v1/invoices', {
            customer,
            status: 'open',
            limit: '1',
            'expand[0]': 'data.confirmation_secret',
        }, 'GET');

        const invoice = list?.data?.[0];
        if (!invoice) return json({ error: 'No tienes ningún cobro pendiente.', code: 'nothing_due' }, 409);

        const clientSecret = invoice?.confirmation_secret?.client_secret;
        if (!clientSecret) {
            return json({ error: 'No pudimos preparar el pago. Intenta de nuevo en unos minutos.' }, 502);
        }

        await logAudit(orgId, { accion: 'billing.pago_pendiente_inicio', entidad: 'org', entidad_id: orgId, detalle: String(invoice.id), ip: reqIp(request) });
        return json({
            client_secret: clientSecret,
            invoice: {
                id: invoice.id,
                number: invoice.number ?? null,
                currency: String(invoice.currency || '').toUpperCase(),
                amountDue: fromMinorUnits(Number(invoice.amount_due || 0), String(invoice.currency || 'mxn')),
            },
        });
    } catch {
        return json({ error: 'No pudimos preparar el pago. Intenta de nuevo.' }, 502);
    }
};

// Compatibility endpoint: keep the { url } contract, but use the same public
// payment page and durable attempts as the current UI. Never create a second
// hosted Checkout Session here. Existing provider sessions require cutover review.
export const prerender = false;

import type { APIRoute } from 'astro';
import { sql, resolvePublicQuote, withOrgTx } from '../../../../lib/db';
import { normalizeCurrency, stripeSupportsCurrency } from '../../../../lib/currency';
import { limitPublicPayment } from '../../../../lib/connect-security';

export const POST: APIRoute = async ({ params, request }) => {
    const token = params.token ?? '';
    const limited = await limitPublicPayment(request, 'checkout', token, 6);
    if (limited) return limited;
    const identity = await resolvePublicQuote(token);
    if (!identity) return json({ error: 'Cotización no encontrada' }, 404);
    const [rows] = await withOrgTx(identity.orgId, sql`
        select c.id, c.org_id, c.status, c.base_currency,
               o.sandbox_of, o.stripe_account_id, o.stripe_charges_enabled,
               o.acepta_tarjeta, o.cobro_spei_auto, o.moneda
        from cotizaciones c join orgs o on o.id = c.org_id
        where c.id = ${identity.id} and c.org_id = ${identity.orgId}`);
    if (!rows.length) return json({ error: 'Cotización no encontrada' }, 404);
    const c = rows[0];
    if (!['approved', 'invoiced'].includes(c.status as string)) {
        return json({ error: 'Esta cotización no está lista para pago' }, 409);
    }
    if (c.sandbox_of) {
        return json({ error: 'Esta cotización es de prueba — el pago en línea está deshabilitado.' }, 409);
    }
    if (!c.stripe_account_id || !c.stripe_charges_enabled) {
        return json({ error: 'El vendedor no tiene configurada su cuenta para recibir pagos' }, 403);
    }
    if (!c.acepta_tarjeta && !c.cobro_spei_auto) {
        return json({ error: 'El vendedor no acepta pagos en línea' }, 403);
    }
    const currency = normalizeCurrency((c.base_currency as string) || (c.moneda as string));
    if (!stripeSupportsCurrency(currency)) {
        return json({ error: 'El pago en línea todavía no está disponible para la moneda de esta cotización.' }, 409);
    }
    // No change to checkout_v2, accepted fee terms or the chosen installment.
    // The payment page resolves the current balance and method under its guards.
    return json({ url: new URL(`/q/${encodeURIComponent(token)}/pay`, request.url).toString() });
};

function json(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
}

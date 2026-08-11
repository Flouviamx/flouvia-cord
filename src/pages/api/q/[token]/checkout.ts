// POST /api/q/[token]/checkout — crea una sesión de Stripe Checkout para que el
// cliente pague la cotización desde el link público. Stripe vía REST (sin SDK).
// Requiere STRIPE_SECRET_KEY; el webhook (/api/stripe/webhook) marca 'paid'.
export const prerender = false;

import type { APIRoute } from 'astro';
import { sql, resolvePublicQuote, withOrgTx } from '../../../../lib/db';
import { rateLimit, tooMany } from '../../../../lib/ratelimit';
import { payerError } from '../../../../lib/pay-errors';

const STRIPE_KEY = import.meta.env.STRIPE_SECRET_KEY || process.env.STRIPE_SECRET_KEY;

export const POST: APIRoute = async ({ params, request }) => {
    if (!STRIPE_KEY) return json({ error: 'El pago en línea aún no está configurado.' }, 503);
    const token = params.token ?? '';
    // Crear sesiones de Stripe es costoso/abusable: límite estricto por token.
    const rl = await rateLimit(`checkout:${token}`, 6, 60);
    if (!rl.ok) return tooMany(rl.retryAfter);
    const identity = await resolvePublicQuote(token);
    if (!identity) return json({ error: 'Cotización no encontrada' }, 404);
    const [rows] = await withOrgTx(identity.orgId, sql`
        select c.id, c.org_id, c.folio, c.total, c.status,
               o.sandbox_of, o.stripe_account_id, o.stripe_charges_enabled, 
               o.acepta_tarjeta, o.cobro_spei_auto, o.checkout_v2
        from cotizaciones c join orgs o on o.id = c.org_id
        where c.id = ${identity.id} and c.org_id = ${identity.orgId}`);
    if (!rows.length) return json({ error: 'Cotización no encontrada' }, 404);
    const c = rows[0];
    if (c.checkout_v2) return json({ error: 'Este flujo de pago ya no está disponible' }, 410);
    if (!['approved', 'invoiced'].includes(c.status as string)) {
        return json({ error: 'Esta cotización no está lista para pago' }, 409);
    }
    // Cotización del ENTORNO DE PRUEBA: jamás cobrar dinero real.
    if (c.sandbox_of) {
        return json({ error: 'Esta cotización es de prueba — el pago en línea está deshabilitado. El vendedor puede registrar el pago manualmente para simular el flujo.' }, 409);
    }
    if (!c.stripe_account_id || !c.stripe_charges_enabled) {
        return json({ error: 'El vendedor no tiene configurada su cuenta para recibir pagos' }, 403);
    }
    if (!c.acepta_tarjeta && !c.cobro_spei_auto) {
        return json({ error: 'El vendedor no acepta pagos en línea' }, 403);
    }

    const origin = new URL(request.url).origin;
    const amount = Math.round(Number(c.total) * 100); // centavos
    const form = new URLSearchParams();
    form.set('mode', 'payment');
    form.set('success_url', `${origin}/q/${token}?pagado=1`);
    form.set('cancel_url', `${origin}/q/${token}`);
    form.set('line_items[0][quantity]', '1');
    form.set('line_items[0][price_data][currency]', 'mxn');
    form.set('line_items[0][price_data][unit_amount]', String(amount));
    form.set('line_items[0][price_data][product_data][name]', `Cotización ${c.folio}`);
    form.set('metadata[token]', token);
    form.set('metadata[cotizacion_id]', c.id as string);

    let pmtIdx = 0;
    if (c.acepta_tarjeta) {
        form.set(`payment_method_types[${pmtIdx}]`, 'card');
        pmtIdx++;
    }
    if (c.cobro_spei_auto) {
        form.set(`payment_method_types[${pmtIdx}]`, 'customer_balance');
        form.set('payment_method_options[customer_balance][funding_type]', 'bank_transfer');
        form.set('payment_method_options[customer_balance][bank_transfer][type]', 'mx_bank_transfer');
    }

    const acct = c.stripe_account_id as string;
    const connectHeaders = {
        Authorization: `Bearer ${STRIPE_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Stripe-Account': acct,
    };

    try {
        // SPEI (customer_balance) EXIGE un customer en la sesión: Stripe le asigna
        // una CLABE única a ESE customer. Lo creamos en la CUENTA CONECTADA del
        // dueño (mismo header Stripe-Account), no en la plataforma.
        if (c.cobro_spei_auto) {
            const cusForm = new URLSearchParams();
            cusForm.set('metadata[cotizacion_id]', c.id as string);
            const cusRes = await fetch('https://api.stripe.com/v1/customers', {
                method: 'POST', headers: connectHeaders, body: cusForm.toString(),
            });
            const cus: any = await cusRes.json();
            if (!cusRes.ok || !cus?.id) {
                const safe = payerError(cus?.error);
                return json({ error: safe.message, reference: safe.reference }, 502);
            }
            form.set('customer', cus.id);
        }

        const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
            method: 'POST',
            headers: connectHeaders,
            body: form.toString(),
        });
        const data: any = await res.json();
        if (!res.ok) {
            const safe = payerError(data?.error);
            return json({ error: safe.message, reference: safe.reference }, 502);
        }
        return json({ url: data.url });
    } catch (error) {
        const safe = payerError(error);
        return json({ error: safe.message, reference: safe.reference }, 502);
    }
};

function json(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

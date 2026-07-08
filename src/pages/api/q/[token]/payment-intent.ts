export const prerender = false;

import type { APIRoute } from 'astro';
import { sql } from '../../../../lib/db';
import { rateLimit, tooMany } from '../../../../lib/ratelimit';

const STRIPE_KEY = import.meta.env.STRIPE_SECRET_KEY || process.env.STRIPE_SECRET_KEY;

export const POST: APIRoute = async ({ params, request }) => {
    if (!STRIPE_KEY) return json({ error: 'El pago en línea aún no está configurado.' }, 503);
    const token = params.token ?? '';
    const rl = await rateLimit(`pi:${token}`, 10, 60);
    if (!rl.ok) return tooMany(rl.retryAfter);
    
    const rows = await sql`
        select c.id, c.folio, c.total, c.status, 
               o.sandbox_of, o.stripe_account_id, o.stripe_charges_enabled, 
               o.acepta_tarjeta, o.cobro_spei_auto
        from cotizaciones c join orgs o on o.id = c.org_id
        where c.public_token = ${token}`;
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

    const amount = Math.round(Number(c.total) * 100); // centavos
    const acct = c.stripe_account_id as string;
    const connectHeaders = {
        Authorization: `Bearer ${STRIPE_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Stripe-Account': acct,
    };

    try {
        let customerId = '';
        if (c.cobro_spei_auto) {
            const cusForm = new URLSearchParams();
            cusForm.set('metadata[cotizacion_id]', c.id as string);
            const cusRes = await fetch('https://api.stripe.com/v1/customers', {
                method: 'POST', headers: connectHeaders, body: cusForm.toString(),
            });
            const cus: any = await cusRes.json();
            if (!cusRes.ok || !cus?.id) return json({ error: cus?.error?.message || 'No se pudo iniciar el pago' }, 502);
            customerId = cus.id;
        }

        const form = new URLSearchParams();
        form.set('amount', String(amount));
        form.set('currency', 'mxn');
        form.set('metadata[token]', token);
        form.set('metadata[cotizacion_id]', c.id as string);
        
        let pmtIdx = 0;
        if (c.acepta_tarjeta) {
            form.set(`payment_method_types[${pmtIdx}]`, 'card');
            pmtIdx++;
        }
        if (c.cobro_spei_auto) {
            form.set(`payment_method_types[${pmtIdx}]`, 'customer_balance');
            form.set('payment_method_data[type]', 'customer_balance');
            form.set('payment_method_options[customer_balance][funding_type]', 'bank_transfer');
            form.set('payment_method_options[customer_balance][bank_transfer][type]', 'mx_bank_transfer');
            if (customerId) {
                form.set('customer', customerId);
            }
        }

        const res = await fetch('https://api.stripe.com/v1/payment_intents', {
            method: 'POST',
            headers: connectHeaders,
            body: form.toString(),
        });
        const data: any = await res.json();
        
        if (!res.ok) return json({ error: data?.error?.message || 'Error al crear el intento de pago' }, 502);
        
        const pubKey = import.meta.env.PUBLIC_STRIPE_PUBLISHABLE_KEY || process.env.PUBLIC_STRIPE_PUBLISHABLE_KEY;
        return json({ clientSecret: data.client_secret, publishableKey: pubKey, accountId: acct });
    } catch (e) {
        console.error(e);
        return json({ error: 'No se pudo conectar con Stripe' }, 502);
    }
};

function json(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

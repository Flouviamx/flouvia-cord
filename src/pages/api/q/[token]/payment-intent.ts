export const prerender = false;

import type { APIRoute } from 'astro';
import { sql } from '../../../../lib/db';
import { rateLimit, tooMany } from '../../../../lib/ratelimit';

const STRIPE_KEY = import.meta.env.STRIPE_SECRET_KEY || process.env.STRIPE_SECRET_KEY;

export const POST: APIRoute = async ({ params }) => {
    if (!STRIPE_KEY) return json({ error: 'El pago en línea aún no está configurado.' }, 503);
    const token = params.token ?? '';
    const rl = await rateLimit(`pi:${token}`, 10, 60);
    if (!rl.ok) return tooMany(rl.retryAfter);

    const rows = await sql`
        select c.id, c.folio, c.total, c.status, c.stripe_payment_intent_id,
               o.sandbox_of, o.stripe_account_id, o.stripe_charges_enabled,
               o.acepta_tarjeta, o.cobro_spei_auto, o.nombre as org_nombre
        from cotizaciones c join orgs o on o.id = c.org_id
        where c.public_token = ${token}`;
    if (!rows.length) return json({ error: 'Cotización no encontrada' }, 404);
    const c = rows[0];
    if (c.status === 'paid') {
        return json({ alreadyPaid: true });
    }
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
    const pubKey = import.meta.env.PUBLIC_STRIPE_PUBLISHABLE_KEY || process.env.PUBLIC_STRIPE_PUBLISHABLE_KEY;

    // Los payment_method_types según la config vigente del vendedor. Se calculan
    // aquí porque también deciden si un PI previo sigue siendo reutilizable.
    const pmTypes: string[] = [];
    if (c.acepta_tarjeta) pmTypes.push('card');
    if (c.cobro_spei_auto) pmTypes.push('customer_balance');

    try {
        // ── 1) Reutilizar el PaymentIntent existente si sigue vigente ─────────
        // Crucial para SPEI: la CLABE se asigna por customer — un PI/customer nuevo
        // en cada visita significaría una CLABE distinta en cada recarga.
        const prevId = c.stripe_payment_intent_id as string | null;
        if (prevId) {
            const prevRes = await fetch(`https://api.stripe.com/v1/payment_intents/${prevId}`, {
                headers: connectHeaders,
            });
            const prev: any = await prevRes.json();
            if (prevRes.ok && prev?.id) {
                if (prev.status === 'succeeded') {
                    return json({ alreadyPaid: true });
                }
                const sameMethods = Array.isArray(prev.payment_method_types)
                    && prev.payment_method_types.length === pmTypes.length
                    && pmTypes.every((t) => prev.payment_method_types.includes(t));
                const reusable = !['canceled'].includes(prev.status) && sameMethods;
                if (reusable) {
                    // Si el total cambió (cotización re-versionada), se actualiza el monto.
                    if (prev.amount !== amount && ['requires_payment_method', 'requires_confirmation'].includes(prev.status)) {
                        const upd = new URLSearchParams({ amount: String(amount) });
                        await fetch(`https://api.stripe.com/v1/payment_intents/${prevId}`, {
                            method: 'POST', headers: connectHeaders, body: upd.toString(),
                        });
                    }
                    return json({ clientSecret: prev.client_secret, publishableKey: pubKey, accountId: acct, amount });
                }
            }
            // No existe / cancelado / cambió la config → crear uno nuevo abajo.
        }

        // ── 2) Customer (solo requerido por customer_balance / SPEI) ──────────
        let customerId = '';
        if (c.cobro_spei_auto) {
            const cusForm = new URLSearchParams();
            cusForm.set('metadata[cotizacion_id]', c.id as string);
            cusForm.set('description', `Cliente de cotización ${c.folio}`);
            const cusRes = await fetch('https://api.stripe.com/v1/customers', {
                method: 'POST', headers: connectHeaders, body: cusForm.toString(),
            });
            const cus: any = await cusRes.json();
            if (!cusRes.ok || !cus?.id) return json({ error: cus?.error?.message || 'No se pudo iniciar el pago' }, 502);
            customerId = cus.id;
        }

        // ── 3) Crear el PaymentIntent ─────────────────────────────────────────
        // NO se manda payment_method_data: el Payment Element decide el método al
        // confirmar. Forzarlo a customer_balance aquí rompía el pago con tarjeta
        // cuando ambos métodos estaban activos.
        const form = new URLSearchParams();
        form.set('amount', String(amount));
        form.set('currency', 'mxn');
        form.set('description', `Cotización ${c.folio} — ${c.org_nombre}`);
        form.set('metadata[token]', token);
        form.set('metadata[cotizacion_id]', c.id as string);
        form.set('metadata[folio]', String(c.folio ?? ''));
        pmTypes.forEach((t, i) => form.set(`payment_method_types[${i}]`, t));
        if (c.cobro_spei_auto) {
            form.set('payment_method_options[customer_balance][funding_type]', 'bank_transfer');
            form.set('payment_method_options[customer_balance][bank_transfer][type]', 'mx_bank_transfer');
        }
        if (customerId) form.set('customer', customerId);

        const res = await fetch('https://api.stripe.com/v1/payment_intents', {
            method: 'POST',
            headers: connectHeaders,
            body: form.toString(),
        });
        const data: any = await res.json();
        if (!res.ok) return json({ error: data?.error?.message || 'Error al crear el intento de pago' }, 502);

        await sql`update cotizaciones set stripe_payment_intent_id = ${data.id} where id = ${c.id}`;

        return json({ clientSecret: data.client_secret, publishableKey: pubKey, accountId: acct, amount });
    } catch (e) {
        console.error(e);
        return json({ error: 'No se pudo conectar con Stripe' }, 502);
    }
};

function json(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

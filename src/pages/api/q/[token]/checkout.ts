// POST /api/q/[token]/checkout — crea una sesión de Stripe Checkout para que el
// cliente pague la cotización desde el link público. Stripe vía REST (sin SDK).
// Requiere STRIPE_SECRET_KEY; el webhook (/api/stripe/webhook) marca 'paid'.
export const prerender = false;

import type { APIRoute } from 'astro';
import { sql } from '../../../../lib/db';

const STRIPE_KEY = import.meta.env.STRIPE_SECRET_KEY || process.env.STRIPE_SECRET_KEY;

export const POST: APIRoute = async ({ params, request }) => {
    if (!STRIPE_KEY) return json({ error: 'El pago en línea aún no está configurado.' }, 503);
    const token = params.token ?? '';
    const rows = await sql`select id, folio, total, status from cotizaciones where public_token = ${token}`;
    if (!rows.length) return json({ error: 'Cotización no encontrada' }, 404);
    const c = rows[0];
    if (!['approved', 'invoiced'].includes(c.status as string)) {
        return json({ error: 'Esta cotización no está lista para pago' }, 409);
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

    try {
        const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
            method: 'POST',
            headers: { Authorization: `Bearer ${STRIPE_KEY}`, 'Content-Type': 'application/x-www-form-urlencoded' },
            body: form.toString(),
        });
        const data: any = await res.json();
        if (!res.ok) return json({ error: data?.error?.message || 'No se pudo iniciar el pago' }, 502);
        return json({ url: data.url });
    } catch {
        return json({ error: 'No se pudo conectar con Stripe' }, 502);
    }
};

function json(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

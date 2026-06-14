// POST /api/stripe/webhook — Stripe avisa cuando el cliente paga.
// En checkout.session.completed marca la cotización como 'paid'. Verifica la firma
// con STRIPE_WEBHOOK_SECRET (HMAC, sin SDK). Configura el endpoint en el dashboard
// de Stripe apuntando a https://trato.flouvia.com/api/stripe/webhook.
export const prerender = false;

import type { APIRoute } from 'astro';
import crypto from 'node:crypto';
import { sql, logAudit } from '../../../lib/db';

const WH_SECRET = import.meta.env.STRIPE_WEBHOOK_SECRET || process.env.STRIPE_WEBHOOK_SECRET;

export const POST: APIRoute = async ({ request }) => {
    const raw = await request.text();

    // Verificación de firma (si hay secreto configurado).
    if (WH_SECRET) {
        try {
            const sig = request.headers.get('stripe-signature') || '';
            const parts = Object.fromEntries(sig.split(',').map((p) => p.split('=')));
            const expected = crypto.createHmac('sha256', WH_SECRET).update(`${parts.t}.${raw}`).digest('hex');
            const a = Buffer.from(parts.v1 || '', 'hex');
            const b = Buffer.from(expected, 'hex');
            if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
                return new Response('firma inválida', { status: 400 });
            }
        } catch {
            return new Response('firma inválida', { status: 400 });
        }
    }

    let event: any;
    try { event = JSON.parse(raw); } catch { return new Response('payload inválido', { status: 400 }); }

    if (event.type === 'checkout.session.completed') {
        const cid = event.data?.object?.metadata?.cotizacion_id;
        if (cid) {
            const rows = await sql`select id, org_id, status from cotizaciones where id = ${cid}`;
            if (rows.length && ['approved', 'invoiced'].includes(rows[0].status as string)) {
                await sql`update cotizaciones set status = 'paid' where id = ${cid}`;
                await sql`insert into eventos (org_id, cotizacion_id, tipo, detalle)
                          values (${rows[0].org_id}, ${cid}, 'paid', 'Pago recibido vía Stripe')`;
                await logAudit(rows[0].org_id as string, { accion: 'cotizacion.paid', entidad: 'cotizacion', entidad_id: cid, detalle: 'Pago en línea (Stripe)' });
            }
        }
    }

    return new Response(JSON.stringify({ received: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
};

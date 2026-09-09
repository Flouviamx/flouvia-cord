// /api/i/[token] — señales del cliente sobre una factura publicada.
//   POST { action: 'ping' }  → { ok }
//
// Regla 19: una señal del cliente se mide EN EL CLIENTE y con actor. Este
// endpoint existe precisamente para que el SSR de /i/[token] NO marque la
// factura como vista: el mismo GET lo dispara el vendedor revisando su propio
// link, el bot de WhatsApp/Slack armando la tarjeta del enlace y el prefetch
// del navegador. Solo llega aquí un navegador con JavaScript y la pestaña
// visible, y solo cuenta si el actor resuelto es 'client'.
export const prerender = false;

import type { APIRoute } from 'astro';
import { sql, resolvePublicInvoice, withOrgTx } from '../../../lib/db';
import { rateLimit, tooMany } from '../../../lib/ratelimit';
import { resolveViewer } from '../../../lib/public-viewer';
import { logInvoiceEvent } from '../../../lib/fiscal/timeline';
import { publicPaymentIntent } from '../../../lib/fiscal/public-invoice-state';

// Read-only refresh: only this document's ledger can confirm a returned payment.
export const GET: APIRoute = async ({ params, request }) => {
    const token = params.token ?? '';
    const rl = await rateLimit(`istatus:${token}`, 60, 60);
    if (!rl.ok) return json({ error: 'Espera un momento antes de actualizar.' }, 429);
    const identity = await resolvePublicInvoice(token);
    if (!identity) return json({ error: 'Factura no disponible.' }, 404);
    const pi = publicPaymentIntent(new URL(request.url).searchParams.get('payment_intent'));
    const [[row]] = await withOrgTx(identity.orgId, sql`
        select d.lifecycle, d.currency, d.amount_paid, d.amount_remaining,
               d.amount_credited, d.amount_refunded, d.refund_due,
               exists (select 1 from documento_pagos p
                       where p.org_id = d.org_id and p.documento_id = d.id
                         and p.stripe_payment_intent_id = ${pi}) as payment_recorded
          from documentos_fiscales d
         where d.id = ${identity.id} and d.org_id = ${identity.orgId}
           and d.public_token = ${token}
           and d.lifecycle in ('open', 'paid', 'void', 'uncollectible')
         limit 1`);
    if (!row) return json({ error: 'Factura no disponible.' }, 404);
    return json({
        estado: row.lifecycle, currency: row.currency,
        pagado: Number(row.amount_paid), saldo: Number(row.amount_remaining),
        acreditado: Number(row.amount_credited), reembolsado: Number(row.amount_refunded),
        porDevolver: Number(row.refund_due), paymentRecorded: row.payment_recorded === true,
    });
};

export const POST: APIRoute = async ({ params, request, cookies }) => {
    const token = params.token ?? '';
    const rl = await rateLimit(`iping:${token}`, 60, 60);
    if (!rl.ok) return tooMany(rl.retryAfter);

    let action = '';
    try { action = String((await request.json())?.action ?? ''); } catch { /* sin body */ }
    if (action !== 'ping') return json({ error: 'Acción no reconocida' }, 400);

    const identity = await resolvePublicInvoice(token);
    // 200 y no 404: este endpoint no es un oráculo de existencia de tokens.
    if (!identity) return json({ ok: true });

    const viewer = await resolveViewer(identity.orgId, { request, cookies }, { crearCookie: true });
    // El vendedor previsualizando y los crawlers no generan señal. Es la mitad
    // entera del punto de la regla: no es la lista de User-Agent lo que protege,
    // es dónde y con qué actor se mide.
    if (viewer.rol !== 'client') return json({ ok: true });

    const [tocada] = await withOrgTx(identity.orgId, sql`
        update documentos_fiscales
           set first_viewed_at = coalesce(first_viewed_at, now()),
               last_viewed_at = now()
         where id = ${identity.id} and org_id = ${identity.orgId}
           and lifecycle <> 'draft'
        returning (first_viewed_at = now()) as primera`);

    // El timeline registra la PRIMERA vista, no cada latido: un feed con
    // cincuenta "el cliente abrió el link" no dice nada que el vendedor pueda
    // usar. Y llega aquí solo cuando el actor es el cliente — el vendedor
    // revisando su propio link no escribe historia (regla 19).
    if (tocada?.[0]?.primera) {
        await logInvoiceEvent(identity.orgId, identity.id, 'viewed', 'El cliente abrió la factura');
    }
    return json({ ok: true });
};

function json(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), { status, headers: {
        'Content-Type': 'application/json', 'Cache-Control': 'private, no-store',
        'Referrer-Policy': 'no-referrer', 'X-Robots-Tag': 'noindex, nofollow',
        'X-Content-Type-Options': 'nosniff',
    } });
}

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

    await withOrgTx(identity.orgId, sql`
        update documentos_fiscales
           set first_viewed_at = coalesce(first_viewed_at, now()),
               last_viewed_at = now()
         where id = ${identity.id} and org_id = ${identity.orgId}
           and lifecycle <> 'draft'`);
    return json({ ok: true });
};

function json(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

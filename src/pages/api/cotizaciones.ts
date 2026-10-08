// POST /api/cotizaciones — crea una cotización real en Neon (borrador o enviada).
// Body JSON: { cliente_id, terminos, vigencia_dias, notas, send, items: [...] }
//   items[]: { producto_id?, descripcion, cantidad, precio_unitario, precio_negociado|null }
// Responde: { id, folio, token }
// La lógica de creación vive en src/lib/cotizaciones.ts (compartida con /api/v1).
export const prerender = false;

import type { APIRoute } from 'astro';
import { getActiveOrgId, reqIp } from '../../lib/db';
import { requirePerm } from '../../lib/queries';
import { createCotizacion, QuoteError } from '../../lib/cotizaciones';

export const POST: APIRoute = async ({ request }) => {
    const denied = await requirePerm('cotizar');
    if (denied) return denied;

    let body: any;
    try { body = await request.json(); }
    catch { return json({ error: 'JSON inválido' }, 400); }

    const orgId = await getActiveOrgId();
    try {
        const result = await createCotizacion(orgId, body, {
            origin: new URL(request.url).origin,
            ip: reqIp(request),
        });
        return json(result);
    } catch (e) {
        if (e instanceof QuoteError) return json({ error: e.message, ...(e.code ? { code: e.code } : {}) }, e.status);
        throw e;
    }
};

function json(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), {
        status, headers: { 'Content-Type': 'application/json' },
    });
}

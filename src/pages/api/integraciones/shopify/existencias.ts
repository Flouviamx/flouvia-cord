// POST /api/integraciones/shopify/existencias { ids: [productoId] } → { existencias: { id: n | null } }
// El editor de cotizaciones pregunta por las existencias al momento de los
// productos que vienen de la tienda. Ruta interna, protegida por la sesión.
export const prerender = false;

import type { APIRoute } from 'astro';
import { getActiveOrgId } from '../../../../lib/db';
import { rateLimit, tooMany } from '../../../../lib/ratelimit';
import { log } from '../../../../lib/log';
import { refrescarExistencias } from '../../../../lib/integraciones/shopify/service';

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

export const POST: APIRoute = async ({ request }) => {
    const orgId = await getActiveOrgId();
    const rl = await rateLimit(`shopify-existencias:${orgId}`, 60, 60);
    if (!rl.ok) return tooMany(rl.retryAfter);
    let body: any;
    try { body = await request.json(); } catch { return json({ error: 'invalid_request' }, 400); }
    const ids = Array.isArray(body?.ids) ? body.ids.map(String) : [];
    try {
        return json({ existencias: await refrescarExistencias(orgId, ids) });
    } catch (err) {
        log.error('no se pudieron leer las existencias de Shopify', { route: 'shopify-existencias', orgId, err });
        return json({ existencias: {} });
    }
};

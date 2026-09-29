// GET /api/integraciones/shopify/precios?cliente=<id> → { empresa, moneda, precios } | {}
// La lista de precios B2B de Shopify del cliente, para el editor. Ruta interna,
// protegida por la sesión. Una tienda sin B2B responde vacío.
export const prerender = false;

import type { APIRoute } from 'astro';
import { getActiveOrgId } from '../../../../lib/db';
import { rateLimit, tooMany } from '../../../../lib/ratelimit';
import { log } from '../../../../lib/log';
import { preciosB2B } from '../../../../lib/integraciones/shopify/precios';

const json = (data: unknown) => new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

export const GET: APIRoute = async ({ url }) => {
    const orgId = await getActiveOrgId();
    const rl = await rateLimit(`shopify-precios:${orgId}`, 60, 60);
    if (!rl.ok) return tooMany(rl.retryAfter);
    try {
        return json((await preciosB2B(orgId, url.searchParams.get('cliente') || '')) ?? {});
    } catch (err) {
        log.error('no se pudo leer la lista B2B de Shopify', { route: 'shopify-precios', orgId, err });
        return json({});
    }
};

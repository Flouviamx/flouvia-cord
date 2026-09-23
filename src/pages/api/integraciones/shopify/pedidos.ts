// /api/integraciones/shopify/pedidos — cuándo crear el pedido en la tienda.
//   POST { disparador: 'no' | 'aprobada' | 'pagada' } → { ok }
export const prerender = false;

import type { APIRoute } from 'astro';
import { getActiveOrgId, logAudit, reqIp } from '../../../../lib/db';
import { requirePerm } from '../../../../lib/queries';
import { currentLocale } from '../../../../lib/context';
import { strictRateLimit, strictLimitResponse } from '../../../../lib/ratelimit';
import { DISPARADORES, guardarDisparador, type DisparadorPedido } from '../../../../lib/integraciones/shopify/orders';
import { t } from '../../../../i18n/app';

export const POST: APIRoute = async ({ request }) => {
    const denied = await requirePerm('ajustes'); if (denied) return denied;
    const L = currentLocale();
    const orgId = await getActiveOrgId();
    const limitado = strictLimitResponse(await strictRateLimit(`shopify-pedidos:${orgId}`, 20, 60));
    if (limitado) return limitado;

    let body: any;
    try { body = await request.json(); } catch { body = {}; }
    const disparador = String(body?.disparador ?? '') as DisparadorPedido;
    if (!DISPARADORES.includes(disparador)) return json({ error: t(L, 'shopify.err.disparador') }, 400);

    if (!(await guardarDisparador(orgId, disparador))) {
        return json({ error: t(L, 'shopify.err.sin_conexion') }, 409);
    }
    await logAudit(orgId, {
        accion: 'integracion.shopify_pedidos', entidad: 'org', entidad_id: orgId,
        detalle: `Pedidos en Shopify: ${disparador}`, ip: reqIp(request),
    });
    return json({ ok: true });
};

function json(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

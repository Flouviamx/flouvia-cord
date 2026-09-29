// /api/integraciones/shopify/facturas — facturar en Cord los pedidos pagados de la tienda.
//   POST { valor: 'no' | 'pagado' } → { ok }
export const prerender = false;

import type { APIRoute } from 'astro';
import { getActiveOrgId, logAudit, reqIp } from '../../../../lib/db';
import { requirePerm } from '../../../../lib/queries';
import { currentLocale } from '../../../../lib/context';
import { strictRateLimit, strictLimitResponse } from '../../../../lib/ratelimit';
import { DISPARADORES_FACTURA, guardarFacturas, type DisparadorFactura } from '../../../../lib/integraciones/shopify/facturas';
import { siteOrigin } from '../../../../lib/email';
import { t } from '../../../../i18n/app';

export const POST: APIRoute = async ({ request }) => {
    const denied = await requirePerm('ajustes'); if (denied) return denied;
    const L = currentLocale();
    const orgId = await getActiveOrgId();
    const limitado = strictLimitResponse(await strictRateLimit(`shopify-facturas:${orgId}`, 20, 60));
    if (limitado) return limitado;

    let body: any;
    try { body = await request.json(); } catch { body = {}; }
    const valor = String(body?.valor ?? '') as DisparadorFactura;
    if (!DISPARADORES_FACTURA.includes(valor)) return json({ error: t(L, 'shopify.err.disparador') }, 400);

    if (!(await guardarFacturas(orgId, valor, `${siteOrigin()}/api/integraciones/shopify/webhook`))) {
        return json({ error: t(L, 'shopify.err.sin_conexion') }, 409);
    }
    await logAudit(orgId, {
        accion: 'integracion.shopify_facturas', entidad: 'org', entidad_id: orgId,
        detalle: `Facturar pedidos de Shopify: ${valor}`, ip: reqIp(request),
    });
    return json({ ok: true });
};

function json(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

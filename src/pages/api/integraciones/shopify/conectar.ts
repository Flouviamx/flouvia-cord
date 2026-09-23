// /api/integraciones/shopify/conectar — "Conectar Shopify".
//   POST { shop } → { redirect }   DELETE → { ok }  (desconecta)
export const prerender = false;

import type { APIRoute } from 'astro';
import { getActiveOrgId, logAudit, reqIp } from '../../../../lib/db';
import { requirePerm } from '../../../../lib/queries';
import { currentUserId, currentLocale } from '../../../../lib/context';
import { strictRateLimit, strictLimitResponse } from '../../../../lib/ratelimit';
import { createOAuthState } from '../../../../lib/integraciones/conexiones';
import { normalizeShopDomain, shopifyCredentials } from '../../../../lib/integraciones/shopify/config';
import { shopifyInstallUrl } from '../../../../lib/integraciones/shopify/oauth';
import { disconnectShopify } from '../../../../lib/integraciones/shopify/service';
import { siteOrigin } from '../../../../lib/email';
import { t } from '../../../../i18n/app';

export const POST: APIRoute = async ({ request }) => {
    const denied = await requirePerm('ajustes'); if (denied) return denied;
    const L = currentLocale();
    const orgId = await getActiveOrgId();
    const limitado = strictLimitResponse(await strictRateLimit(`shopify-connect:${orgId}`, 10, 60));
    if (limitado) return limitado;

    if (!shopifyCredentials()) return json({ error: t(L, 'shopify.err.no_disponible') }, 503);
    const userId = currentUserId();
    if (!userId) return json({ error: t(L, 'shopify.err.sesion') }, 401);

    let body: any;
    try { body = await request.json(); } catch { body = {}; }
    // El dominio se normaliza y se valida: con él se arma la dirección a la que
    // Cord manda a la persona, así que no puede ser texto libre.
    const shop = normalizeShopDomain(String(body?.shop ?? ''));
    if (!shop) return json({ error: t(L, 'shopify.err.tienda') }, 400);

    const state = await createOAuthState(orgId, userId, 'shopify');
    const url = shopifyInstallUrl(shop, `${siteOrigin()}/api/integraciones/shopify/callback`, state);
    if (!url) return json({ error: t(L, 'shopify.err.no_disponible') }, 503);
    return json({ redirect: url });
};

export const DELETE: APIRoute = async ({ request }) => {
    const denied = await requirePerm('ajustes'); if (denied) return denied;
    const orgId = await getActiveOrgId();
    const limitado = strictLimitResponse(await strictRateLimit(`shopify-connect:${orgId}`, 10, 60));
    if (limitado) return limitado;
    await disconnectShopify(orgId);
    await logAudit(orgId, { accion: 'integracion.shopify_desconectada', entidad: 'org', entidad_id: orgId, detalle: 'Desconectó Shopify', ip: reqIp(request) });
    return json({ ok: true });
};

function json(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

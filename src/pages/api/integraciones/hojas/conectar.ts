// /api/integraciones/hojas/conectar — "Conectar Google Sheets" / "Conectar Excel".
//   POST { proveedor } → { redirect }   DELETE → { ok }  (desconecta)
export const prerender = false;

import type { APIRoute } from 'astro';
import { getActiveOrgId, logAudit, reqIp } from '../../../../lib/db';
import { requirePerm } from '../../../../lib/queries';
import { currentUserId, currentLocale } from '../../../../lib/context';
import { strictRateLimit, strictLimitResponse } from '../../../../lib/ratelimit';
import { createOAuthState } from '../../../../lib/integraciones/conexiones';
import { credencialesHoja, esProveedorHoja } from '../../../../lib/integraciones/hojas/config';
import { googleAuthorizeUrl } from '../../../../lib/integraciones/hojas/google';
import { excelAuthorizeUrl } from '../../../../lib/integraciones/hojas/excel';
import { desconectarHoja } from '../../../../lib/integraciones/hojas/service';
import { siteOrigin } from '../../../../lib/email';
import { t } from '../../../../i18n/app';

export const REDIRECT_PATH = '/api/integraciones/hojas/callback';

export const POST: APIRoute = async ({ request }) => {
    const denied = await requirePerm('ajustes'); if (denied) return denied;
    const L = currentLocale();
    const orgId = await getActiveOrgId();
    const limitado = strictLimitResponse(await strictRateLimit(`hojas-connect:${orgId}`, 10, 60));
    if (limitado) return limitado;

    const userId = currentUserId();
    if (!userId) return json({ error: t(L, 'hojas.err.sesion') }, 401);

    let body: any;
    try { body = await request.json(); } catch { body = {}; }
    const proveedor = body?.proveedor;
    if (!esProveedorHoja(proveedor)) return json({ error: t(L, 'hojas.err.proveedor') }, 400);
    if (!credencialesHoja(proveedor)) return json({ error: t(L, 'hojas.err.no_disponible') }, 503);

    const state = await createOAuthState(orgId, userId, proveedor);
    const redirectUri = `${siteOrigin()}${REDIRECT_PATH}`;
    const url = proveedor === 'google_sheets'
        ? googleAuthorizeUrl(redirectUri, `${proveedor}.${state}`)
        : excelAuthorizeUrl(redirectUri, `${proveedor}.${state}`);
    if (!url) return json({ error: t(L, 'hojas.err.no_disponible') }, 503);
    return json({ redirect: url });
};

export const DELETE: APIRoute = async ({ request }) => {
    const denied = await requirePerm('ajustes'); if (denied) return denied;
    const orgId = await getActiveOrgId();
    const limitado = strictLimitResponse(await strictRateLimit(`hojas-connect:${orgId}`, 10, 60));
    if (limitado) return limitado;
    await desconectarHoja(orgId);
    await logAudit(orgId, {
        accion: 'integracion.hoja_desconectada', entidad: 'org', entidad_id: orgId,
        detalle: 'Desconectó la hoja de cálculo', ip: reqIp(request),
    });
    return json({ ok: true });
};

function json(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

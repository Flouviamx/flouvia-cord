// /api/integraciones/contabilidad/conectar — QuickBooks Online y Xero.
//   POST { proveedor } → { redirect }   DELETE { proveedor } → { ok }
export const prerender = false;

import type { APIRoute } from 'astro';
import { getActiveOrgId, logAudit, reqIp } from '../../../../lib/db';
import { requirePerm } from '../../../../lib/queries';
import { currentUserId, currentLocale } from '../../../../lib/context';
import { strictRateLimit, strictLimitResponse } from '../../../../lib/ratelimit';
import { createOAuthState } from '../../../../lib/integraciones/conexiones';
import { credencialesConta, esProveedorConta, REDIRECT_CONTA } from '../../../../lib/integraciones/contabilidad/config';
import { qboAuthorizeUrl } from '../../../../lib/integraciones/contabilidad/qbo';
import { xeroAuthorizeUrl } from '../../../../lib/integraciones/contabilidad/xero';
import { desconectarConta } from '../../../../lib/integraciones/contabilidad/service';
import { siteOrigin } from '../../../../lib/email';
import { t } from '../../../../i18n/app';

export const POST: APIRoute = async ({ request }) => {
    const denied = await requirePerm('ajustes'); if (denied) return denied;
    const L = currentLocale();
    const orgId = await getActiveOrgId();
    const limitado = strictLimitResponse(await strictRateLimit(`conta-connect:${orgId}`, 10, 60));
    if (limitado) return limitado;

    const userId = currentUserId();
    if (!userId) return json({ error: t(L, 'conta.err.sesion') }, 401);

    let body: any;
    try { body = await request.json(); } catch { body = {}; }
    if (!esProveedorConta(body?.proveedor)) return json({ error: t(L, 'conta.err.proveedor') }, 400);
    if (!credencialesConta(body.proveedor)) return json({ error: t(L, 'conta.err.no_disponible') }, 503);

    const state = await createOAuthState(orgId, userId, body.proveedor);
    const redirectUri = `${siteOrigin()}${REDIRECT_CONTA}`;
    const url = body.proveedor === 'quickbooks'
        ? qboAuthorizeUrl(redirectUri, `${body.proveedor}.${state}`)
        : xeroAuthorizeUrl(redirectUri, `${body.proveedor}.${state}`);
    if (!url) return json({ error: t(L, 'conta.err.no_disponible') }, 503);
    return json({ redirect: url });
};

export const DELETE: APIRoute = async ({ request }) => {
    const denied = await requirePerm('ajustes'); if (denied) return denied;
    const orgId = await getActiveOrgId();
    const limitado = strictLimitResponse(await strictRateLimit(`conta-connect:${orgId}`, 10, 60));
    if (limitado) return limitado;

    let body: any;
    try { body = await request.json(); } catch { body = {}; }
    if (!esProveedorConta(body?.proveedor)) return json({ error: t(currentLocale(), 'conta.err.proveedor') }, 400);
    await desconectarConta(orgId, body.proveedor);
    await logAudit(orgId, {
        accion: 'integracion.contabilidad_desconectada', entidad: 'org', entidad_id: orgId,
        detalle: `Desconectó ${body.proveedor === 'quickbooks' ? 'QuickBooks' : 'Xero'}`, ip: reqIp(request),
    });
    return json({ ok: true });
};

function json(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

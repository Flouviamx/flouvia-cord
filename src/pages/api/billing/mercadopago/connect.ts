// /api/billing/mercadopago/connect — arranca el alta de Mercado Pago.
//   POST → { redirect }   DELETE → { ok }  (desconecta)
//
// El dinero llega a la cuenta del NEGOCIO: Cord guarda las credenciales que el
// vendedor autoriza y nunca toca su saldo.
export const prerender = false;

import type { APIRoute } from 'astro';
import { getActiveOrgId, logAudit, reqIp, sql, withOrgTx } from '../../../../lib/db';
import { requirePerm } from '../../../../lib/queries';
import { currentUserId, currentLocale } from '../../../../lib/context';
import { strictRateLimit, strictLimitResponse } from '../../../../lib/ratelimit';
import { createOAuthState } from '../../../../lib/integraciones/conexiones';
import { disconnectMp, mpAuthorizeUrl, mpCredentials } from '../../../../lib/mercadopago';
import { supportsMercadoPago } from '../../../../lib/countries';
import { siteOrigin } from '../../../../lib/email';
import { t } from '../../../../i18n/app';

const redirectUri = () => `${siteOrigin()}/api/billing/mercadopago/callback`;

export const POST: APIRoute = async ({ request }) => {
    const denied = await requirePerm('ajustes'); if (denied) return denied;
    const L = currentLocale();
    const orgId = await getActiveOrgId();
    const limitado = strictLimitResponse(await strictRateLimit(`mp-connect:${orgId}`, 10, 60));
    if (limitado) return limitado;

    if (!mpCredentials()) return json({ error: t(L, 'mp.err.no_disponible') }, 503);
    const userId = currentUserId();
    if (!userId) return json({ error: t(L, 'mp.err.sesion') }, 401);

    const [[org]] = await withOrgTx(orgId, sql`select upper(coalesce(country_code, 'MX')) as pais from orgs where id = ${orgId}`);
    // El país se dice ANTES de mandar a nadie al proveedor: un alta que empieza
    // y revienta del otro lado no le explica nada al dueño del negocio (regla 14).
    if (!supportsMercadoPago(String(org?.pais ?? ''))) return json({ error: t(L, 'mp.err.pais') }, 409);

    const state = await createOAuthState(orgId, userId, 'mercadopago');
    const url = mpAuthorizeUrl(redirectUri(), state);
    if (!url) return json({ error: t(L, 'mp.err.no_disponible') }, 503);
    return json({ redirect: url });
};

export const DELETE: APIRoute = async ({ request }) => {
    const denied = await requirePerm('ajustes'); if (denied) return denied;
    const orgId = await getActiveOrgId();
    const limitado = strictLimitResponse(await strictRateLimit(`mp-connect:${orgId}`, 10, 60));
    if (limitado) return limitado;
    await disconnectMp(orgId);
    await logAudit(orgId, { accion: 'cord_pagos.mercadopago_desconectado', entidad: 'org', entidad_id: orgId, detalle: 'Desconectó Mercado Pago', ip: reqIp(request) });
    return json({ ok: true });
};

function json(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

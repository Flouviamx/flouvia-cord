// /api/billing/mercadopago/connect — arranca el alta de Mercado Pago.
//   POST → { redirect }   DELETE → { ok }  (desconecta)
//
// El dinero llega a la cuenta del NEGOCIO: Cord guarda las credenciales que el
// vendedor autoriza y nunca toca su saldo. Por eso conectar, cambiar o quitar
// esa cuenta es decidir A DÓNDE llega el dinero, y se trata igual que cambiar
// la cuenta de depósito de Cord Payments (auditoría oct 2026): permiso
// `cobros_config` —antes bastaba `ajustes`, el de marca y PDF— y
// reautenticación reciente. El `state` de OAuth solo se emite después de la
// reautenticación, así que el regreso del proveedor la hereda.
export const prerender = false;

import type { APIRoute } from 'astro';
import { getActiveOrgId, logAudit, reqIp, sql, withOrgTx } from '../../../../lib/db';
import { requirePerm } from '../../../../lib/queries';
import { currentUserId, currentLocale } from '../../../../lib/context';
import { strictRateLimit, strictLimitResponse } from '../../../../lib/ratelimit';
import { requireFreshAuth } from '../../../../lib/step-up';
import { createOAuthState } from '../../../../lib/integraciones/conexiones';
import { disconnectMp, mpAuthorizeUrl, mpCredentials } from '../../../../lib/mercadopago';
import { supportsMercadoPago } from '../../../../lib/countries';
import { siteOrigin } from '../../../../lib/email';
import { notifyMoneyDestinationChange } from '../../../../lib/auth-email';
import { after } from '../../../../lib/after';
import { t } from '../../../../i18n/app';

const redirectUri = () => `${siteOrigin()}/api/billing/mercadopago/callback`;

export const POST: APIRoute = async ({ request }) => {
    const denied = await requirePerm('cobros_config'); if (denied) return denied;
    const L = currentLocale();
    const orgId = await getActiveOrgId();
    const limitado = strictLimitResponse(await strictRateLimit(`mp-connect:${orgId}`, 10, 60));
    if (limitado) return limitado;
    const staleAuth = await requireFreshAuth();
    if (staleAuth) return staleAuth;

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
    const denied = await requirePerm('cobros_config'); if (denied) return denied;
    const orgId = await getActiveOrgId();
    const limitado = strictLimitResponse(await strictRateLimit(`mp-connect:${orgId}`, 10, 60));
    if (limitado) return limitado;
    const staleAuth = await requireFreshAuth();
    if (staleAuth) return staleAuth;

    const [[antes]] = await withOrgTx(orgId, sql`select mp_user_id, mp_nickname from orgs where id = ${orgId}`);
    await disconnectMp(orgId);
    const detalle = antes?.mp_user_id ? `Cuenta ${antes.mp_user_id}${antes.mp_nickname ? ` (${antes.mp_nickname})` : ''}` : 'Sin cuenta conectada';
    await logAudit(orgId, { accion: 'cord_pagos.mercadopago_desconectado', entidad: 'org', entidad_id: orgId, detalle: `Desconectó Mercado Pago; ${detalle}`, ip: reqIp(request) });
    if (antes?.mp_user_id) {
        after(notifyMoneyDestinationChange(orgId, 'mp_desconectado', { detalle, actorUserId: currentUserId(), ip: reqIp(request) }));
    }
    return json({ ok: true });
};

function json(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

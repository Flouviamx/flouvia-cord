// /api/integraciones/teams/conectar — "Conectar con Microsoft".
//   POST → { redirect }   DELETE → { ok }  (desconecta)
export const prerender = false;

import type { APIRoute } from 'astro';
import { getActiveOrgId, logAudit, reqIp } from '../../../../lib/db';
import { requirePerm } from '../../../../lib/queries';
import { currentUserId, currentLocale } from '../../../../lib/context';
import { strictRateLimit, strictLimitResponse } from '../../../../lib/ratelimit';
import { createOAuthState } from '../../../../lib/integraciones/conexiones';
import { disconnectTeamsGraph, teamsAuthorizeUrl } from '../../../../lib/integraciones/teams-graph';
import { siteOrigin } from '../../../../lib/email';
import { t } from '../../../../i18n/app';

export const POST: APIRoute = async () => {
    const denied = await requirePerm('ajustes'); if (denied) return denied;
    const L = currentLocale();
    const orgId = await getActiveOrgId();
    const limitado = strictLimitResponse(await strictRateLimit(`teams-connect:${orgId}`, 10, 60));
    if (limitado) return limitado;

    const userId = currentUserId();
    if (!userId) return json({ error: t(L, 'teams.err.sesion') }, 401);
    const state = await createOAuthState(orgId, userId, 'teams');
    const url = teamsAuthorizeUrl(`${siteOrigin()}/api/integraciones/teams/callback`, state);
    if (!url) return json({ error: t(L, 'teams.err.no_disponible') }, 503);
    return json({ redirect: url });
};

export const DELETE: APIRoute = async ({ request }) => {
    const denied = await requirePerm('ajustes'); if (denied) return denied;
    const orgId = await getActiveOrgId();
    const limitado = strictLimitResponse(await strictRateLimit(`teams-connect:${orgId}`, 10, 60));
    if (limitado) return limitado;
    await disconnectTeamsGraph(orgId);
    await logAudit(orgId, { accion: 'integracion.teams_desconectada', entidad: 'org', entidad_id: orgId, detalle: 'Desconectó Microsoft Teams', ip: reqIp(request) });
    return json({ ok: true });
};

function json(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

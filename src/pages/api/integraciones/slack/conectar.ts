// /api/integraciones/slack/conectar — "Añadir a Slack".
//   POST → { redirect }   DELETE → { ok }  (desconecta)
export const prerender = false;

import type { APIRoute } from 'astro';
import { getActiveOrgId, logAudit, reqIp } from '../../../../lib/db';
import { requirePerm } from '../../../../lib/queries';
import { currentUserId, currentLocale } from '../../../../lib/context';
import { strictRateLimit, strictLimitResponse } from '../../../../lib/ratelimit';
import { createOAuthState } from '../../../../lib/integraciones/conexiones';
import { disconnectSlack, slackAuthorizeUrl } from '../../../../lib/integraciones/slack-oauth';
import { siteOrigin } from '../../../../lib/email';
import { t } from '../../../../i18n/app';

export const POST: APIRoute = async () => {
    const denied = await requirePerm('ajustes'); if (denied) return denied;
    const L = currentLocale();
    const orgId = await getActiveOrgId();
    const limitado = strictLimitResponse(await strictRateLimit(`slack-connect:${orgId}`, 10, 60));
    if (limitado) return limitado;

    const userId = currentUserId();
    if (!userId) return json({ error: t(L, 'slack.err.sesion') }, 401);
    const state = await createOAuthState(orgId, userId, 'slack');
    const url = slackAuthorizeUrl(`${siteOrigin()}/api/integraciones/slack/callback`, state);
    if (!url) return json({ error: t(L, 'slack.err.no_disponible') }, 503);
    return json({ redirect: url });
};

export const DELETE: APIRoute = async ({ request }) => {
    const denied = await requirePerm('ajustes'); if (denied) return denied;
    const orgId = await getActiveOrgId();
    const limitado = strictLimitResponse(await strictRateLimit(`slack-connect:${orgId}`, 10, 60));
    if (limitado) return limitado;
    await disconnectSlack(orgId);
    await logAudit(orgId, { accion: 'integracion.slack_desconectada', entidad: 'org', entidad_id: orgId, detalle: 'Desconectó Slack', ip: reqIp(request) });
    return json({ ok: true });
};

function json(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

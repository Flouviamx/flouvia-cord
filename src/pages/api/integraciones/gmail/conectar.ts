// /api/integraciones/gmail/conectar — "Enviar desde tu Gmail".
//   POST → { redirect }   DELETE → { ok }  (desconecta)
export const prerender = false;

import type { APIRoute } from 'astro';
import { getActiveOrgId, logAudit, reqIp } from '../../../../lib/db';
import { requirePerm } from '../../../../lib/queries';
import { currentUserId, currentLocale } from '../../../../lib/context';
import { strictRateLimit, strictLimitResponse } from '../../../../lib/ratelimit';
import { createOAuthState } from '../../../../lib/integraciones/conexiones';
import { desconectarGmail, gmailAuthorizeUrl } from '../../../../lib/integraciones/gmail/envio';
import { siteOrigin } from '../../../../lib/email';
import { t } from '../../../../i18n/app';

export const REDIRECT_PATH = '/api/integraciones/gmail/callback';

export const POST: APIRoute = async () => {
    const denied = await requirePerm('ajustes'); if (denied) return denied;
    const L = currentLocale();
    const orgId = await getActiveOrgId();
    const limitado = strictLimitResponse(await strictRateLimit(`gmail-connect:${orgId}`, 10, 60));
    if (limitado) return limitado;
    const userId = currentUserId();
    if (!userId) return json({ error: t(L, 'gmail.err.sesion') }, 401);

    const state = await createOAuthState(orgId, userId, 'gmail');
    const url = gmailAuthorizeUrl(`${siteOrigin()}${REDIRECT_PATH}`, state);
    if (!url) return json({ error: t(L, 'gmail.err.no_disponible') }, 503);
    return json({ redirect: url });
};

export const DELETE: APIRoute = async ({ request }) => {
    const denied = await requirePerm('ajustes'); if (denied) return denied;
    const orgId = await getActiveOrgId();
    const limitado = strictLimitResponse(await strictRateLimit(`gmail-connect:${orgId}`, 10, 60));
    if (limitado) return limitado;
    await desconectarGmail(orgId);
    await logAudit(orgId, {
        accion: 'integracion.gmail_desconectado', entidad: 'org', entidad_id: orgId,
        detalle: 'Desconectó el envío desde Gmail', ip: reqIp(request),
    });
    return json({ ok: true });
};

function json(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

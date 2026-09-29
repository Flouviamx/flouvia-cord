// DELETE /api/integraciones/gmail/complemento — desconecta el complemento de Gmail
// de todo el equipo: revoca cada autorización viva y su llave. En Gmail, el
// complemento vuelve a pedir "Conectar con Cord" en la siguiente llamada.
export const prerender = false;

import type { APIRoute } from 'astro';
import { getActiveOrgId, logAudit, reqIp } from '../../../../lib/db';
import { requirePerm } from '../../../../lib/queries';
import { strictRateLimit, strictLimitResponse } from '../../../../lib/ratelimit';
import { revokeOAuthApp } from '../../../../lib/oauth-provider';

export const DELETE: APIRoute = async ({ request }) => {
    const denied = await requirePerm('ajustes'); if (denied) return denied;
    const orgId = await getActiveOrgId();
    const limitado = strictLimitResponse(await strictRateLimit(`gmail-complemento:${orgId}`, 10, 60));
    if (limitado) return limitado;
    const n = await revokeOAuthApp(orgId, 'gmail');
    await logAudit(orgId, {
        accion: 'oauth.revocada', entidad: 'oauth_grant', entidad_id: 'gmail',
        detalle: `Desconectó el complemento de Gmail (${n} ${n === 1 ? 'conexión' : 'conexiones'})`, ip: reqIp(request),
    });
    return new Response(JSON.stringify({ ok: true, revocadas: n }), { status: 200, headers: { 'Content-Type': 'application/json' } });
};

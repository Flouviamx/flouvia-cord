// /api/integraciones/teams/canales — equipos y canales de la cuenta de Microsoft conectada.
//   GET → { equipos }   GET ?equipo=<id> → { canales }   POST { equipo, canal } → { equipo, canal }
export const prerender = false;

import type { APIRoute } from 'astro';
import { getActiveOrgId, logAudit, reqIp } from '../../../../lib/db';
import { requirePerm } from '../../../../lib/queries';
import { currentLocale } from '../../../../lib/context';
import { strictRateLimit, strictLimitResponse } from '../../../../lib/ratelimit';
import { isChannelId, isTeamId, listChannels, listTeams, setTeamsChannel } from '../../../../lib/integraciones/teams-graph';
import { t, type AppLocale } from '../../../../i18n/app';

const fallo = (L: AppLocale, reason: 'sin_conexion' | 'reconectar' | 'rechazo') =>
    json({ error: t(L, reason === 'rechazo' ? 'teams.err.lista' : 'teams.test.reconectar') }, reason === 'rechazo' ? 502 : 409);

export const GET: APIRoute = async ({ url }) => {
    const denied = await requirePerm('ajustes'); if (denied) return denied;
    const L = currentLocale();
    const orgId = await getActiveOrgId();
    const limitado = strictLimitResponse(await strictRateLimit(`teams-graph:${orgId}`, 60, 60));
    if (limitado) return limitado;

    const equipo = url.searchParams.get('equipo');
    if (equipo !== null) {
        if (!isTeamId(equipo)) return json({ error: t(L, 'teams.err.canal') }, 400);
        const canales = await listChannels(orgId, equipo);
        return Array.isArray(canales) ? json({ canales }) : fallo(L, canales.reason);
    }
    const equipos = await listTeams(orgId);
    return Array.isArray(equipos) ? json({ equipos }) : fallo(L, equipos.reason);
};

export const POST: APIRoute = async ({ request }) => {
    const denied = await requirePerm('ajustes'); if (denied) return denied;
    const L = currentLocale();
    const orgId = await getActiveOrgId();
    const limitado = strictLimitResponse(await strictRateLimit(`teams-graph:${orgId}`, 60, 60));
    if (limitado) return limitado;

    let body: any;
    try { body = await request.json(); } catch { return json({ error: t(L, 'teams.err.canal') }, 400); }
    if (!isTeamId(body?.equipo) || !isChannelId(body?.canal)) return json({ error: t(L, 'teams.err.canal') }, 400);

    const r = await setTeamsChannel(orgId, body.equipo, body.canal);
    if (!r) return json({ error: t(L, 'teams.err.canal') }, 400);
    if ('ok' in r) return fallo(L, r.reason);
    await logAudit(orgId, { accion: 'integracion.teams_canal', entidad: 'org', entidad_id: orgId, detalle: `Canal ${r.canal} · ${r.equipo}`, ip: reqIp(request) });
    return json(r);
};

function json(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

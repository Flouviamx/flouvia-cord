// /api/integraciones/hubspot — GET estado y pipelines; POST { action: desconectar | sincronizar | ajustes }.
export const prerender = false;

import type { APIRoute } from 'astro';
import { requirePerm } from '../../../../lib/queries';
import { strictRateLimit, strictLimitResponse } from '../../../../lib/ratelimit';
import { outcomeResponse, sessionContext } from '../../../../lib/actions/http';
import { backfillHubSpot, disconnectHubSpot, hubspotStatus, saveHubSpotAjustes } from '../../../../lib/integraciones/hubspot/service';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

export const GET: APIRoute = async ({ request, url }) => {
    const denied = await requirePerm('ajustes'); if (denied) return denied;
    const ctx = await sessionContext(request);
    const limitado = strictLimitResponse(await strictRateLimit(`hubspot:${ctx.orgId}`, 60, 60));
    if (limitado) return limitado;
    return json(await hubspotStatus(ctx.orgId, url.searchParams.get('pipelines') === '1'));
};

export const POST: APIRoute = async ({ request }) => {
    const denied = await requirePerm('ajustes'); if (denied) return denied;
    let body: any;
    try { body = await request.json(); } catch { return json({ error: 'JSON inválido' }, 400); }
    const ctx = await sessionContext(request);
    const limitado = strictLimitResponse(await strictRateLimit(`hubspot:${ctx.orgId}`, 30, 60));
    if (limitado) return limitado;
    switch (body?.action) {
        case 'desconectar': return outcomeResponse(await disconnectHubSpot(ctx));
        case 'sincronizar': {
            const extra = strictLimitResponse(await strictRateLimit(`hubspot-backfill:${ctx.orgId}`, 3, 3600));
            if (extra) return extra;
            return outcomeResponse(await backfillHubSpot(ctx));
        }
        case 'ajustes': return outcomeResponse(await saveHubSpotAjustes(ctx, body));
        default: return json({ error: 'Acción no válida' }, 400);
    }
};

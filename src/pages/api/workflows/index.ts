// /api/workflows — Cord Workflows de la org activa.
//   GET                    → { workflows: [...] }
//   POST { plantilla? }    → { id }
export const prerender = false;

import type { APIRoute } from 'astro';
import { requirePerm } from '../../../lib/queries';
import { currentLocale } from '../../../lib/context';
import { strictRateLimit, strictLimitResponse } from '../../../lib/ratelimit';
import { outcomeResponse, sessionContext } from '../../../lib/actions/http';
import { createWorkflow, listWorkflows } from '../../../lib/workflows/service';

export const GET: APIRoute = async ({ request }) => {
    const denied = await requirePerm('ajustes'); if (denied) return denied;
    const ctx = await sessionContext(request);
    return json({ workflows: await listWorkflows(ctx.orgId) });
};

export const POST: APIRoute = async ({ request }) => {
    const denied = await requirePerm('ajustes'); if (denied) return denied;
    let body: any = {};
    try { body = await request.json(); } catch { body = {}; }
    const ctx = await sessionContext(request);
    const limitado = strictLimitResponse(await strictRateLimit(`workflows:${ctx.orgId}`, 60, 60));
    if (limitado) return limitado;
    return outcomeResponse(await createWorkflow(ctx, { plantilla: body?.plantilla, lang: currentLocale() }));
};

function json(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

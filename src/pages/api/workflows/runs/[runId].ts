// /api/workflows/runs/[runId] — reintentar o cancelar una ejecución.
//   POST { action: retry | cancel }
export const prerender = false;

import type { APIRoute } from 'astro';
import { requirePerm } from '../../../../lib/queries';
import { strictRateLimit, strictLimitResponse } from '../../../../lib/ratelimit';
import { outcomeResponse, sessionContext } from '../../../../lib/actions/http';
import { cancelWorkflowRun, retryWorkflowRun } from '../../../../lib/workflows/service';

export const POST: APIRoute = async ({ params, request }) => {
    const denied = await requirePerm('ajustes'); if (denied) return denied;
    let body: any;
    try { body = await request.json(); } catch { return json({ error: 'JSON inválido' }, 400); }
    const ctx = await sessionContext(request);
    const limitado = strictLimitResponse(await strictRateLimit(`workflows:${ctx.orgId}`, 60, 60));
    if (limitado) return limitado;
    const runId = String(params.runId ?? '');
    if (body?.action === 'retry') return outcomeResponse(await retryWorkflowRun(ctx, runId));
    if (body?.action === 'cancel') return outcomeResponse(await cancelWorkflowRun(ctx, runId));
    return json({ error: 'Acción no válida' }, 400);
};

function json(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

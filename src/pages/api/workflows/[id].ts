// /api/workflows/[id] — un workflow.
//   GET                                                  → { workflow }
//   PATCH { nombre, definicion }                         → guarda el borrador
//   POST  { action: publish | pause | resume | duplicate }
//   DELETE
export const prerender = false;

import type { APIRoute } from 'astro';
import { requirePerm } from '../../../lib/queries';
import { currentLocale } from '../../../lib/context';
import { strictRateLimit, strictLimitResponse } from '../../../lib/ratelimit';
import { outcomeResponse, sessionContext } from '../../../lib/actions/http';
import {
    deleteWorkflow, duplicateWorkflow, getWorkflow, publishWorkflow, saveWorkflowDraft, setWorkflowPaused,
} from '../../../lib/workflows/service';

export const GET: APIRoute = async ({ params, request }) => {
    const denied = await requirePerm('ajustes'); if (denied) return denied;
    const ctx = await sessionContext(request);
    const workflow = await getWorkflow(ctx.orgId, String(params.id ?? ''));
    if (!workflow) return json({ error: 'Workflow no encontrado' }, 404);
    return json({ workflow });
};

export const PATCH: APIRoute = async ({ params, request }) => {
    const denied = await requirePerm('ajustes'); if (denied) return denied;
    let body: any;
    try { body = await request.json(); } catch { return json({ error: 'JSON inválido' }, 400); }
    const ctx = await sessionContext(request);
    const limitado = strictLimitResponse(await strictRateLimit(`workflows:${ctx.orgId}`, 60, 60));
    if (limitado) return limitado;
    return outcomeResponse(await saveWorkflowDraft(ctx, String(params.id ?? ''), body ?? {}));
};

export const POST: APIRoute = async ({ params, request }) => {
    const denied = await requirePerm('ajustes'); if (denied) return denied;
    let body: any;
    try { body = await request.json(); } catch { return json({ error: 'JSON inválido' }, 400); }
    const ctx = await sessionContext(request);
    const limitado = strictLimitResponse(await strictRateLimit(`workflows:${ctx.orgId}`, 60, 60));
    if (limitado) return limitado;
    const id = String(params.id ?? '');
    const lang = currentLocale();
    switch (body?.action) {
        case 'publish': return outcomeResponse(await publishWorkflow(ctx, id, lang));
        case 'pause': return outcomeResponse(await setWorkflowPaused(ctx, id, true));
        case 'resume': return outcomeResponse(await setWorkflowPaused(ctx, id, false));
        case 'duplicate': return outcomeResponse(await duplicateWorkflow(ctx, id, lang));
        default: return json({ error: 'Acción no válida' }, 400);
    }
};

export const DELETE: APIRoute = async ({ params, request }) => {
    const denied = await requirePerm('ajustes'); if (denied) return denied;
    const ctx = await sessionContext(request);
    const limitado = strictLimitResponse(await strictRateLimit(`workflows:${ctx.orgId}`, 60, 60));
    if (limitado) return limitado;
    return outcomeResponse(await deleteWorkflow(ctx, String(params.id ?? '')));
};

function json(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

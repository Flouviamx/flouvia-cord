// /api/workflows/[id]/runs — historial de ejecuciones de un workflow.
//   GET → { runs: [...] }
export const prerender = false;

import type { APIRoute } from 'astro';
import { requirePerm } from '../../../../lib/queries';
import { sessionContext } from '../../../../lib/actions/http';
import { listWorkflowRuns } from '../../../../lib/workflows/service';

export const GET: APIRoute = async ({ params, request }) => {
    const denied = await requirePerm('ajustes'); if (denied) return denied;
    const ctx = await sessionContext(request);
    const runs = await listWorkflowRuns(ctx.orgId, String(params.id ?? ''));
    return new Response(JSON.stringify({ runs }), { status: 200, headers: { 'Content-Type': 'application/json' } });
};

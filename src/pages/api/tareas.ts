// /api/tareas — recordatorios del CRM ligero de la org activa.
//   POST   { titulo, due_date?, cotizacion_id?, prioridad?, notas?, asignado_a? } → { id }
//   PATCH  { id, done }                                → { ok }  (completar / reabrir)
//   PATCH  { id, titulo?, due_date?, prioridad?, notas?, asignado_a? } → { ok }  (editar, posponer, asignar)
//   DELETE { id }                                      → { ok }
export const prerender = false;

import type { APIRoute } from 'astro';
import { requirePermAny } from '../../lib/queries';
import { TASK_PERMISSIONS, createTask, deleteTask, setTaskDone, updateTask } from '../../lib/actions/tasks';
import { outcomeResponse, sessionContext } from '../../lib/actions/http';

export const POST: APIRoute = async ({ request }) => {
    const denied = await requirePermAny([...TASK_PERMISSIONS]); if (denied) return denied;
    let body: any;
    try { body = await request.json(); } catch { return json({ error: 'JSON inválido' }, 400); }
    return outcomeResponse(await createTask(await sessionContext(request), body));
};

export const PATCH: APIRoute = async ({ request }) => {
    const denied = await requirePermAny([...TASK_PERMISSIONS]); if (denied) return denied;
    let body: any;
    try { body = await request.json(); } catch { return json({ error: 'JSON inválido' }, 400); }
    if (!body || typeof body !== 'object' || !body.id) return json({ error: 'Falta id' }, 400);
    const ctx = await sessionContext(request);
    const { id, done, ...campos } = body;
    if (done !== undefined) {
        const outcome = await setTaskDone(ctx, String(id), Boolean(done));
        if (outcome.status !== 200 || !Object.keys(campos).length) return outcomeResponse(outcome);
    }
    return outcomeResponse(await updateTask(ctx, String(id), campos));
};

export const DELETE: APIRoute = async ({ request }) => {
    const denied = await requirePermAny([...TASK_PERMISSIONS]); if (denied) return denied;
    let body: any;
    try { body = await request.json(); } catch { return json({ error: 'JSON inválido' }, 400); }
    if (!body.id) return json({ error: 'Falta id' }, 400);
    return outcomeResponse(await deleteTask(await sessionContext(request), String(body.id)));
};

function json(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

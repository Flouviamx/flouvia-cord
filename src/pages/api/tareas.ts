// /api/tareas — recordatorios del CRM ligero de la org activa.
//   POST   { titulo, due_date?, cotizacion_id? }   → { id }
//   PATCH  { id, done }                             → { ok }
//   DELETE { id }                                   → { ok }
export const prerender = false;

import type { APIRoute } from 'astro';
import { requirePermAny } from '../../lib/queries';
import { TASK_PERMISSIONS, createTask, deleteTask, setTaskDone } from '../../lib/actions/tasks';
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
    if (!body.id) return json({ error: 'Falta id' }, 400);
    return outcomeResponse(await setTaskDone(await sessionContext(request), String(body.id), Boolean(body.done)));
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

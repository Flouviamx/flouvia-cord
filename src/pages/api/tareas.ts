// /api/tareas — recordatorios del CRM ligero de la org activa.
//   POST   { titulo, due_date?, cotizacion_id? }   → { id }
//   PATCH  { id, done }                             → { ok }
//   DELETE { id }                                   → { ok }
export const prerender = false;

import type { APIRoute } from 'astro';
import { sql, getActiveOrgId } from '../../lib/db';

export const POST: APIRoute = async ({ request }) => {
    let body: any;
    try { body = await request.json(); } catch { return json({ error: 'JSON inválido' }, 400); }
    const titulo = String(body.titulo ?? '').trim();
    if (!titulo) return json({ error: 'Escribe la tarea' }, 400);
    const due = body.due_date ? String(body.due_date) : null;
    const cotizacionId = body.cotizacion_id || null;

    const orgId = await getActiveOrgId();
    const [row] = await sql`
        insert into tareas (org_id, cotizacion_id, titulo, due_date)
        values (${orgId}, ${cotizacionId}, ${titulo.slice(0, 200)}, ${due})
        returning id`;
    return json({ id: row.id });
};

export const PATCH: APIRoute = async ({ request }) => {
    let body: any;
    try { body = await request.json(); } catch { return json({ error: 'JSON inválido' }, 400); }
    if (!body.id) return json({ error: 'Falta id' }, 400);
    const orgId = await getActiveOrgId();
    const rows = await sql`update tareas set done = ${Boolean(body.done)} where id = ${body.id} and org_id = ${orgId} returning id`;
    if (!rows.length) return json({ error: 'Tarea no encontrada' }, 404);
    return json({ ok: true });
};

export const DELETE: APIRoute = async ({ request }) => {
    let body: any;
    try { body = await request.json(); } catch { return json({ error: 'JSON inválido' }, 400); }
    if (!body.id) return json({ error: 'Falta id' }, 400);
    const orgId = await getActiveOrgId();
    const rows = await sql`delete from tareas where id = ${body.id} and org_id = ${orgId} returning id`;
    if (!rows.length) return json({ error: 'Tarea no encontrada' }, 404);
    return json({ ok: true });
};

function json(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

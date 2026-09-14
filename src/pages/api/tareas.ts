// /api/tareas — recordatorios del CRM ligero de la org activa.
//   POST   { titulo, due_date?, cotizacion_id? }   → { id }
//   PATCH  { id, done }                             → { ok }
//   DELETE { id }                                   → { ok }
export const prerender = false;

import type { APIRoute } from 'astro';
import { sql, getActiveOrgId, withOrgTx } from '../../lib/db';
import { requirePermAny } from '../../lib/queries';
import { currentLocale } from '../../lib/context';
import { t } from '../../i18n/app';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PERMISOS_TAREAS = ['cotizar', 'cobranza', 'clientes'] as const;

export const POST: APIRoute = async ({ request }) => {
    const denied = await requirePermAny([...PERMISOS_TAREAS]); if (denied) return denied;
    let body: any;
    try { body = await request.json(); } catch { return json({ error: 'JSON inválido' }, 400); }
    const titulo = String(body.titulo ?? '').trim();
    if (!titulo) return json({ error: t(currentLocale(), 'err.tarea.vacia') }, 400);
    const due = body.due_date ? String(body.due_date) : null;
    if (due && !/^\d{4}-\d{2}-\d{2}$/.test(due)) return json({ error: t(currentLocale(), 'err.tarea.fecha') }, 400);
    const cotizacionId = body.cotizacion_id ? String(body.cotizacion_id) : null;

    const orgId = await getActiveOrgId();
    if (cotizacionId) {
        const [own] = UUID_RE.test(cotizacionId)
            ? await withOrgTx(orgId, sql`select id from cotizaciones where id = ${cotizacionId} and org_id = ${orgId}`)
            : [[]];
        if (!own.length) return json({ error: 'Cotización no encontrada' }, 404);
    }
    const [[row]] = await withOrgTx(orgId, sql`
        insert into tareas (org_id, cotizacion_id, titulo, due_date)
        values (${orgId}, ${cotizacionId}, ${titulo.slice(0, 200)}, ${due})
        returning id`);
    return json({ id: row.id });
};

export const PATCH: APIRoute = async ({ request }) => {
    const denied = await requirePermAny([...PERMISOS_TAREAS]); if (denied) return denied;
    let body: any;
    try { body = await request.json(); } catch { return json({ error: 'JSON inválido' }, 400); }
    if (!body.id) return json({ error: 'Falta id' }, 400);
    if (!UUID_RE.test(String(body.id))) return json({ error: t(currentLocale(), 'err.tarea.no_encontrada') }, 404);
    const orgId = await getActiveOrgId();
    const [rows] = await withOrgTx(orgId, sql`update tareas set done = ${Boolean(body.done)} where id = ${body.id} and org_id = ${orgId} returning id`);
    if (!rows.length) return json({ error: t(currentLocale(), 'err.tarea.no_encontrada') }, 404);
    return json({ ok: true });
};

export const DELETE: APIRoute = async ({ request }) => {
    const denied = await requirePermAny([...PERMISOS_TAREAS]); if (denied) return denied;
    let body: any;
    try { body = await request.json(); } catch { return json({ error: 'JSON inválido' }, 400); }
    if (!body.id) return json({ error: 'Falta id' }, 400);
    if (!UUID_RE.test(String(body.id))) return json({ error: t(currentLocale(), 'err.tarea.no_encontrada') }, 404);
    const orgId = await getActiveOrgId();
    const [rows] = await withOrgTx(orgId, sql`delete from tareas where id = ${body.id} and org_id = ${orgId} returning id`);
    if (!rows.length) return json({ error: t(currentLocale(), 'err.tarea.no_encontrada') }, 404);
    return json({ ok: true });
};

function json(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

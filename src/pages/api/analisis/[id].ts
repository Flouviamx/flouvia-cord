// /api/analisis/[id] — un análisis guardado.
//   GET    → el análisis (tipo + nombre + inputs)
//   PATCH  { nombre?, inputs? } → actualiza
//   DELETE → borra
export const prerender = false;

import type { APIRoute } from 'astro';
import { getActiveOrgId, logAudit, reqIp } from '../../../lib/db';
import { requirePerm, getAnalisis, updateAnalisis, deleteAnalisis } from '../../../lib/queries';
import { sanitizeInputs } from '../../../lib/analisis';

export const GET: APIRoute = async ({ params }) => {
    const denied = await requirePerm('analitica'); if (denied) return denied;
    const id = String(params.id ?? '');
    const orgId = await getActiveOrgId();
    const a = await getAnalisis(orgId, id);
    if (!a) return json({ error: 'Análisis no encontrado' }, 404);
    return json({ analisis: a });
};

export const PATCH: APIRoute = async ({ params, request }) => {
    const denied = await requirePerm('analitica'); if (denied) return denied;
    const id = String(params.id ?? '');
    const orgId = await getActiveOrgId();
    let body: any;
    try { body = await request.json(); } catch { return json({ error: 'JSON inválido' }, 400); }

    const existing = await getAnalisis(orgId, id);
    if (!existing) return json({ error: 'Análisis no encontrado' }, 404);

    const patch: { nombre?: string; inputs?: Record<string, unknown> } = {};
    if (typeof body.nombre === 'string') {
        const nombre = body.nombre.trim().slice(0, 120);
        if (nombre) patch.nombre = nombre;
    }
    if (body.inputs != null) patch.inputs = sanitizeInputs(existing.tipo, body.inputs);
    if (patch.nombre === undefined && patch.inputs === undefined) return json({ error: 'Nada que actualizar' }, 400);

    await updateAnalisis(orgId, id, patch);
    return json({ ok: true });
};

export const DELETE: APIRoute = async ({ params, request }) => {
    const denied = await requirePerm('analitica'); if (denied) return denied;
    const id = String(params.id ?? '');
    const orgId = await getActiveOrgId();
    const a = await getAnalisis(orgId, id);
    await deleteAnalisis(orgId, id);
    if (a) await logAudit(orgId, { accion: 'analisis.eliminado', entidad: 'analisis', entidad_id: id, detalle: `${a.nombre} (${a.tipo})`, ip: reqIp(request) });
    return json({ ok: true });
};

function json(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

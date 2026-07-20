// /api/kits — índice de Kits de cotización (paquetes pre-armados de líneas).
//   GET   → lista los kits de la org (con conteo de renglones)
//   POST  { nombre, descripcion? }        → crea un kit VACÍO → { id }
export const prerender = false;

import type { APIRoute } from 'astro';
import { getActiveOrgId, logAudit, reqIp } from '../../lib/db';
import { requirePerm, getKits, createKit } from '../../lib/queries';

export const GET: APIRoute = async () => {
    const denied = await requirePerm('productos'); if (denied) return denied;
    const kits = await getKits();
    return json({ kits });
};

export const POST: APIRoute = async ({ request }) => {
    const denied = await requirePerm('productos'); if (denied) return denied;
    let body: any;
    try { body = await request.json(); } catch { return json({ error: 'JSON inválido' }, 400); }

    const nombre = String(body.nombre ?? '').trim().slice(0, 120);
    if (!nombre) return json({ error: 'El nombre del kit es obligatorio' }, 400);
    const descripcion = String(body.descripcion ?? '').trim().slice(0, 300);

    const orgId = await getActiveOrgId();
    const id = await createKit(orgId, { nombre, descripcion });
    await logAudit(orgId, { accion: 'kit.creado', entidad: 'kit', entidad_id: id, detalle: nombre, ip: reqIp(request) });
    return json({ id });
};

function json(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

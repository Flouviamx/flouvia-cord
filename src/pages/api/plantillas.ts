// /api/plantillas — plantillas de mensaje reutilizables (WhatsApp/correo/nota).
//   POST   { nombre, canal, cuerpo }       → { ok, id }
//   PATCH  { id, nombre?, canal?, cuerpo? } → { ok }
//   DELETE { id }                          → { ok }
export const prerender = false;

import type { APIRoute } from 'astro';
import { sql, getActiveOrgId, logAudit, reqIp, withOrgTx } from '../../lib/db';
import { requirePerm } from '../../lib/queries';

const CANALES = new Set(['whatsapp', 'email', 'nota']);
const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

export const POST: APIRoute = async ({ request }) => {
    const denied = await requirePerm('ajustes');
    if (denied) return denied;

    let body: any;
    try { body = await request.json(); } catch { return json({ error: 'JSON inválido' }, 400); }

    const nombre = String(body.nombre ?? '').trim().slice(0, 80);
    const canal = CANALES.has(String(body.canal)) ? String(body.canal) : 'whatsapp';
    const cuerpo = String(body.cuerpo ?? '').trim().slice(0, 2000);
    if (!nombre || !cuerpo) return json({ error: 'Nombre y cuerpo son obligatorios.' }, 400);

    const orgId = await getActiveOrgId();
    let row: any;
    try {
        [[row]] = await withOrgTx(orgId, sql`insert into plantillas_mensaje (org_id, nombre, canal, cuerpo)
                          values (${orgId}, ${nombre}, ${canal}, ${cuerpo}) returning id`);
    } catch { return json({ error: 'No se pudo crear. ¿Corriste la migración (npm run db:migrate)?' }, 500); }

    await logAudit(orgId, { accion: 'plantilla.creada', entidad: 'plantilla', entidad_id: row.id as string, detalle: nombre, ip: reqIp(request) });
    return json({ ok: true, id: row.id });
};

export const PATCH: APIRoute = async ({ request }) => {
    const denied = await requirePerm('ajustes');
    if (denied) return denied;

    let body: any;
    try { body = await request.json(); } catch { return json({ error: 'JSON inválido' }, 400); }
    const id = String(body.id ?? '');
    if (!id) return json({ error: 'Falta el id' }, 400);

    const orgId = await getActiveOrgId();
    const [[actual]] = await withOrgTx(orgId, sql`select * from plantillas_mensaje where id = ${id} and org_id = ${orgId}`);
    if (!actual) return json({ error: 'Plantilla no encontrada' }, 404);

    const nombre = body.nombre !== undefined ? (String(body.nombre).trim().slice(0, 80) || actual.nombre) : actual.nombre;
    const canal = body.canal !== undefined ? (CANALES.has(String(body.canal)) ? String(body.canal) : actual.canal) : actual.canal;
    const cuerpo = body.cuerpo !== undefined ? (String(body.cuerpo).trim().slice(0, 2000) || actual.cuerpo) : actual.cuerpo;

    await withOrgTx(orgId, sql`update plantillas_mensaje set nombre = ${nombre}, canal = ${canal}, cuerpo = ${cuerpo}, updated_at = now()
              where id = ${id} and org_id = ${orgId}`);
    await logAudit(orgId, { accion: 'plantilla.actualizada', entidad: 'plantilla', entidad_id: id, detalle: nombre, ip: reqIp(request) });
    return json({ ok: true });
};

export const DELETE: APIRoute = async ({ request }) => {
    const denied = await requirePerm('ajustes');
    if (denied) return denied;

    let body: any;
    try { body = await request.json(); } catch { return json({ error: 'JSON inválido' }, 400); }
    const id = String(body.id ?? '');
    if (!id) return json({ error: 'Falta el id' }, 400);

    const orgId = await getActiveOrgId();
    await withOrgTx(orgId, sql`delete from plantillas_mensaje where id = ${id} and org_id = ${orgId}`);
    await logAudit(orgId, { accion: 'plantilla.eliminada', entidad: 'plantilla', entidad_id: id, ip: reqIp(request) });
    return json({ ok: true });
};

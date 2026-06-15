// /api/productos — CRUD del catálogo de la org activa.
//   POST   { sku?, nombre, unidad?, precio, activo? }        → { id }
//   PATCH  { id, ...mismos campos }                          → { ok }
//   DELETE { id }                                            → { ok }
export const prerender = false;

import type { APIRoute } from 'astro';
import { sql, getActiveOrgId, logAudit, reqIp } from '../../lib/db';
import { requirePerm } from '../../lib/queries';

function clean(body: any) {
    return {
        sku: String(body.sku ?? '').trim().toUpperCase() || null,
        nombre: String(body.nombre ?? '').trim(),
        unidad: String(body.unidad ?? '').trim() || 'pieza',
        precio: Math.max(0, Number(body.precio) || 0),
        activo: body.activo === undefined ? true : Boolean(body.activo),
    };
}

export const POST: APIRoute = async ({ request }) => {
    const denied = await requirePerm('productos'); if (denied) return denied;
    let body: any;
    try { body = await request.json(); } catch { return json({ error: 'JSON inválido' }, 400); }
    const p = clean(body);
    if (!p.nombre) return json({ error: 'El nombre del producto es obligatorio' }, 400);

    const orgId = await getActiveOrgId();
    const [row] = await sql`
        insert into productos (org_id, sku, nombre, unidad, precio_lista, activo)
        values (${orgId}, ${p.sku}, ${p.nombre}, ${p.unidad}, ${p.precio}, ${p.activo})
        returning id`;
    await logAudit(orgId, { accion: 'producto.creado', entidad: 'producto', entidad_id: row.id as string, detalle: p.nombre, ip: reqIp(request) });
    return json({ id: row.id });
};

export const PATCH: APIRoute = async ({ request }) => {
    const denied = await requirePerm('productos'); if (denied) return denied;
    let body: any;
    try { body = await request.json(); } catch { return json({ error: 'JSON inválido' }, 400); }
    if (!body.id) return json({ error: 'Falta id' }, 400);
    const p = clean(body);
    if (!p.nombre) return json({ error: 'El nombre del producto es obligatorio' }, 400);

    const orgId = await getActiveOrgId();
    const rows = await sql`
        update productos set
            sku = ${p.sku}, nombre = ${p.nombre}, unidad = ${p.unidad},
            precio_lista = ${p.precio}, activo = ${p.activo}
        where id = ${body.id} and org_id = ${orgId}
        returning id`;
    if (!rows.length) return json({ error: 'Producto no encontrado' }, 404);
    return json({ ok: true });
};

export const DELETE: APIRoute = async ({ request }) => {
    const denied = await requirePerm('productos'); if (denied) return denied;
    let body: any;
    try { body = await request.json(); } catch { return json({ error: 'JSON inválido' }, 400); }
    if (!body.id) return json({ error: 'Falta id' }, 400);

    const orgId = await getActiveOrgId();
    const rows = await sql`delete from productos where id = ${body.id} and org_id = ${orgId} returning id, nombre`;
    if (!rows.length) return json({ error: 'Producto no encontrado' }, 404);
    await logAudit(orgId, { accion: 'producto.eliminado', entidad: 'producto', entidad_id: body.id, detalle: rows[0].nombre as string, ip: reqIp(request) });
    return json({ ok: true });
};

function json(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

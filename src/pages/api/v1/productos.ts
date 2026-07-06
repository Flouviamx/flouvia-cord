// /api/v1/productos — API PÚBLICA del catálogo.
//   GET  ?limit=&offset=   → { data: [...], meta }
//   POST { sku?, nombre, unidad?, precio, activo? }   → { data: { id } }  (scope: write)
export const prerender = false;

import { withApiAuth } from '../../../lib/apikey';
import { sql, getActiveOrgId, logAudit, reqIp } from '../../../lib/db';
import { getProductos } from '../../../lib/queries';
import { ok, fail, pageParams } from '../../../lib/apiv1';

export const GET = withApiAuth('read', async ({ url }, auth) => {
    const all = await getProductos();
    const { limit, offset } = pageParams(url);
    const page = all.slice(offset, offset + limit);
    // Las llaves publicables (pk_) se exponen en el navegador: NUNCA reveles el
    // costo (margen) del catálogo. Solo las secretas (backend) ven el costo.
    const data = auth.type === 'publishable'
        ? page.map(({ costo, ...rest }) => rest)
        : page;
    return ok(data, { limit, offset, total: all.length });
});

export const POST = withApiAuth('write', async ({ request }, auth) => {
    let body: any;
    try { body = await request.json(); } catch { return fail('JSON inválido', 'invalid_json', 400); }

    const nombre = String(body.nombre ?? '').trim();
    if (!nombre) return fail('El nombre del producto es obligatorio', 'invalid_request', 400);

    const p = {
        sku: String(body.sku ?? '').trim().toUpperCase() || null,
        nombre,
        unidad: String(body.unidad ?? '').trim() || 'pieza',
        precio: Math.max(0, Number(body.precio) || 0),
        activo: body.activo === undefined ? true : Boolean(body.activo),
    };

    const orgId = await getActiveOrgId();
    const [row] = await sql`
        insert into productos (org_id, sku, nombre, unidad, precio_lista, activo)
        values (${orgId}, ${p.sku}, ${p.nombre}, ${p.unidad}, ${p.precio}, ${p.activo})
        returning id`;
    await logAudit(orgId, { accion: 'producto.creado', entidad: 'producto', entidad_id: row.id as string, detalle: `${p.nombre} (vía API)`, ip: reqIp(request), actor: `api:${auth.keyId}` });
    return ok({ id: row.id });
});

// /api/productos/import — carga masiva del catálogo desde CSV.
//   POST { rows: [{ sku?, nombre, unidad?, precio?, activo?, clave_sat?, clave_unidad_sat? }], upsert?: bool }
//        → { created, updated, total }
// Las claves SAT (solo México) son las mismas que captura el modal de producto:
// una celda vacía no borra la clave que el producto ya tenía.
// Dedupe por SKU dentro de la org: con upsert (default) actualiza los productos
// que ya tienen ese SKU; el resto se inserta. Filas sin nombre se omiten.
export const prerender = false;

import type { APIRoute } from 'astro';
import { sql, getActiveOrgId, withOrgTx, logAudit, reqIp } from '../../../lib/db';
import { requirePerm } from '../../../lib/queries';
import { parsedResourceLimit, resourceLimitError } from '../../../lib/org-entitlements';
import { isProductKey, isUnitKey, normalizeProductKey, normalizeUnitKey } from '../../../lib/fiscal/sat-claves';

const MAX_ROWS = 2000;

export const POST: APIRoute = async ({ request }) => {
    // Mismo permiso que crear o editar un producto: el import reescribe precios de todo el catálogo.
    const denied = await requirePerm('productos'); if (denied) return denied;
    let body: any;
    try { body = await request.json(); } catch { return json({ error: 'JSON inválido' }, 400); }

    const raw = Array.isArray(body.rows) ? body.rows : [];
    if (!raw.length) return json({ error: 'No hay filas para importar' }, 400);
    if (raw.length > MAX_ROWS) return json({ error: `Máximo ${MAX_ROWS} filas por importación` }, 400);
    const upsert = body.upsert !== false;

    const rows = raw.map((r: any) => ({
        sku: String(r.sku ?? '').trim().toUpperCase() || null,
        nombre: String(r.nombre ?? '').trim(),
        unidad: String(r.unidad ?? '').trim() || 'pieza',
        precio: Math.max(0, Number(r.precio) || 0),
        activo: r.activo === undefined ? true : Boolean(r.activo),
        // Excel guarda 01010101 como número y se come el cero: 7 dígitos son
        // esa clave sin su cero, no una clave distinta.
        claveSat: ((k) => (k && /^\d{7}$/.test(k) ? `0${k}` : k))(normalizeProductKey(r.clave_sat)),
        claveUnidadSat: normalizeUnitKey(r.clave_unidad_sat),
    })).filter((r: any) => r.nombre);

    if (!rows.length) return json({ error: 'Ninguna fila tiene nombre de producto' }, 400);
    // Una clave con forma inválida se dice con su fila, igual que en el modal de
    // producto: guardarla rompería el timbrado de cada factura que la use.
    const malaSat = rows.findIndex((r: any) => (r.claveSat !== null && !isProductKey(r.claveSat))
        || (r.claveUnidadSat !== null && !isUnitKey(r.claveUnidadSat)));
    if (malaSat >= 0) {
        const r = rows[malaSat];
        return json({ error: r.claveSat !== null && !isProductKey(r.claveSat)
            ? `"${r.nombre}": la clave de producto o servicio del SAT tiene 8 dígitos (por ejemplo 81111500).`
            : `"${r.nombre}": la clave de unidad del SAT tiene de 1 a 3 letras o números (por ejemplo H87 o E48).` }, 400);
    }

    const orgId = await getActiveOrgId();

    // Resolver SKUs existentes en una sola query para decidir update vs insert.
    const skus = [...new Set(rows.map((r: any) => r.sku).filter(Boolean))] as string[];
    const existing = upsert && skus.length
        ? (await withOrgTx(orgId, sql`select id, sku from productos where org_id = ${orgId} and sku = any(${skus})`))[0]
        : [];
    const bySku = new Map(existing.map((e: any) => [e.sku as string, e.id as string]));

    let created = 0, updated = 0;
    try {
        for (const r of rows) {
            const hit = upsert && r.sku ? bySku.get(r.sku) : undefined;
            if (hit) {
                await withOrgTx(orgId, sql`update productos set nombre = ${r.nombre}, unidad = ${r.unidad},
                          precio_lista = ${r.precio}, activo = ${r.activo},
                          clave_sat = coalesce(${r.claveSat}::text, clave_sat),
                          clave_unidad_sat = coalesce(${r.claveUnidadSat}::text, clave_unidad_sat)
                          where id = ${hit} and org_id = ${orgId}`);
                updated++;
            } else {
                const [insRows] = await withOrgTx(orgId, sql`insert into productos (org_id, sku, nombre, unidad, precio_lista, activo, clave_sat, clave_unidad_sat)
                          values (${orgId}, ${r.sku}, ${r.nombre}, ${r.unidad}, ${r.precio}, ${r.activo}, ${r.claveSat}, ${r.claveUnidadSat})
                          returning id, sku`);
                const ins = insRows[0];
                // si en el mismo lote viene otro renglón con el mismo SKU, que también haga update
                if (upsert && ins.sku) bySku.set(ins.sku as string, ins.id as string);
                created++;
            }
        }
    } catch (e) {
        // El trigger del límite del plan corta a la mitad: lo ya importado se queda y se dice cuánto fue.
        const limit = parsedResourceLimit(e);
        if (!limit) throw e;
        await logAudit(orgId, { accion: 'productos.importados', entidad: 'producto', detalle: `Import parcial: ${created} nuevos, ${updated} actualizados (límite del plan)`, ip: reqIp(request) });
        const res = resourceLimitError(e)!;
        const payload = await res.json();
        return json({ ...payload, created, updated, total: rows.length }, 402);
    }

    await logAudit(orgId, { accion: 'productos.importados', entidad: 'producto', detalle: `Import: ${created} nuevos, ${updated} actualizados`, ip: reqIp(request) });
    return json({ created, updated, total: rows.length });
};

function json(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

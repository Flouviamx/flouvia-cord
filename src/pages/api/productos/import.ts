// /api/productos/import — carga masiva del catálogo desde CSV.
//   POST { rows: [{ sku?, nombre, unidad?, precio?, activo? }], upsert?: bool }
//        → { created, updated, total }
// Dedupe por SKU dentro de la org: con upsert (default) actualiza los productos
// que ya tienen ese SKU; el resto se inserta. Filas sin nombre se omiten.
export const prerender = false;

import type { APIRoute } from 'astro';
import { sql, getActiveOrgId } from '../../../lib/db';

const MAX_ROWS = 2000;

export const POST: APIRoute = async ({ request }) => {
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
    })).filter((r: any) => r.nombre);

    if (!rows.length) return json({ error: 'Ninguna fila tiene nombre de producto' }, 400);

    const orgId = await getActiveOrgId();

    // Resolver SKUs existentes en una sola query para decidir update vs insert.
    const skus = [...new Set(rows.map((r: any) => r.sku).filter(Boolean))] as string[];
    const existing = upsert && skus.length
        ? await sql`select id, sku from productos where org_id = ${orgId} and sku = any(${skus})`
        : [];
    const bySku = new Map(existing.map((e: any) => [e.sku as string, e.id as string]));

    let created = 0, updated = 0;
    for (const r of rows) {
        const hit = upsert && r.sku ? bySku.get(r.sku) : undefined;
        if (hit) {
            await sql`update productos set nombre = ${r.nombre}, unidad = ${r.unidad},
                      precio_lista = ${r.precio}, activo = ${r.activo}
                      where id = ${hit} and org_id = ${orgId}`;
            updated++;
        } else {
            const [ins] = await sql`insert into productos (org_id, sku, nombre, unidad, precio_lista, activo)
                      values (${orgId}, ${r.sku}, ${r.nombre}, ${r.unidad}, ${r.precio}, ${r.activo})
                      returning id, sku`;
            // si en el mismo lote viene otro renglón con el mismo SKU, que también haga update
            if (upsert && ins.sku) bySku.set(ins.sku as string, ins.id as string);
            created++;
        }
    }

    return json({ created, updated, total: rows.length });
};

function json(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

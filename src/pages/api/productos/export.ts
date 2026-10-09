// /api/productos/export — descarga el catálogo en CSV (mismo formato que la importación).
//   GET → text/csv (attachment): sku,nombre,unidad,precio,activo
//         (+ clave_sat,clave_unidad_sat en México: el CFDI es de ese país)
export const prerender = false;

import type { APIRoute } from 'astro';
import { sql, getActiveOrgId, withOrgTx } from '../../../lib/db';
import { requirePerm } from '../../../lib/queries';
import { csvCell, csvFilename } from '../../../lib/csv';

export const GET: APIRoute = async () => {
    const denied = await requirePerm('productos');
    if (denied) return denied;

    const orgId = await getActiveOrgId();
    const [rows, orgRows] = await withOrgTx(orgId,
        sql`select sku, nombre, unidad, precio_lista, activo, clave_sat, clave_unidad_sat from productos where org_id = ${orgId} order by nombre`,
        sql`select country_code from orgs where id = ${orgId}`);
    // Las claves SAT solo existen para el CFDI: fuera de México serían dos
    // columnas vacías con vocabulario de otro país (regla 14).
    const mx = String(orgRows[0]?.country_code || 'MX').toUpperCase() === 'MX';

    const header = ['sku', 'nombre', 'unidad', 'precio', 'activo', ...(mx ? ['clave_sat', 'clave_unidad_sat'] : [])];
    const lines = [header.join(',')];
    for (const r of rows as any[]) {
        lines.push([
            csvCell(r.sku ?? ''),
            csvCell(r.nombre ?? ''),
            csvCell(r.unidad ?? ''),
            csvCell(r.precio_lista ?? 0),
            csvCell(r.activo ? 'true' : 'false'),
            ...(mx ? [csvCell(r.clave_sat ?? ''), csvCell(r.clave_unidad_sat ?? '')] : []),
        ].join(','));
    }

    return new Response('﻿' + lines.join('\r\n') + '\r\n', {
        status: 200,
        headers: {
            'Content-Type': 'text/csv; charset=utf-8',
            'Content-Disposition': `attachment; filename="${csvFilename('productos')}"`,
        },
    });
};

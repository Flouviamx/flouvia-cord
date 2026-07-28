// /api/productos/export — descarga el catálogo en CSV (mismo formato que la importación).
//   GET → text/csv (attachment): sku,nombre,unidad,precio,activo
export const prerender = false;

import type { APIRoute } from 'astro';
import { sql, getActiveOrgId } from '../../../lib/db';
import { requirePerm } from '../../../lib/queries';
import { csvCell, csvFilename } from '../../../lib/csv';

export const GET: APIRoute = async () => {
    const denied = await requirePerm('productos');
    if (denied) return denied;

    const orgId = await getActiveOrgId();
    const rows = await sql`select sku, nombre, unidad, precio_lista, activo from productos where org_id = ${orgId} order by nombre`;

    const header = ['sku', 'nombre', 'unidad', 'precio', 'activo'];
    const lines = [header.join(',')];
    for (const r of rows as any[]) {
        lines.push([
            csvCell(r.sku ?? ''),
            csvCell(r.nombre ?? ''),
            csvCell(r.unidad ?? ''),
            csvCell(r.precio_lista ?? 0),
            csvCell(r.activo ? 'true' : 'false'),
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

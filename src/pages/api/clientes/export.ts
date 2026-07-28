// /api/clientes/export — descarga el directorio de clientes en CSV (mismo formato que la importación).
//   GET → text/csv (attachment): empresa,contacto,email,telefono,rfc,terminos,limite
export const prerender = false;

import type { APIRoute } from 'astro';
import { sql, getActiveOrgId } from '../../../lib/db';
import { requirePerm } from '../../../lib/queries';
import { csvCell, csvFilename } from '../../../lib/csv';

export const GET: APIRoute = async () => {
    const denied = await requirePerm('clientes');
    if (denied) return denied;

    const orgId = await getActiveOrgId();
    const rows = await sql`select empresa, contacto, email, telefono, rfc, terminos_default, limite_credito from clientes where org_id = ${orgId} order by empresa`;

    const header = ['empresa', 'contacto', 'email', 'telefono', 'rfc', 'terminos', 'limite'];
    const lines = [header.join(',')];
    for (const r of rows as any[]) {
        lines.push([
            csvCell(r.empresa ?? ''),
            csvCell(r.contacto ?? ''),
            csvCell(r.email ?? ''),
            csvCell(r.telefono ?? ''),
            csvCell(r.rfc ?? ''),
            csvCell(r.terminos_default ?? ''),
            csvCell(r.limite_credito ?? ''),
        ].join(','));
    }

    return new Response('﻿' + lines.join('\r\n') + '\r\n', {
        status: 200,
        headers: {
            'Content-Type': 'text/csv; charset=utf-8',
            'Content-Disposition': `attachment; filename="${csvFilename('clientes')}"`,
        },
    });
};

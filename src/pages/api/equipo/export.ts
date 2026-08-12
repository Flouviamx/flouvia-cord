// GET /api/equipo/export — el equipo en CSV.
// El botón "Exportar" de Ajustes › Equipo existía en el markup desde su creación
// y nunca tuvo listener: era puramente decorativo. Mismo patrón que
// /api/clientes/export y /api/productos/export (BOM UTF-8 + CRLF para que Excel
// lo abra limpio).
export const prerender = false;

import type { APIRoute } from 'astro';
import { getMembers, requirePerm } from '../../../lib/queries';
import { csvCell, csvFilename } from '../../../lib/csv';
import { ROL_LABEL } from '../../../lib/permissions';

export const GET: APIRoute = async () => {
    const denied = await requirePerm('equipo');
    if (denied) return denied;

    const members = await getMembers();
    const head = ['nombre', 'email', 'rol', 'estado', 'desde', 'ultima_sesion', 'cotizaciones_30d', 'gestionado_por_sso'];
    const rows = members.map((m) => [
        m.nombre, m.email, ROL_LABEL[m.rol] ?? m.rol, m.estado, m.desde,
        m.ultimaSesion ?? '', String(m.cotizaciones30d), m.ssoManaged ? 'sí' : 'no',
    ]);
    const csv = [head, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n');

    return new Response('﻿' + csv, {
        headers: {
            'Content-Type': 'text/csv; charset=utf-8',
            'Content-Disposition': `attachment; filename="${csvFilename('equipo')}"`,
            'Cache-Control': 'no-store',
        },
    });
};

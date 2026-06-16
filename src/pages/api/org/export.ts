// /api/org/export — descarga TODOS los datos de la org en un JSON (portabilidad).
//   GET → application/json (attachment). Incluye org, productos, clientes,
//   cotizaciones (+ items + eventos), tareas y audit_log.
export const prerender = false;

import type { APIRoute } from 'astro';
import { sql, getActiveOrgId } from '../../../lib/db';
import { requirePerm } from '../../../lib/queries';

const safe = async (q: Promise<any[]>) => { try { return await q; } catch { return []; } };

export const GET: APIRoute = async () => {
    const denied = await requirePerm('ajustes');
    if (denied) return denied;

    const orgId = await getActiveOrgId();
    const [org] = await sql`select * from orgs where id = ${orgId}`;
    const productos = await safe(sql`select * from productos where org_id = ${orgId} order by nombre`);
    const clientes = await safe(sql`select * from clientes where org_id = ${orgId} order by empresa`);
    const cotizaciones = await safe(sql`select * from cotizaciones where org_id = ${orgId} order by created_at desc`);
    const ids = cotizaciones.map((c: any) => c.id);
    const items = ids.length ? await safe(sql`select * from cotizacion_items where cotizacion_id = any(${ids})`) : [];
    const eventos = await safe(sql`select * from eventos where org_id = ${orgId} order by created_at`);
    const tareas = await safe(sql`select * from tareas where org_id = ${orgId}`);
    const auditoria = await safe(sql`select * from audit_log where org_id = ${orgId} order by created_at desc limit 1000`);

    // No exportamos el hash de las API keys; sólo el inventario enmascarado.
    const apiKeys = (await safe(sql`select id, nombre, prefix, last4, scope, created_at, last_used_at, revoked_at from api_keys where org_id = ${orgId}`));

    const payload = {
        exportado_en: new Date().toISOString(),
        org, productos, clientes, cotizaciones, cotizacion_items: items, eventos, tareas, api_keys: apiKeys, auditoria,
    };
    const nombre = String(org?.nombre ?? 'cord').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'cord';

    return new Response(JSON.stringify(payload, null, 2), {
        status: 200,
        headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Content-Disposition': `attachment; filename="${nombre}-export.json"`,
        },
    });
};

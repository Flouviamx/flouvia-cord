// /api/org/export — descarga TODOS los datos de la org en un JSON (portabilidad).
//   GET → application/json (attachment). Incluye org, productos, clientes,
//   cotizaciones (+ items + eventos), tareas y audit_log.
export const prerender = false;

import type { APIRoute } from 'astro';
import { sql, getActiveOrgId, withOrgTx } from '../../../lib/db';
import { requirePerm } from '../../../lib/queries';

// `safe` recibe el resultado del CARRIL, no la query suelta: withOrgTx devuelve
// una entrada por query, así que se toma la primera. Sin el carril, cada una de
// estas lecturas devolvería [] bajo RLS y el export saldría vacío en silencio,
// porque este helper se traga el error a propósito.
const safe = async (q: Promise<any[][]>) => { try { return (await q)[0] ?? []; } catch { return []; } };

export const GET: APIRoute = async () => {
    const denied = await requirePerm('ajustes');
    if (denied) return denied;

    const orgId = await getActiveOrgId();
    const [orgRows] = await withOrgTx(orgId, sql`select * from orgs where id = ${orgId}`);
    const org = orgRows[0];
    const productos = await safe(withOrgTx(orgId, sql`select * from productos where org_id = ${orgId} order by nombre`));
    const clientes = await safe(withOrgTx(orgId, sql`select * from clientes where org_id = ${orgId} order by empresa`));
    const cotizaciones = await safe(withOrgTx(orgId, sql`select * from cotizaciones where org_id = ${orgId} order by created_at desc`));
    const ids = cotizaciones.map((c: any) => c.id);
    const items = ids.length ? await safe(withOrgTx(orgId, sql`select * from cotizacion_items where cotizacion_id = any(${ids})`)) : [];
    const eventos = await safe(withOrgTx(orgId, sql`select * from eventos where org_id = ${orgId} order by created_at`));
    const tareas = await safe(withOrgTx(orgId, sql`select * from tareas where org_id = ${orgId}`));
    const auditoria = await safe(withOrgTx(orgId, sql`select * from audit_log where org_id = ${orgId} order by created_at desc limit 1000`));

    // No exportamos el hash de las API keys; sólo el inventario enmascarado.
    const apiKeys = (await safe(withOrgTx(orgId, sql`select id, nombre, prefix, last4, scope, created_at, last_used_at, revoked_at from api_keys where org_id = ${orgId}`)));

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

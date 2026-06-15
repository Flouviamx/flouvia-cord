// /api/impuestos — perfiles de impuesto reutilizables de la org (FASE 3).
//   POST   { nombre, tipo, tasa, es_default? }     → { id }
//   PATCH  { id, nombre?, tasa?, es_default?, activo? } → { ok }
//   DELETE { id }                                   → { ok }
// Al marcar es_default, se desmarca el resto del MISMO tipo y se SINCRONIZA la
// columna correspondiente de orgs (iva_pct / retencion_iva_pct / retencion_isr_pct)
// para que el editor de cotizaciones lo use sin refactor. Requiere permiso 'ajustes'.
export const prerender = false;

import type { APIRoute } from 'astro';
import { sql, getActiveOrgId, logAudit, reqIp } from '../../lib/db';
import { requirePerm } from '../../lib/queries';

const TIPOS = new Set(['iva', 'ieps', 'ret_iva', 'ret_isr', 'exento']);
const clampTasa = (v: unknown) => Math.min(100, Math.max(0, Number(v) || 0));

// Mapea el tipo de impuesto default a la columna de orgs que el editor lee.
const COL_BY_TIPO: Record<string, string> = {
    iva: 'iva_pct', ret_iva: 'retencion_iva_pct', ret_isr: 'retencion_isr_pct',
};

// Sincroniza orgs.<col> con la tasa del default vigente de ese tipo (o 0 si no hay).
async function syncOrg(orgId: string, tipo: string) {
    const col = COL_BY_TIPO[tipo];
    if (!col) return; // ieps/exento no tienen columna global
    const [d] = await sql`select tasa from impuestos where org_id = ${orgId} and tipo = ${tipo} and es_default = true and activo = true limit 1`;
    const tasa = d ? Number(d.tasa) : 0;
    // col viene de un mapa fijo (no del usuario) → seguro interpolar el identificador.
    await sql.query(`update orgs set ${col} = $1 where id = $2`, [tasa, orgId]);
}

export const POST: APIRoute = async ({ request }) => {
    const denied = await requirePerm('ajustes'); if (denied) return denied;
    let body: any;
    try { body = await request.json(); } catch { return json({ error: 'JSON inválido' }, 400); }

    const nombre = String(body.nombre ?? '').trim().slice(0, 60);
    if (!nombre) return json({ error: 'El nombre es obligatorio' }, 400);
    const tipo = TIPOS.has(String(body.tipo)) ? String(body.tipo) : 'iva';
    const tasa = clampTasa(body.tasa);
    const esDefault = !!body.es_default;

    const orgId = await getActiveOrgId();
    let row: any;
    try {
        if (esDefault) await sql`update impuestos set es_default = false where org_id = ${orgId} and tipo = ${tipo}`;
        [row] = await sql`
            insert into impuestos (org_id, nombre, tipo, tasa, es_default)
            values (${orgId}, ${nombre}, ${tipo}, ${tasa}, ${esDefault})
            returning id`;
    } catch {
        return json({ error: 'No se pudo crear. ¿Corriste la migración (npm run db:migrate)?' }, 500);
    }
    if (esDefault) await syncOrg(orgId, tipo);
    await logAudit(orgId, { accion: 'impuesto.creado', entidad: 'impuesto', entidad_id: row.id as string, detalle: `${nombre} (${tipo} ${tasa}%)`, ip: reqIp(request) });
    return json({ id: row.id });
};

export const PATCH: APIRoute = async ({ request }) => {
    const denied = await requirePerm('ajustes'); if (denied) return denied;
    let body: any;
    try { body = await request.json(); } catch { return json({ error: 'JSON inválido' }, 400); }
    const id = String(body.id ?? '');
    if (!id) return json({ error: 'Falta id' }, 400);

    const orgId = await getActiveOrgId();
    const [actual] = await sql`select * from impuestos where id = ${id} and org_id = ${orgId}`;
    if (!actual) return json({ error: 'Impuesto no encontrado' }, 404);
    const tipo = actual.tipo as string;

    if (body.nombre !== undefined) {
        const nombre = String(body.nombre).trim().slice(0, 60) || (actual.nombre as string);
        await sql`update impuestos set nombre = ${nombre} where id = ${id} and org_id = ${orgId}`;
    }
    if (body.tasa !== undefined) {
        await sql`update impuestos set tasa = ${clampTasa(body.tasa)} where id = ${id} and org_id = ${orgId}`;
    }
    if (typeof body.activo === 'boolean') {
        await sql`update impuestos set activo = ${body.activo} where id = ${id} and org_id = ${orgId}`;
    }
    if (body.es_default === true) {
        await sql`update impuestos set es_default = false where org_id = ${orgId} and tipo = ${tipo}`;
        await sql`update impuestos set es_default = true where id = ${id} and org_id = ${orgId}`;
    } else if (body.es_default === false) {
        await sql`update impuestos set es_default = false where id = ${id} and org_id = ${orgId}`;
    }
    await syncOrg(orgId, tipo);
    return json({ ok: true });
};

export const DELETE: APIRoute = async ({ request }) => {
    const denied = await requirePerm('ajustes'); if (denied) return denied;
    let body: any;
    try { body = await request.json(); } catch { return json({ error: 'JSON inválido' }, 400); }
    const id = String(body.id ?? '');
    if (!id) return json({ error: 'Falta id' }, 400);

    const orgId = await getActiveOrgId();
    const rows = await sql`delete from impuestos where id = ${id} and org_id = ${orgId} returning tipo, nombre`;
    if (!rows.length) return json({ error: 'No encontrado' }, 404);
    await syncOrg(orgId, rows[0].tipo as string);
    await logAudit(orgId, { accion: 'impuesto.eliminado', entidad: 'impuesto', entidad_id: id, detalle: rows[0].nombre as string, ip: reqIp(request) });
    return json({ ok: true });
};

function json(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

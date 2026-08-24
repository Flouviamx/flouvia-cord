// /api/impuestos — catálogo de impuestos de la organización.
//   POST   { nombre, kind, tipo?, tasa, es_default? }        → { id }
//   POST   { action: 'seed' }                                → { creados }
//   PATCH  { id, nombre?, tasa?, es_default?, activo? }      → { ok }
//   DELETE { id }                                            → { ok }
//
// `kind` (consumo | retencion | exento) es la clasificación NEUTRA y la que
// decide la aritmética. `tipo` es el subcódigo local: solo México lo usa, para
// mapear a los impuestos trasladados/retenidos del CFDI 4.0.
//
// La sincronización hacia orgs.iva_pct / retencion_*_pct se conserva como
// compatibilidad para cuentas creadas antes del impuesto por línea; ya no es el
// camino por el que los editores leen la tasa. Requiere permiso 'ajustes'.
export const prerender = false;

import type { APIRoute } from 'astro';
import { sql, getActiveOrgId, logAudit, reqIp, withOrgTx } from '../../lib/db';
import { requirePerm } from '../../lib/queries';
import { seedTaxCatalog } from '../../lib/impuestos-db';

const TIPOS = new Set(['iva', 'ieps', 'ret_iva', 'ret_isr', 'exento']);
const KINDS = new Set(['consumo', 'retencion', 'exento']);
const clampTasa = (v: unknown) => Math.min(100, Math.max(0, Number(v) || 0));

// Deriva la clasificación neutra del subcódigo, para peticiones viejas que solo
// mandan `tipo` (la API pública y el MCP pueden seguir haciéndolo).
const kindFromTipo = (tipo: string): string =>
    tipo === 'ret_iva' || tipo === 'ret_isr' ? 'retencion' : tipo === 'exento' ? 'exento' : 'consumo';

// Mapea el tipo de impuesto default a la columna de orgs que el editor lee.
const COL_BY_TIPO: Record<string, string> = {
    iva: 'iva_pct', ret_iva: 'retencion_iva_pct', ret_isr: 'retencion_isr_pct',
};

// Sincroniza orgs.<col> con la tasa del default vigente de ese tipo (o 0 si no hay).
//
// Filtra por `tipo` Y `kind`: antes solo filtraba por `tipo`, y como el editor
// de Ajustes nunca mandaba `tipo` (todo nacía como 'iva', el default del POST),
// una retención marcada default podía compartir `tipo='iva'` con el IVA de
// consumo real. Sin ORDER BY, el `limit 1` era ambiguo entre los dos y
// `orgs.iva_pct` podía terminar con la tasa de la RETENCIÓN. `kind` es la
// clasificación que de verdad separa "impuesto que se suma" de "impuesto que
// se resta" (regla 23), así que es el filtro correcto aquí.
async function syncOrg(orgId: string, tipo: string, kind: string) {
    const col = COL_BY_TIPO[tipo];
    if (!col) return; // ieps/exento no tienen columna global
    const [[d]] = await withOrgTx(orgId, sql`
        select tasa from impuestos
        where org_id = ${orgId} and tipo = ${tipo} and kind = ${kind} and es_default = true and activo = true
        order by created_at asc limit 1`);
    const tasa = d ? Number(d.tasa) : 0;
    // col viene de un mapa fijo (no del usuario) → seguro interpolar el identificador.
    await sql.query(`update orgs set ${col} = $1 where id = $2`, [tasa, orgId]);
}

export const POST: APIRoute = async ({ request }) => {
    const denied = await requirePerm('ajustes'); if (denied) return denied;
    let body: any;
    try { body = await request.json(); } catch { return json({ error: 'JSON inválido' }, 400); }

    if (body.action === 'seed') return seedFromCountry(request);

    const nombre = String(body.nombre ?? '').trim().slice(0, 60);
    if (!nombre) return json({ error: 'El nombre es obligatorio' }, 400);
    // `kind` manda: es lo que el editor de Ajustes SÍ envía (no tiene selector
    // de subcódigo). El `tipo` por defecto se deriva de `kind`, nunca de un
    // 'iva' fijo — así una retención creada desde la UI no queda etiquetada
    // como si fuera el IVA de consumo.
    const kind = KINDS.has(String(body.kind)) ? String(body.kind) : 'consumo';
    const defaultTipo = kind === 'retencion' ? 'ret_iva' : kind === 'exento' ? 'exento' : 'iva';
    const tipo = TIPOS.has(String(body.tipo)) ? String(body.tipo) : defaultTipo;
    const tasa = clampTasa(body.tasa);
    const esDefault = !!body.es_default;
    // Solo aplica a retenciones (regla del motor, engine.ts): sobre qué base
    // se calcula. 'subtotal' es el default correcto para la enorme mayoría de
    // países; 'impuesto' es el caso Colombia (ReteIVA = 15% DEL IVA).
    const retencionBase = body.retencion_base === 'impuesto' ? 'impuesto' : 'subtotal';

    const orgId = await getActiveOrgId();
    let row: any;
    try {
        // El default es único por KIND, no por subcódigo: es la clasificación
        // que el editor consulta, y dos "predeterminados de consumo" a la vez
        // dejarían al editor eligiendo en silencio cuál de los dos aplica.
        if (esDefault) await withOrgTx(orgId, sql`update impuestos set es_default = false where org_id = ${orgId} and kind = ${kind}`);
        [[row]] = await withOrgTx(orgId, sql`
            insert into impuestos (org_id, nombre, tipo, kind, tasa, es_default, retencion_base)
            values (${orgId}, ${nombre}, ${tipo}, ${kind}, ${tasa}, ${esDefault}, ${retencionBase})
            returning id`);
    } catch {
        return json({ error: 'No se pudo crear. ¿Corriste la migración (npm run db:migrate)?' }, 500);
    }
    if (esDefault) await syncOrg(orgId, tipo, kind);
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
    const [[actual]] = await withOrgTx(orgId, sql`select * from impuestos where id = ${id} and org_id = ${orgId}`);
    if (!actual) return json({ error: 'Impuesto no encontrado' }, 404);
    const tipo = actual.tipo as string;
    const kind = (actual.kind as string) || kindFromTipo(tipo);

    if (body.nombre !== undefined) {
        const nombre = String(body.nombre).trim().slice(0, 60) || (actual.nombre as string);
        await withOrgTx(orgId, sql`update impuestos set nombre = ${nombre} where id = ${id} and org_id = ${orgId}`);
    }
    if (body.tasa !== undefined) {
        await withOrgTx(orgId, sql`update impuestos set tasa = ${clampTasa(body.tasa)} where id = ${id} and org_id = ${orgId}`);
    }
    if (typeof body.activo === 'boolean') {
        await withOrgTx(orgId, sql`update impuestos set activo = ${body.activo} where id = ${id} and org_id = ${orgId}`);
    }
    if (body.es_default === true) {
        await withOrgTx(orgId, sql`update impuestos set es_default = false where org_id = ${orgId} and kind = ${kind}`);
        await withOrgTx(orgId, sql`update impuestos set es_default = true where id = ${id} and org_id = ${orgId}`);
    } else if (body.es_default === false) {
        await withOrgTx(orgId, sql`update impuestos set es_default = false where id = ${id} and org_id = ${orgId}`);
    }
    await syncOrg(orgId, tipo, kind);
    return json({ ok: true });
};

export const DELETE: APIRoute = async ({ request }) => {
    const denied = await requirePerm('ajustes'); if (denied) return denied;
    let body: any;
    try { body = await request.json(); } catch { return json({ error: 'JSON inválido' }, 400); }
    const id = String(body.id ?? '');
    if (!id) return json({ error: 'Falta id' }, 400);

    const orgId = await getActiveOrgId();
    const [rows] = await withOrgTx(orgId, sql`delete from impuestos where id = ${id} and org_id = ${orgId} returning tipo, kind, nombre`);
    if (!rows.length) return json({ error: 'No encontrado' }, 404);
    await syncOrg(orgId, rows[0].tipo as string, (rows[0].kind as string) || kindFromTipo(rows[0].tipo as string));
    await logAudit(orgId, { accion: 'impuesto.eliminado', entidad: 'impuesto', entidad_id: id, detalle: rows[0].nombre as string, ip: reqIp(request) });
    return json({ ok: true });
};

/**
 * Siembra el catálogo con las tasas estándar del país de la organización.
 *
 * No es una tabla tributaria (Cord no mantiene las reglas de 200 países): es el
 * punto de partida editable que evita que una cuenta nueva en Madrid nazca
 * vacía o —peor— con el 16% mexicano heredado. Solo siembra si el catálogo está
 * vacío: nunca pisa lo que el negocio ya configuró con su contador.
 */
async function seedFromCountry(request: Request) {
    const orgId = await getActiveOrgId();
    const [[existente], [org]] = await withOrgTx(orgId,
        sql`select count(*)::int as n from impuestos where org_id = ${orgId}`,
        sql`select country_code, fiscal_metadata from orgs where id = ${orgId}`,
    );
    if (Number(existente?.n ?? 0) > 0) {
        return json({ error: 'Tu catálogo ya tiene perfiles. Elimina los que no uses antes de volver a partir de cero.' }, 409);
    }

    const pais = String(org?.country_code || 'MX').toUpperCase();
    // Sales tax es ESTATAL en Estados Unidos: sin el estado del negocio
    // (Ajustes › Fiscal, ya capturado ahí para la dirección de facturación)
    // no hay tasa que sembrar y se cae al mismo "Exento" de siempre.
    const region = pais === 'US' ? String((org?.fiscal_metadata as any)?.region || '') : null;
    const creados = await seedTaxCatalog(orgId, pais, region);
    await syncOrg(orgId, 'iva', 'consumo');
    await logAudit(orgId, { accion: 'impuesto.sembrado', entidad: 'impuesto', detalle: `${creados} perfiles de ${pais}`, ip: reqIp(request) });
    return json({ creados });
}

function json(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

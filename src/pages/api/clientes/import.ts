// /api/clientes/import — carga masiva del directorio desde CSV.
//   POST { rows: [{ empresa, contacto?, email?, telefono?, rfc?, terminos?, limite? }], upsert?: bool }
//        → { created, updated, total, rejected: [{ row, empresa, rfc, error, code }] }
// Dedupe dentro de la org: con upsert (default) actualiza el cliente que coincide
// por RFC (si viene) o por nombre de empresa; el resto se inserta. Filas sin empresa
// se omiten.
//
// El identificador fiscal se valida fila por fila con el país del cliente que
// se actualiza o, si es nuevo, con el de la organización (un cliente importado
// nace sin país: hereda el del emisor). Una fila inválida NO tumba el lote: se
// omite y vuelve en `rejected` con el motivo (`row` es su posición, desde 1, en
// `rows`). Solo si ninguna fila entra se responde 422, para que la pantalla
// muestre el porqué en vez de recargar como si hubiera importado algo.
export const prerender = false;

import type { APIRoute } from 'astro';
import { sql, getActiveOrgId, withOrgTx } from '../../../lib/db';
import { requirePerm } from '../../../lib/queries';
import { validateTaxId } from '../../../lib/tax-id';

const MAX_ROWS = 2000;
const TERMINOS = new Set(['contado', 'net30', 'net60']);

// Llave de búsqueda por identificador: sin separadores, para que "B-12345674"
// encuentre al cliente guardado como "B12345674".
const taxKey = (v: unknown) => String(v ?? '').toUpperCase().replace(/[\s.\-/,]/g, '');

export const POST: APIRoute = async ({ request }) => {
    // Mismo permiso que crear o editar un cliente uno por uno en /api/clientes.
    const denied = await requirePerm('clientes'); if (denied) return denied;
    let body: any;
    try { body = await request.json(); } catch { return json({ error: 'JSON inválido' }, 400); }

    const raw = Array.isArray(body.rows) ? body.rows : [];
    if (!raw.length) return json({ error: 'No hay filas para importar' }, 400);
    if (raw.length > MAX_ROWS) return json({ error: `Máximo ${MAX_ROWS} filas por importación` }, 400);
    const upsert = body.upsert !== false;

    const rows = raw.map((r: any, i: number) => ({
        row: i + 1,
        empresa: String(r?.empresa ?? '').trim(),
        contacto: String(r?.contacto ?? '').trim() || null,
        email: String(r?.email ?? '').trim() || null,
        telefono: String(r?.telefono ?? '').trim() || null,
        rfc: String(r?.rfc ?? '').trim().toUpperCase() || null,
        terminos: TERMINOS.has(String(r?.terminos)) ? String(r.terminos) : 'contado',
        limite: (r?.limite === '' || r?.limite === null || r?.limite === undefined) ? null : Math.max(0, Number(r.limite) || 0),
    })).filter((r: any) => r.empresa);

    if (!rows.length) return json({ error: 'Ninguna fila tiene nombre de empresa' }, 400);

    const orgId = await getActiveOrgId();
    const [existing, orgRows] = await withOrgTx(orgId,
        sql`select id, empresa, rfc, country_code from clientes where org_id = ${orgId}`,
        sql`select country_code from orgs where id = ${orgId}`);
    const orgCountry = String(orgRows[0]?.country_code ?? '');
    const byRfc = new Map<string, string>();
    const byName = new Map<string, string>();
    const current = new Map<string, { rfc: string; country: string | null }>();
    for (const e of existing as any[]) {
        if (e.rfc) byRfc.set(taxKey(e.rfc), e.id as string);
        byName.set(String(e.empresa).toLowerCase(), e.id as string);
        current.set(e.id as string, { rfc: taxKey(e.rfc), country: (e.country_code as string | null) ?? null });
    }

    let created = 0, updated = 0;
    const rejected: { row: number; empresa: string; rfc: string; error: string; code: string }[] = [];
    for (const r of rows) {
        const key = r.rfc ? taxKey(r.rfc) : '';
        const hit = upsert
            ? (key && byRfc.get(key)) || byName.get(r.empresa.toLowerCase())
            : undefined;
        if (r.rfc) {
            const prev = hit ? current.get(hit) : undefined;
            // Un identificador que ya estaba guardado igual no se revalida: la
            // importación no es el lugar para bloquear un dato antiguo que nadie cambió.
            if (!prev || prev.rfc !== key) {
                const v = validateTaxId(prev?.country ?? orgCountry, r.rfc);
                if (!v.ok) {
                    rejected.push({ row: r.row, empresa: r.empresa, rfc: r.rfc, error: v.reason, code: 'invalid_tax_id' });
                    continue;
                }
                r.rfc = v.normalized;
            }
        }
        if (hit) {
            await withOrgTx(orgId, sql`update clientes set empresa = ${r.empresa}, contacto = ${r.contacto}, email = ${r.email},
                      telefono = ${r.telefono}, rfc = ${r.rfc}, terminos_default = ${r.terminos}, limite_credito = ${r.limite}
                      where id = ${hit} and org_id = ${orgId}`);
            if (r.rfc) {
                byRfc.set(taxKey(r.rfc), hit);
                current.set(hit, { rfc: taxKey(r.rfc), country: current.get(hit)?.country ?? null });
            }
            updated++;
        } else {
            const [insRows] = await withOrgTx(orgId, sql`insert into clientes (org_id, empresa, contacto, email, telefono, rfc, terminos_default, limite_credito)
                      values (${orgId}, ${r.empresa}, ${r.contacto}, ${r.email}, ${r.telefono}, ${r.rfc}, ${r.terminos}, ${r.limite})
                      returning id`);
            const ins = insRows[0];
            if (upsert) {
                byName.set(r.empresa.toLowerCase(), ins.id as string);
                if (r.rfc) byRfc.set(taxKey(r.rfc), ins.id as string);
                current.set(ins.id as string, { rfc: taxKey(r.rfc), country: null });
            }
            created++;
        }
    }

    if (!created && !updated && rejected.length) {
        const first = rejected[0];
        return json({
            error: `No se importó ninguna fila: ${rejected.length === 1 ? 'una tiene' : `${rejected.length} tienen`} un identificador fiscal no válido. Fila ${first.row} (${first.empresa}): ${first.error}`,
            code: 'invalid_tax_id',
            created, updated, total: rows.length, rejected,
        }, 422);
    }
    return json({ created, updated, total: rows.length, rejected });
};

function json(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

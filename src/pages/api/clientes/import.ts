// /api/clientes/import — carga masiva del directorio desde CSV.
//   POST { rows: [{ empresa, contacto?, email?, telefono?, rfc?, terminos?, limite? }], upsert?: bool }
//        → { created, updated, total }
// Dedupe dentro de la org: con upsert (default) actualiza el cliente que coincide
// por RFC (si viene) o por nombre de empresa; el resto se inserta. Filas sin empresa
// se omiten.
export const prerender = false;

import type { APIRoute } from 'astro';
import { sql, getActiveOrgId } from '../../../lib/db';

const MAX_ROWS = 2000;
const TERMINOS = new Set(['contado', 'net30', 'net60']);

export const POST: APIRoute = async ({ request }) => {
    let body: any;
    try { body = await request.json(); } catch { return json({ error: 'JSON inválido' }, 400); }

    const raw = Array.isArray(body.rows) ? body.rows : [];
    if (!raw.length) return json({ error: 'No hay filas para importar' }, 400);
    if (raw.length > MAX_ROWS) return json({ error: `Máximo ${MAX_ROWS} filas por importación` }, 400);
    const upsert = body.upsert !== false;

    const rows = raw.map((r: any) => ({
        empresa: String(r.empresa ?? '').trim(),
        contacto: String(r.contacto ?? '').trim() || null,
        email: String(r.email ?? '').trim() || null,
        telefono: String(r.telefono ?? '').trim() || null,
        rfc: String(r.rfc ?? '').trim().toUpperCase() || null,
        terminos: TERMINOS.has(String(r.terminos)) ? String(r.terminos) : 'contado',
        limite: (r.limite === '' || r.limite === null || r.limite === undefined) ? null : Math.max(0, Number(r.limite) || 0),
    })).filter((r: any) => r.empresa);

    if (!rows.length) return json({ error: 'Ninguna fila tiene nombre de empresa' }, 400);

    const orgId = await getActiveOrgId();
    const existing = await sql`select id, empresa, rfc from clientes where org_id = ${orgId}`;
    const byRfc = new Map<string, string>();
    const byName = new Map<string, string>();
    for (const e of existing as any[]) {
        if (e.rfc) byRfc.set(String(e.rfc).toUpperCase(), e.id as string);
        byName.set(String(e.empresa).toLowerCase(), e.id as string);
    }

    let created = 0, updated = 0;
    for (const r of rows) {
        const hit = upsert
            ? (r.rfc && byRfc.get(r.rfc)) || byName.get(r.empresa.toLowerCase())
            : undefined;
        if (hit) {
            await sql`update clientes set empresa = ${r.empresa}, contacto = ${r.contacto}, email = ${r.email},
                      telefono = ${r.telefono}, rfc = ${r.rfc}, terminos_default = ${r.terminos}, limite_credito = ${r.limite}
                      where id = ${hit} and org_id = ${orgId}`;
            updated++;
        } else {
            const [ins] = await sql`insert into clientes (org_id, empresa, contacto, email, telefono, rfc, terminos_default, limite_credito)
                      values (${orgId}, ${r.empresa}, ${r.contacto}, ${r.email}, ${r.telefono}, ${r.rfc}, ${r.terminos}, ${r.limite})
                      returning id`;
            if (upsert) {
                byName.set(r.empresa.toLowerCase(), ins.id as string);
                if (r.rfc) byRfc.set(r.rfc, ins.id as string);
            }
            created++;
        }
    }

    return json({ created, updated, total: rows.length });
};

function json(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

// /api/clientes — CRUD del directorio de clientes de la org activa.
//   POST   { empresa, contacto?, email?, telefono?, rfc?, terminos?, limite? }   → { id }
//   PATCH  { id, ...mismos campos }                                              → { ok }
//   DELETE { id }                                                                → { ok }
export const prerender = false;

import type { APIRoute } from 'astro';
import { sql, getActiveOrgId, logAudit, reqIp } from '../../lib/db';
import { requirePerm } from '../../lib/queries';

const TERMINOS = ['contado', 'net30', 'net60'];
const NIVELES = ['estandar', 'plata', 'oro', 'distribuidor'];

function clean(body: any) {
    return {
        empresa: String(body.empresa ?? '').trim(),
        contacto: String(body.contacto ?? '').trim() || null,
        email: String(body.email ?? '').trim() || null,
        telefono: String(body.telefono ?? '').trim() || null,
        rfc: String(body.rfc ?? '').trim().toUpperCase() || null,
        terminos: TERMINOS.includes(body.terminos) ? body.terminos : 'contado',
        limite: body.limite === '' || body.limite === null || body.limite === undefined
            ? null : Math.max(0, Number(body.limite) || 0),
        nivel: NIVELES.includes(body.nivel) ? body.nivel : 'estandar',
        descuento: Math.min(100, Math.max(0, Number(body.descuento_pct) || 0)),
        regimen_fiscal: String(body.regimen_fiscal ?? '').trim() || null,
        uso_cfdi: String(body.uso_cfdi ?? '').trim() || null,
        cp_fiscal: String(body.cp_fiscal ?? '').trim().replace(/\D/g, '').slice(0, 5) || null,
    };
}

export const POST: APIRoute = async ({ request }) => {
    const denied = await requirePerm('clientes'); if (denied) return denied;
    let body: any;
    try { body = await request.json(); } catch { return json({ error: 'JSON inválido' }, 400); }
    const c = clean(body);
    if (!c.empresa) return json({ error: 'El nombre de la empresa es obligatorio' }, 400);

    const orgId = await getActiveOrgId();
    const [row] = await sql`
        insert into clientes (org_id, empresa, contacto, email, telefono, rfc, terminos_default, limite_credito, nivel, descuento_pct, regimen_fiscal, uso_cfdi, cp_fiscal)
        values (${orgId}, ${c.empresa}, ${c.contacto}, ${c.email}, ${c.telefono}, ${c.rfc}, ${c.terminos}, ${c.limite}, ${c.nivel}, ${c.descuento}, ${c.regimen_fiscal}, ${c.uso_cfdi}, ${c.cp_fiscal})
        returning id`;
    await logAudit(orgId, { accion: 'cliente.creado', entidad: 'cliente', entidad_id: row.id as string, detalle: c.empresa, ip: reqIp(request) });
    return json({ id: row.id });
};

export const PATCH: APIRoute = async ({ request }) => {
    const denied = await requirePerm('clientes'); if (denied) return denied;
    let body: any;
    try { body = await request.json(); } catch { return json({ error: 'JSON inválido' }, 400); }
    if (!body.id) return json({ error: 'Falta id' }, 400);
    const c = clean(body);
    if (!c.empresa) return json({ error: 'El nombre de la empresa es obligatorio' }, 400);

    const orgId = await getActiveOrgId();
    const rows = await sql`
        update clientes set
            empresa = ${c.empresa}, contacto = ${c.contacto}, email = ${c.email},
            telefono = ${c.telefono}, rfc = ${c.rfc},
            terminos_default = ${c.terminos}, limite_credito = ${c.limite},
            nivel = ${c.nivel}, descuento_pct = ${c.descuento},
            regimen_fiscal = ${c.regimen_fiscal}, uso_cfdi = ${c.uso_cfdi}, cp_fiscal = ${c.cp_fiscal}
        where id = ${body.id} and org_id = ${orgId}
        returning id`;
    if (!rows.length) return json({ error: 'Cliente no encontrado' }, 404);
    return json({ ok: true });
};

export const DELETE: APIRoute = async ({ request }) => {
    const denied = await requirePerm('clientes'); if (denied) return denied;
    let body: any;
    try { body = await request.json(); } catch { return json({ error: 'JSON inválido' }, 400); }
    if (!body.id) return json({ error: 'Falta id' }, 400);

    const orgId = await getActiveOrgId();
    const rows = await sql`delete from clientes where id = ${body.id} and org_id = ${orgId} returning id, empresa`;
    if (!rows.length) return json({ error: 'Cliente no encontrado' }, 404);
    await logAudit(orgId, { accion: 'cliente.eliminado', entidad: 'cliente', entidad_id: body.id, detalle: rows[0].empresa as string, ip: reqIp(request) });
    return json({ ok: true });
};

function json(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

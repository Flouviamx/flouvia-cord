// /api/promesas — promesas de pago (compromiso del cliente para una fecha).
// Seguimiento manual de cobranza; no automatiza nada, solo registra el acuerdo.
//   POST   { cotizacion_id, fecha_promesa, monto?, nota? }     → { id }
//   PATCH  { id, estado }   estado ∈ pendiente|cumplida|incumplida → { ok }
//   DELETE { id }                                              → { ok }
export const prerender = false;

import type { APIRoute } from 'astro';
import { sql, getActiveOrgId, logAudit, reqIp, withOrgTx } from '../../lib/db';
import { requirePerm } from '../../lib/queries';

const ESTADOS = new Set(['pendiente', 'cumplida', 'incumplida']);

export const POST: APIRoute = async ({ request }) => {
    const denied = await requirePerm('cobranza'); if (denied) return denied;
    let body: any;
    try { body = await request.json(); } catch { return json({ error: 'JSON inválido' }, 400); }

    const cotizacionId = String(body.cotizacion_id ?? '').trim();
    const fecha = String(body.fecha_promesa ?? '').trim();
    if (!cotizacionId) return json({ error: 'Falta la cotización' }, 400);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return json({ error: 'Elige la fecha en que el cliente promete pagar' }, 400);
    const monto = body.monto != null && body.monto !== '' ? Math.max(0, Number(body.monto) || 0) : null;
    const nota = String(body.nota ?? '').trim().slice(0, 400) || null;

    const orgId = await getActiveOrgId();
    // Verifica que la cotización pertenezca a la org (RLS + ownership explícito).
    const [own] = await withOrgTx(orgId, sql`select id from cotizaciones where id = ${cotizacionId} and org_id = ${orgId}`);
    if (!own.length) return json({ error: 'Cotización no encontrada' }, 404);

    const [[row]] = await withOrgTx(orgId, sql`
        insert into promesas_pago (org_id, cotizacion_id, fecha_promesa, monto, nota)
        values (${orgId}, ${cotizacionId}, ${fecha}, ${monto}, ${nota})
        returning id`);
    await logAudit(orgId, { accion: 'promesa.creada', entidad: 'cotizacion', entidad_id: cotizacionId, detalle: `Promesa de pago para ${fecha}`, ip: reqIp(request) });
    return json({ id: row.id });
};

export const PATCH: APIRoute = async ({ request }) => {
    const denied = await requirePerm('cobranza'); if (denied) return denied;
    let body: any;
    try { body = await request.json(); } catch { return json({ error: 'JSON inválido' }, 400); }
    if (!body.id) return json({ error: 'Falta id' }, 400);
    const estado = String(body.estado ?? '').trim();
    if (!ESTADOS.has(estado)) return json({ error: 'Estado inválido' }, 400);

    const orgId = await getActiveOrgId();
    const [rows] = await withOrgTx(orgId, sql`update promesas_pago set estado = ${estado} where id = ${body.id} and org_id = ${orgId} returning id`);
    if (!rows.length) return json({ error: 'Promesa no encontrada' }, 404);
    return json({ ok: true });
};

export const DELETE: APIRoute = async ({ request }) => {
    const denied = await requirePerm('cobranza'); if (denied) return denied;
    let body: any;
    try { body = await request.json(); } catch { return json({ error: 'JSON inválido' }, 400); }
    if (!body.id) return json({ error: 'Falta id' }, 400);
    const orgId = await getActiveOrgId();
    const [rows] = await withOrgTx(orgId, sql`delete from promesas_pago where id = ${body.id} and org_id = ${orgId} returning id`);
    if (!rows.length) return json({ error: 'Promesa no encontrada' }, 404);
    return json({ ok: true });
};

function json(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

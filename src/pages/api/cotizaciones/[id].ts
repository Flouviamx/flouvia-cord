// /api/cotizaciones/[id] — acciones sobre una cotización existente.
//   PATCH  { action: 'send' | 'approve' | 'reject' | 'paid' | 'invoiced' }  → { ok, status }
//   DELETE                                                                   → { ok } (solo borradores)
// Cada acción valida la transición, actualiza el status y registra el evento.
export const prerender = false;

import type { APIRoute } from 'astro';
import { sql, getActiveOrgId } from '../../../lib/db';

// Transiciones permitidas: action → { desde[], status final, evento }
const ACTIONS: Record<string, { from: string[]; to: string; evento: string; detalle: string }> = {
    send:     { from: ['draft'],                      to: 'sent',     evento: 'sent',     detalle: 'Cotización enviada — link generado' },
    resend:   { from: ['sent', 'viewed', 'expired'],  to: 'sent',     evento: 'sent',     detalle: 'Cotización reenviada al cliente' },
    approve:  { from: ['sent', 'viewed'],             to: 'approved', evento: 'approved', detalle: 'Cotización marcada como aprobada' },
    reject:   { from: ['sent', 'viewed'],             to: 'rejected', evento: 'rejected', detalle: 'Cotización marcada como rechazada' },
    paid:     { from: ['approved', 'invoiced'],       to: 'paid',     evento: 'paid',     detalle: 'Pago registrado' },
    invoiced: { from: ['approved', 'paid'],           to: 'invoiced', evento: 'invoiced', detalle: 'CFDI emitido' },
};

export const PATCH: APIRoute = async ({ params, request }) => {
    const id = params.id ?? '';
    let body: any;
    try { body = await request.json(); } catch { return json({ error: 'JSON inválido' }, 400); }

    // Respuesta del vendedor al cliente (no cambia estado; alimenta la conversación de /q)
    if (body.action === 'reply') {
        const orgId = await getActiveOrgId();
        const mensaje = String(body.mensaje ?? '').trim().slice(0, 800);
        if (!mensaje) return json({ error: 'Escribe una respuesta' }, 400);
        const rows = await sql`select id from cotizaciones where id = ${id} and org_id = ${orgId}`;
        if (!rows.length) return json({ error: 'Cotización no encontrada' }, 404);
        await sql`insert into eventos (org_id, cotizacion_id, tipo, detalle)
                  values (${orgId}, ${id}, 'reply', ${'Respondiste: "' + mensaje + '"'})`;
        return json({ ok: true });
    }

    const action = ACTIONS[body.action];
    if (!action) return json({ error: 'Acción no válida' }, 400);

    const orgId = await getActiveOrgId();
    const rows = await sql`select id, status from cotizaciones where id = ${id} and org_id = ${orgId}`;
    if (!rows.length) return json({ error: 'Cotización no encontrada' }, 404);

    const actual = rows[0].status as string;
    if (!action.from.includes(actual)) {
        return json({ error: `No se puede pasar de "${actual}" con esta acción` }, 409);
    }

    const now = new Date().toISOString();
    if (action.to === 'sent') {
        await sql`update cotizaciones set status = 'sent', sent_at = coalesce(sent_at, ${now}) where id = ${id}`;
    } else if (action.to === 'approved') {
        await sql`update cotizaciones set status = 'approved', approved_at = ${now} where id = ${id}`;
    } else {
        await sql.query(`update cotizaciones set status = $1 where id = $2`, [action.to, id]);
    }

    await sql`insert into eventos (org_id, cotizacion_id, tipo, detalle)
              values (${orgId}, ${id}, ${action.evento}, ${action.detalle})`;

    return json({ ok: true, status: action.to });
};

export const DELETE: APIRoute = async ({ params }) => {
    const id = params.id ?? '';
    const orgId = await getActiveOrgId();
    const rows = await sql`
        delete from cotizaciones
        where id = ${id} and org_id = ${orgId} and status = 'draft'
        returning id`;
    if (!rows.length) return json({ error: 'Solo se pueden eliminar borradores' }, 409);
    return json({ ok: true });
};

function json(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

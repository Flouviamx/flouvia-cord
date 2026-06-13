// /api/q/[token] — acciones del CLIENTE final sobre el link público.
// No requiere auth: el token (random de 16 bytes) es el secreto.
//   POST { action: 'approve' | 'reject' | 'comment' | 'counter',
//          comentario?, mensaje?, propuesta? }  → { ok, status? }
// approve/reject cambian el estado; comment/counter NO (alimentan la conversación).
export const prerender = false;

import type { APIRoute } from 'astro';
import { sql } from '../../../lib/db';

const money = (n: number) => '$' + new Intl.NumberFormat('es-MX', { minimumFractionDigits: 2 }).format(n);

export const POST: APIRoute = async ({ params, request }) => {
    const token = params.token ?? '';
    let body: any;
    try { body = await request.json(); } catch { return json({ error: 'JSON inválido' }, 400); }

    const action = body.action;
    const rows = await sql`select id, org_id, status from cotizaciones where public_token = ${token}`;
    if (!rows.length) return json({ error: 'Cotización no encontrada' }, 404);
    const c = rows[0];
    const alive = ['sent', 'viewed'].includes(c.status as string);

    // ── Heartbeat de presencia (el cliente tiene el link abierto AHORA) ──
    if (action === 'ping') {
        await sql`update cotizaciones set viewer_last_seen = now() where id = ${c.id}`;
        return json({ ok: true });
    }

    // ── Aprobar ──
    if (action === 'approve') {
        if (!alive) return json({ error: 'Esta cotización ya no se puede modificar', status: c.status }, 409);
        await sql`update cotizaciones set status = 'approved', approved_at = now() where id = ${c.id}`;
        await sql`insert into eventos (org_id, cotizacion_id, tipo, detalle)
                  values (${c.org_id}, ${c.id}, 'approved', 'El cliente aprobó la cotización desde el link')`;
        return json({ ok: true, status: 'approved' });
    }

    // ── Rechazar ──
    if (action === 'reject') {
        if (!alive) return json({ error: 'Esta cotización ya no se puede modificar', status: c.status }, 409);
        await sql`update cotizaciones set status = 'rejected' where id = ${c.id}`;
        const comentario = String(body.comentario ?? '').trim().slice(0, 500);
        await sql`insert into eventos (org_id, cotizacion_id, tipo, detalle)
                  values (${c.org_id}, ${c.id}, 'rejected', ${comentario ? `El cliente rechazó: "${comentario}"` : 'El cliente rechazó la cotización desde el link'})`;
        return json({ ok: true, status: 'rejected' });
    }

    // ── Comentario / pregunta (no cambia estado) ──
    if (action === 'comment') {
        const mensaje = String(body.mensaje ?? '').trim().slice(0, 800);
        if (!mensaje) return json({ error: 'Escribe un mensaje' }, 400);
        if (c.status === 'draft') return json({ error: 'Cotización no disponible' }, 409);
        await sql`insert into eventos (org_id, cotizacion_id, tipo, detalle)
                  values (${c.org_id}, ${c.id}, 'comment', ${`El cliente escribió: "${mensaje}"`})`;
        return json({ ok: true });
    }

    // ── Contraoferta (no cambia estado; avisa al vendedor) ──
    if (action === 'counter') {
        if (!alive) return json({ error: 'Esta cotización ya no admite contraofertas', status: c.status }, 409);
        const mensaje = String(body.mensaje ?? '').trim().slice(0, 800);
        const propuesta = Number(body.propuesta) > 0 ? Number(body.propuesta) : null;
        if (!mensaje && !propuesta) return json({ error: 'Indica tu propuesta o escribe un mensaje' }, 400);
        const detalle = `Contraoferta del cliente${propuesta ? ` (${money(propuesta)})` : ''}${mensaje ? `: "${mensaje}"` : ''}`;
        await sql`insert into eventos (org_id, cotizacion_id, tipo, detalle)
                  values (${c.org_id}, ${c.id}, 'counter', ${detalle})`;
        return json({ ok: true });
    }

    return json({ error: 'Acción no válida' }, 400);
};

function json(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

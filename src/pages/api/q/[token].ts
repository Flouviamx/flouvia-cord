// /api/q/[token] — acciones del CLIENTE final sobre el link público.
// No requiere auth: el token (random de 16 bytes) es el secreto.
//   POST { action: 'approve' | 'reject' | 'comment' | 'counter',
//          comentario?, mensaje?, propuesta? }  → { ok, status? }
// approve/reject cambian el estado; comment/counter NO (alimentan la conversación).
export const prerender = false;

import type { APIRoute } from 'astro';
import { createHash } from 'node:crypto';
import { sql } from '../../../lib/db';
import { dispatchQuoteEvent } from '../../../lib/webhooks';

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
        const signedBy = String(body.signed_by ?? '').trim().slice(0, 200);
        const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'desconocida';
        const ua = request.headers.get('user-agent') ?? 'desconocido';
        const email = String(body.email ?? '').trim().slice(0, 200);
        
        const allItems = await sql`select id, descripcion, cantidad, precio_unitario, precio_negociado from cotizacion_items where cotizacion_id = ${c.id} order by orden`;

        // Aprobación parcial: el cliente puede incluir solo un subconjunto de líneas.
        // accepted_items = ids que SÍ aprueba; si no viene o las cubre todas, es total.
        const acceptedRaw = Array.isArray(body.accepted_items) ? body.accepted_items.map((x: any) => String(x)) : null;
        const validIds = new Set(allItems.map((it: any) => String(it.id)));
        const accepted = acceptedRaw ? new Set(acceptedRaw.filter((id: string) => validIds.has(id))) : null;
        if (accepted && accepted.size === 0) return json({ error: 'Selecciona al menos una línea para aprobar' }, 400);
        const isPartial = !!accepted && accepted.size < allItems.length;

        // Las líneas que firma legalmente el cliente = las aceptadas (o todas).
        const lineSub = (it: any) => Number(it.cantidad) * Number(it.precio_negociado ?? it.precio_unitario);
        const firmadas = accepted ? allItems.filter((it: any) => accepted.has(String(it.id))) : allItems;
        const subAceptado = firmadas.reduce((s: number, it: any) => s + lineSub(it), 0);
        const subTotal = allItems.reduce((s: number, it: any) => s + lineSub(it), 0);

        // El hash inmutable cubre SOLO lo aceptado (lo que el cliente realmente firmó).
        const payload = JSON.stringify({
            quote_id: c.id,
            status: isPartial ? 'approved_partial' : 'approved',
            signed_by: signedBy,
            ip,
            items: firmadas,
        });
        const snapshotHash = createHash('sha256').update(payload).digest('hex');

        const detalle = isPartial
            ? `Firmado por "${signedBy || 'Anónimo'}" — aprobó ${firmadas.length} de ${allItems.length} líneas (${money(subAceptado)} de ${money(subTotal)}) (IP ${ip})`
            : (signedBy ? `Firmado digitalmente por "${signedBy}" (IP ${ip})` : 'El cliente aprobó la cotización desde el link');

        // El driver HTTP de Neon NO soporta sql.begin(callback); usa sql.transaction([...]).
        const txQueries: any[] = [
            sql`update cotizaciones set status = 'approved', approved_at = now() where id = ${c.id}`,
        ];
        // Marca el estado de cada línea (solo cambia algo en aprobación parcial).
        if (isPartial) {
            for (const it of allItems) {
                const ok = accepted!.has(String(it.id));
                txQueries.push(sql`update cotizacion_items set aprobado = ${ok} where id = ${it.id} and cotizacion_id = ${c.id}`);
            }
        }
        txQueries.push(sql`insert into eventos (org_id, cotizacion_id, tipo, detalle)
                  values (${c.org_id}, ${c.id}, 'approved', ${detalle})`);
        txQueries.push(sql`insert into cotizacion_firmas (org_id, cotizacion_id, firmante_nombre, firmante_email, firmante_ip, user_agent, snapshot_hash)
                  values (${c.org_id}, ${c.id}, ${signedBy || 'Anónimo'}, ${email || null}, ${ip}, ${ua}, ${snapshotHash})`);
        await (sql as any).transaction(txQueries);
        await dispatchQuoteEvent(c.org_id as string, c.id as string, 'quote.approved');
        return json({ ok: true, status: 'approved', hash: snapshotHash, partial: isPartial });
    }

    // ── Rechazar ──
    if (action === 'reject') {
        if (!alive) return json({ error: 'Esta cotización ya no se puede modificar', status: c.status }, 409);
        await sql`update cotizaciones set status = 'rejected' where id = ${c.id}`;
        const comentario = String(body.comentario ?? '').trim().slice(0, 500);
        await sql`insert into eventos (org_id, cotizacion_id, tipo, detalle)
                  values (${c.org_id}, ${c.id}, 'rejected', ${comentario ? `El cliente rechazó: "${comentario}"` : 'El cliente rechazó la cotización desde el link'})`;
        await dispatchQuoteEvent(c.org_id as string, c.id as string, 'quote.rejected');
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

    // ── Comentario por línea (no cambia estado) ──
    if (action === 'item_comment') {
        const mensaje = String(body.mensaje ?? '').trim().slice(0, 800);
        const itemId = String(body.item_id ?? '').trim();
        if (!mensaje || !itemId) return json({ error: 'Datos incompletos' }, 400);
        if (c.status === 'draft') return json({ error: 'Cotización no disponible' }, 409);
        
        // Verificar que el item pertenece a la cotización
        const [item] = await sql`select id from cotizacion_items where id = ${itemId} and cotizacion_id = ${c.id}`;
        if (!item) return json({ error: 'Línea no encontrada' }, 404);

        await sql`insert into cotizacion_comentarios (org_id, cotizacion_id, item_id, autor_tipo, autor_nombre, contenido)
                  values (${c.org_id}, ${c.id}, ${itemId}, 'cliente', 'Cliente', ${mensaje})`;
        return json({ ok: true });
    }

    return json({ error: 'Acción no válida' }, 400);
};

function json(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

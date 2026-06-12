// POST /api/cotizaciones — crea una cotización real en Neon (borrador o enviada).
// Body JSON: { cliente_id, terminos, vigencia_dias, notas, send, items: [...] }
//   items[]: { producto_id?, descripcion, cantidad, precio_unitario, precio_negociado|null }
// Responde: { id, folio, token }
export const prerender = false;

import type { APIRoute } from 'astro';
import { sql, getActiveOrgId } from '../../lib/db';

const IVA_PCT = 0.16;

export const POST: APIRoute = async ({ request }) => {
    let body: any;
    try { body = await request.json(); }
    catch { return json({ error: 'JSON inválido' }, 400); }

    const items = Array.isArray(body.items) ? body.items : [];
    if (!items.length) return json({ error: 'Agrega al menos un producto' }, 400);

    const orgId = await getActiveOrgId();

    // Totales (server-side, no confiar en el cliente)
    let subtotal = 0;
    for (const it of items) {
        const precio = it.precio_negociado ?? it.precio_unitario ?? 0;
        subtotal += Number(precio) * Number(it.cantidad ?? 1);
    }
    const iva = subtotal * IVA_PCT;
    const total = subtotal + iva;

    // Folio: prefix de la org + (máximo número existente + 1), así continúa la
    // secuencia visible (…0148 → 0149) en vez de reiniciar por count.
    const [{ prefix }] = await sql`select quote_prefix as prefix from orgs where id = ${orgId}`;
    const [{ maxn }] = await sql`
        select coalesce(max(nullif(regexp_replace(folio, '\\D', '', 'g'), '')::int), 0) as maxn
        from cotizaciones where org_id = ${orgId}`;
    const folio = `${prefix}-${String(Number(maxn) + 1).padStart(4, '0')}`;

    const status = body.send ? 'sent' : 'draft';
    const terminos = ['contado', 'net30', 'net60'].includes(body.terminos) ? body.terminos : 'contado';
    const dias = Number(body.vigencia_dias) || 30;
    const vigencia = new Date(); vigencia.setDate(vigencia.getDate() + dias);
    const clienteId = body.cliente_id || null;
    const sentAt = body.send ? new Date().toISOString() : null;

    const [cot] = await sql`
        insert into cotizaciones
            (org_id, cliente_id, folio, status, subtotal, iva, total, terminos, vigencia, notas, sent_at)
        values
            (${orgId}, ${clienteId}, ${folio}, ${status}, ${subtotal}, ${iva}, ${total},
             ${terminos}, ${vigencia.toISOString()}, ${body.notas || null}, ${sentAt})
        returning id, public_token`;

    let orden = 0;
    for (const it of items) {
        await sql`
            insert into cotizacion_items
                (cotizacion_id, producto_id, descripcion, cantidad, precio_unitario, precio_negociado, orden)
            values
                (${cot.id}, ${it.producto_id || null}, ${it.descripcion}, ${Number(it.cantidad) || 1},
                 ${Number(it.precio_unitario) || 0},
                 ${it.precio_negociado === null || it.precio_negociado === undefined ? null : Number(it.precio_negociado)},
                 ${orden++})`;
    }

    await sql`insert into eventos (org_id, cotizacion_id, tipo, detalle)
              values (${orgId}, ${cot.id}, 'created', 'Borrador creado')`;
    if (body.send) {
        await sql`insert into eventos (org_id, cotizacion_id, tipo, detalle)
                  values (${orgId}, ${cot.id}, 'sent', 'Cotización enviada — link generado')`;
    }

    return json({ id: cot.id, folio, token: cot.public_token });
};

function json(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), {
        status, headers: { 'Content-Type': 'application/json' },
    });
}

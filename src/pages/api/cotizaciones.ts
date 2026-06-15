// POST /api/cotizaciones — crea una cotización real en Neon (borrador o enviada).
// Body JSON: { cliente_id, terminos, vigencia_dias, notas, send, items: [...] }
//   items[]: { producto_id?, descripcion, cantidad, precio_unitario, precio_negociado|null }
// Responde: { id, folio, token }
export const prerender = false;

import type { APIRoute } from 'astro';
import { sql, getActiveOrgId, logAudit, reqIp } from '../../lib/db';
import { notifyQuoteSent } from '../../lib/email';

const IVA_PCT = 0.16;
const money0 = (n: number) => '$' + new Intl.NumberFormat('es-MX').format(Math.round(n));

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

    // Folio + umbrales de aprobación de la org. select * → resiliente si aún no
    // se corre la migración (las columnas aprob_* simplemente vienen undefined → 0).
    const [org] = await sql`select * from orgs where id = ${orgId}`;
    const [{ maxn }] = await sql`
        select coalesce(max(nullif(regexp_replace(folio, '\\D', '', 'g'), '')::int), 0) as maxn
        from cotizaciones where org_id = ${orgId}`;
    const folio = `${org.quote_prefix}-${String(Number(maxn) + 1).padStart(4, '0')}`;

    // ── Flujo de aprobación: ¿el descuento o el monto rebasan los topes? ──
    let maxDescPct = 0;
    for (const it of items) {
        const lista = Number(it.precio_unitario) || 0;
        const nego = it.precio_negociado;
        if (nego !== null && nego !== undefined && lista > 0 && Number(nego) < lista) {
            maxDescPct = Math.max(maxDescPct, (1 - Number(nego) / lista) * 100);
        }
    }
    const aprobDesc = Number(org.aprob_descuento_max) || 0;
    const aprobMonto = Number(org.aprob_monto_max) || 0;
    const needsApproval = !!body.send && ((aprobDesc > 0 && maxDescPct > aprobDesc) || (aprobMonto > 0 && total > aprobMonto));
    let aprobEstado: string | null = null;
    let aprobMotivo: string | null = null;
    if (needsApproval) {
        const reasons: string[] = [];
        if (aprobDesc > 0 && maxDescPct > aprobDesc) reasons.push(`descuento ${Math.round(maxDescPct)}% supera el ${aprobDesc}% permitido`);
        if (aprobMonto > 0 && total > aprobMonto) reasons.push(`total ${money0(total)} supera el tope de ${money0(aprobMonto)}`);
        aprobEstado = 'pendiente';
        aprobMotivo = reasons.join(' y ');
    }

    const terminos = ['contado', 'net30', 'net60'].includes(body.terminos) ? body.terminos : 'contado';
    const dias = Number(body.vigencia_dias) || 30;
    const vigencia = new Date(); vigencia.setDate(vigencia.getDate() + dias);
    const clienteId = body.cliente_id || null;
    // Si requiere aprobación, NO se envía: queda como borrador pendiente.
    const status = needsApproval ? 'draft' : (body.send ? 'sent' : 'draft');
    const sentAt = (!needsApproval && body.send) ? new Date().toISOString() : null;

    const [cot] = await sql`
        insert into cotizaciones
            (org_id, cliente_id, folio, status, subtotal, iva, total, terminos, vigencia, notas, sent_at, aprob_estado, aprob_motivo)
        values
            (${orgId}, ${clienteId}, ${folio}, ${status}, ${subtotal}, ${iva}, ${total},
             ${terminos}, ${vigencia.toISOString()}, ${body.notas || null}, ${sentAt}, ${aprobEstado}, ${aprobMotivo})
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
    if (body.send && !needsApproval) {
        await sql`insert into eventos (org_id, cotizacion_id, tipo, detalle)
                  values (${orgId}, ${cot.id}, 'sent', 'Cotización enviada — link generado')`;
    }
    if (needsApproval) {
        await sql`insert into eventos (org_id, cotizacion_id, tipo, detalle)
                  values (${orgId}, ${cot.id}, 'comment', ${'Solicitud de aprobación: ' + aprobMotivo})`;
    }
    await logAudit(orgId, {
        accion: needsApproval ? 'cotizacion.aprobacion_solicitada' : (body.send ? 'cotizacion.enviada' : 'cotizacion.creada'),
        entidad: 'cotizacion', entidad_id: cot.id,
        detalle: folio + (needsApproval ? ' — ' + aprobMotivo : ''), ip: reqIp(request),
    });

    // Si se envía (y no requiere aprobación), avisa al cliente por correo (si hay Resend).
    let email: { sent: boolean; skipped?: string } | undefined;
    if (body.send && !needsApproval) {
        const origin = new URL(request.url).origin;
        email = await notifyQuoteSent(orgId, cot.id, origin);
        if (email.sent) {
            await sql`insert into eventos (org_id, cotizacion_id, tipo, detalle)
                      values (${orgId}, ${cot.id}, 'email', 'Correo enviado al cliente')`;
        }
    }

    return json({ id: cot.id, folio, token: cot.public_token, needsApproval, motivo: aprobMotivo, email });
};

function json(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), {
        status, headers: { 'Content-Type': 'application/json' },
    });
}

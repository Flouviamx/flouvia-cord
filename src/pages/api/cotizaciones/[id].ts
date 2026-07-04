// /api/cotizaciones/[id] — acciones sobre una cotización existente.
//   PATCH  { action: 'send' | 'approve' | 'reject' | 'paid' | 'invoiced' }  → { ok, status }
//   DELETE                                                                   → { ok } (solo borradores)
// Cada acción valida la transición, actualiza el status y registra el evento.
export const prerender = false;

import type { APIRoute } from 'astro';
import { sql, getActiveOrgId, logAudit, reqIp } from '../../../lib/db';
import { notifyQuoteSent } from '../../../lib/email';
import { requirePerm } from '../../../lib/queries';
import { dispatchQuoteEvent, type WebhookEvent } from '../../../lib/webhooks';
import { after } from '../../../lib/after';
import { reportUsage } from '../../../lib/billing';
import { emitFiscalDocument } from '../../../lib/fiscal/emit';

// Evento interno (eventos.tipo) → evento público de webhook.
const WH_MAP: Record<string, WebhookEvent> = {
    sent: 'quote.sent', approved: 'quote.approved', rejected: 'quote.rejected',
    paid: 'quote.paid', invoiced: 'invoice.stamped',
};

// Acciones que cambian la decisión de aprobación → requieren permiso 'aprobar';
// el resto (enviar, marcar pago, facturar, responder) requiere 'cotizar'.
const APROBAR_ACTIONS = new Set(['approve', 'reject', 'approve_request', 'reject_request']);

// Transiciones permitidas: action → { desde[], status final, evento }
const ACTIONS: Record<string, { from: string[]; to: string; evento: string; detalle: string }> = {
    send:         { from: ['draft'],                      to: 'sent',     evento: 'sent',     detalle: 'Cotización enviada — link generado' },
    resend:       { from: ['sent', 'viewed', 'expired'],  to: 'sent',     evento: 'sent',     detalle: 'Cotización reenviada al cliente' },
    update_draft: { from: ['draft'],                      to: 'draft',    evento: 'comment',  detalle: 'Borrador actualizado' },
    approve:      { from: ['sent', 'viewed'],             to: 'approved', evento: 'approved', detalle: 'Cotización marcada como aprobada' },
    reject:       { from: ['sent', 'viewed'],             to: 'rejected', evento: 'rejected', detalle: 'Cotización marcada como rechazada' },
    paid:         { from: ['approved', 'invoiced'],       to: 'paid',     evento: 'paid',     detalle: 'Pago registrado' },
    invoiced:     { from: ['approved', 'paid'],           to: 'invoiced', evento: 'invoiced', detalle: 'CFDI emitido' },
};

export const PATCH: APIRoute = async ({ params, request }) => {
    const id = params.id ?? '';
    let body: any;
    try { body = await request.json(); } catch { return json({ error: 'JSON inválido' }, 400); }
    try {

    // Permisos: aprobar/rechazar requieren 'aprobar'; lo demás, 'cotizar'.
    const denied = await requirePerm(APROBAR_ACTIONS.has(String(body.action)) ? 'aprobar' : 'cotizar');
    if (denied) return denied;

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

    // Flujo de aprobación: gerencia aprueba o rechaza una solicitud pendiente.
    if (body.action === 'approve_request' || body.action === 'reject_request') {
        const orgId = await getActiveOrgId();
        const rows = await sql`select id, folio, aprob_estado from cotizaciones where id = ${id} and org_id = ${orgId}`;
        if (!rows.length) return json({ error: 'Cotización no encontrada' }, 404);
        if (rows[0].aprob_estado !== 'pendiente') return json({ error: 'No hay una solicitud de aprobación pendiente' }, 409);
        const now = new Date().toISOString();
        if (body.action === 'approve_request') {
            await sql`update cotizaciones set aprob_estado = 'aprobada', status = 'sent', sent_at = coalesce(sent_at, ${now}) where id = ${id}`;
            await sql`insert into eventos (org_id, cotizacion_id, tipo, detalle) values (${orgId}, ${id}, 'sent', 'Aprobada por gerencia y enviada al cliente')`;
            await logAudit(orgId, { accion: 'cotizacion.aprobacion_aprobada', entidad: 'cotizacion', entidad_id: id, detalle: rows[0].folio as string, ip: reqIp(request) });
            after(dispatchQuoteEvent(orgId, id, 'quote.sent'));
            return json({ ok: true, status: 'sent' });
        }
        await sql`update cotizaciones set aprob_estado = 'rechazada' where id = ${id}`;
        await sql`insert into eventos (org_id, cotizacion_id, tipo, detalle) values (${orgId}, ${id}, 'rejected', 'Solicitud de aprobación rechazada por gerencia')`;
        await logAudit(orgId, { accion: 'cotizacion.aprobacion_rechazada', entidad: 'cotizacion', entidad_id: id, detalle: rows[0].folio as string, ip: reqIp(request) });
        return json({ ok: true, status: 'draft' });
    }

    const action = ACTIONS[body.action];
    if (!action) return json({ error: 'Acción no válida' }, 400);

    const orgId = await getActiveOrgId();
    const rows = await sql`select id, status, version from cotizaciones where id = ${id} and org_id = ${orgId}`;
    if (!rows.length) return json({ error: 'Cotización no encontrada' }, 404);

    const actual = rows[0].status as string;
    if (!action.from.includes(actual)) {
        return json({ error: `No se puede pasar de "${actual}" con esta acción` }, 409);
    }

    // Si se actualizan líneas (resend, update_draft, o send con items)
    if (['resend', 'update_draft', 'send'].includes(body.action) && Array.isArray(body.items)) {
        let subtotal = 0;
        for (const it of body.items) subtotal += Number(it.precio_negociado ?? it.precio_unitario ?? 0) * Number(it.cantidad ?? 1);
        const [org] = await sql`select iva_pct from orgs where id = ${orgId}`;
        const ivaPct = org.iva_pct !== undefined && org.iva_pct !== null ? Number(org.iva_pct) / 100 : 0.16;
        const iva_incluido = Boolean(body.iva_incluido);
        const iva = iva_incluido ? subtotal - (subtotal / (1 + ivaPct)) : subtotal * ivaPct;
        const realSubtotal = iva_incluido ? subtotal / (1 + ivaPct) : subtotal;
        const total = iva_incluido ? subtotal : subtotal + iva;
        
        // resend crea nueva versión, draft update/send sobre draft usa la actual
        const nextVersion = body.action === 'resend' ? Number(rows[0].version || 1) + 1 : Number(rows[0].version || 1);

        if (body.action === 'update_draft' || (body.action === 'send' && actual === 'draft')) {
            const vigDias = Number(body.vigencia_dias) || 30;
            await sql`update cotizaciones set
                        cliente_id = ${body.cliente_id || null},
                        terminos = ${body.terminos || 'contado'},
                        vigencia = (current_date + (${vigDias} * interval '1 day'))::date,
                        notas = ${body.notas || null},
                        base_currency = ${body.base_currency || 'MXN'},
                        fiscal_currency = ${body.fiscal_currency || 'MXN'},
                        fx_buffer_pct = ${Number(body.fx_buffer_pct) || 0},
                        subtotal = ${realSubtotal}, iva = ${iva}, total = ${total},
                        version = ${nextVersion}, iva_incluido = ${iva_incluido}
                      where id = ${id}`;
        } else {
            await sql`update cotizaciones set subtotal = ${realSubtotal}, iva = ${iva}, total = ${total}, version = ${nextVersion}, iva_incluido = ${iva_incluido} where id = ${id}`;
        }

        await sql`delete from cotizacion_items where cotizacion_id = ${id}`;
        let orden = 0;
        for (const it of body.items) {
            await sql`insert into cotizacion_items (cotizacion_id, producto_id, descripcion, cantidad, precio_unitario, precio_negociado, costo_unitario, orden)
                      values (${id}, ${it.producto_id || null}, ${it.descripcion}, ${Number(it.cantidad) || 1}, ${Number(it.precio_unitario) || 0}, ${it.precio_negociado === null || it.precio_negociado === undefined ? null : Number(it.precio_negociado)}, ${Number(it.costo_unitario) || 0}, ${orden++})`;
        }
        
        if (body.action === 'resend') {
            await sql`insert into cotizacion_versiones (cotizacion_id, org_id, version, subtotal, iva, total, items, notas, iva_incluido)
                      values (${id}, ${orgId}, ${nextVersion}, ${realSubtotal}, ${iva}, ${total}, ${JSON.stringify(body.items)}, null, ${iva_incluido})`;
            await sql`insert into eventos (org_id, cotizacion_id, tipo, detalle) values (${orgId}, ${id}, 'comment', ${'Versión ' + nextVersion + ' creada'})`;
        } else {
            // Actualizamos la versión existente (borrador)
            await sql`update cotizacion_versiones set subtotal = ${realSubtotal}, iva = ${iva}, total = ${total}, items = ${JSON.stringify(body.items)}, iva_incluido = ${iva_incluido} where cotizacion_id = ${id} and version = ${nextVersion}`;
        }
    }


    const now = new Date().toISOString();
    if (action.to === 'sent') {
        await sql`update cotizaciones set status = 'sent', sent_at = coalesce(sent_at, ${now}) where id = ${id}`;
    } else if (action.to === 'approved') {
        await sql`update cotizaciones set status = 'approved', approved_at = ${now} where id = ${id}`;
    } else {
        await sql`update cotizaciones set status = ${action.to} where id = ${id}`;

    }

    await sql`insert into eventos (org_id, cotizacion_id, tipo, detalle)
              values (${orgId}, ${id}, ${action.evento}, ${action.detalle})`;
    await logAudit(orgId, { accion: `cotizacion.${body.action}`, entidad: 'cotizacion', entidad_id: id, detalle: `${actual} → ${action.to}`, ip: reqIp(request) });

    // Notifica el evento a las webhooks suscritas de la org (best-effort).
    const whev = WH_MAP[action.evento];
    if (whev) after(dispatchQuoteEvent(orgId, id, whev));

    // Emisión fiscal: enruta al proveedor del país (CFDI MX, invoice US, …) vía
    // FiscalFactory y registra el documento en documentos_fiscales. Best-effort:
    // no rompe la facturación si el proveedor falla (queda como status 'error').
    let fiscal: Awaited<ReturnType<typeof emitFiscalDocument>> | undefined;
    if (action.to === 'invoiced') {
        fiscal = await emitFiscalDocument(orgId, id);
        // Timbrar consume un folio: mide el uso del periodo (excedente vía Stripe).
        await reportUsage(orgId, 'timbrado', 1);
    }

    // Al enviar/reenviar, intenta avisar al cliente por correo (si hay Resend).
    let email: { sent: boolean; skipped?: string } | undefined;
    if (action.to === 'sent') {
        const origin = new URL(request.url).origin;
        email = await notifyQuoteSent(orgId, id, origin);
        if (email.sent) {
            await sql`insert into eventos (org_id, cotizacion_id, tipo, detalle)
                      values (${orgId}, ${id}, 'email', 'Correo enviado al cliente')`;
        }
    }

    return json({ ok: true, status: action.to, email, fiscal });
    } catch (err: any) {
        console.error('[PATCH cotizacion]', err);
        return json({ error: err?.message || 'Error interno' }, 500);
    }
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

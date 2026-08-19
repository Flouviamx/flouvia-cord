// /api/facturas/[id] — ciclo de vida de una factura.
//   PATCH { action: 'finalize' | 'send' | 'payment' | 'void' | 'credit_note' | 'uncollectible' }
//   DELETE                                     → { ok }  (solo borradores)
//
// Cada acción es explícita y unidireccional. En particular `void` NO cae a
// `credit_note` por su cuenta: anular y acreditar tienen consecuencias fiscales
// distintas, y elegir por el usuario es cómo se pierde el rastro de un cobro.
export const prerender = false;

import type { APIRoute } from 'astro';
import { sql, getActiveOrgId, logAudit, reqIp, withOrgTx } from '../../../lib/db';
import { requirePerm, invalidateMoneyCaches, getFacturaDetalle } from '../../../lib/queries';
import { finalizeInvoice, voidInvoice, createCreditNote, updateInvoiceDraft, parseInvoiceItems, MAX_INVOICE_ITEMS } from '../../../lib/fiscal/invoices';
import { applyPayment } from '../../../lib/fiscal/payments';
import { requireEntitlement } from '../../../lib/org-entitlements';
import { cancelUsage, flushUsageReservation, reserveUsage } from '../../../lib/billing';
import { dispatchInvoiceEvent } from '../../../lib/webhooks';
import { notifyInvoiceIssued } from '../../../lib/email';
import { logInvoiceEvent } from '../../../lib/fiscal/timeline';
import { invoicingFeatureFor, orgCountry } from '../../../lib/fiscal/gate';
import { currentUserId } from '../../../lib/context';
import { after } from '../../../lib/after';

export const PATCH: APIRoute = async ({ params, request }) => {
    const id = params.id ?? '';
    let body: any;
    try { body = await request.json(); } catch { return json({ error: 'JSON inválido' }, 400); }
    const action = String(body.action ?? '').trim();

    // `payment` y `uncollectible` son decisiones de cobranza; el resto son del
    // carril de facturación.
    const denied = await requirePerm(
        action === 'payment' || action === 'uncollectible' ? 'cobranza' : 'cotizar',
    );
    if (denied) return denied;

    const orgId = await getActiveOrgId();
    const [own] = await withOrgTx(orgId, sql`
        select id, lifecycle, status, total, amount_remaining, invoice_number, currency
          from documentos_fiscales where id = ${id} and org_id = ${orgId}`);
    if (!own.length) return json({ error: 'Factura no encontrada' }, 404);
    const doc = own[0];

    switch (action) {
        case 'update_draft': return updateDraft(orgId, id, body, request);
        case 'finalize': return finalize(orgId, id, request);
        case 'send': return send(orgId, id, request);
        case 'payment': return payment(orgId, id, body, request);
        case 'void': return voidIt(orgId, id, body, request);
        case 'credit_note': return creditNote(orgId, id, body, request);
        case 'uncollectible': return uncollectible(orgId, id, doc, request);
        default: return json({ error: 'Acción no reconocida' }, 400);
    }
};

/**
 * Reescribe un borrador desde el editor. Solo toca facturas sin folio: una
 * emitida es inmutable y la ruta lo dice con 409 en vez de fallar en silencio.
 */
async function updateDraft(orgId: string, id: string, body: any, request: Request) {
    const subscriptionDenied = await requireEntitlement(orgId, await invoicingFeatureFor(orgId));
    if (subscriptionDenied) return subscriptionDenied;

    const rawItems = Array.isArray(body.items) ? body.items : [];
    if (rawItems.length > MAX_INVOICE_ITEMS) {
        return json({ error: `Máximo ${MAX_INVOICE_ITEMS} conceptos por factura.` }, 400);
    }
    const items = parseInvoiceItems(rawItems);
    if (!items.length) return json({ error: 'Cada concepto necesita descripción y cantidad.' }, 400);

    const dueDate = String(body.due_date ?? '').trim();
    if (dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) {
        return json({ error: 'La fecha de vencimiento no es válida.' }, 400);
    }

    const result = await updateInvoiceDraft(orgId, id, {
        clienteId: String(body.cliente_id ?? '').trim(),
        items,
        currency: body.currency ? String(body.currency) : undefined,
        dueDate: dueDate || null,
        notes: String(body.notas ?? '').trim().slice(0, 1000) || null,
        bufferPct: Number(body.fx_buffer_pct) || 0,
        ivaIncluido: body.iva_incluido === true,
    });
    if (!result.ok) {
        // Igual que al crear: un fallo de FX es 503 y se reintenta; una factura
        // ya emitida es 409 porque el estado, no el payload, es lo que impide.
        const fxDown = /tipo de cambio/i.test(result.error || '');
        const emitida = /ya fue emitida/i.test(result.error || '');
        return json({ error: result.error }, fxDown ? 503 : (emitida ? 409 : 400));
    }
    await logAudit(orgId, {
        accion: 'factura.borrador_actualizado', entidad: 'factura', entidad_id: id,
        detalle: `${items.length} concepto(s)`, ip: reqIp(request),
    });
    invalidateMoneyCaches(orgId);
    return json({ ok: true, id, token: result.publicToken });
}

/**
 * Emite el borrador. Aquí —y solo aquí— se consume el medidor `timbrado`, con
 * exactamente la misma coreografía que el carril de cotización: reservar antes
 * de llamar al proveedor, cancelar la reserva si falla o si la respuesta fue
 * idempotente, y mandar al medidor solo lo que de verdad se timbró.
 */
async function finalize(orgId: string, id: string, request: Request) {
    const subscriptionDenied = await requireEntitlement(orgId, await invoicingFeatureFor(orgId));
    if (subscriptionDenied) return subscriptionDenied;

    const isMexico = (await orgCountry(orgId)) === 'MX';
    let usageId: string | null = null;
    if (isMexico) {
        const usage = await reserveUsage(orgId, 'timbrado', 1);
        if (!usage.ok || !usage.id) {
            const unavailable = /verificar|registrar/i.test(usage.reason || '');
            return json({ error: usage.reason }, unavailable ? 503 : 429);
        }
        usageId = usage.id;
    }

    const result = await finalizeInvoice(orgId, id);
    if (!result.emitted) {
        if (usageId) await cancelUsage(orgId, usageId);
        return json({ error: result.error || 'No se pudo emitir la factura', fiscal: result }, 502);
    }
    if (usageId) {
        if (result.reused || result.billable === false) await cancelUsage(orgId, usageId);
        else void flushUsageReservation(orgId, usageId);
    }

    await logAudit(orgId, {
        accion: 'factura.emitida', entidad: 'factura', entidad_id: id,
        detalle: result.invoiceNumber || id, ip: reqIp(request),
    });
    invalidateMoneyCaches(orgId);
    after(dispatchInvoiceEvent(orgId, id, 'invoice.finalized'));
    return json({ ok: true, numero: result.invoiceNumber, token: result.publicToken, fiscal_id: result.fiscalId });
}

/** Manda la factura al cliente por correo, con su PDF y su link de pago. */
async function send(orgId: string, id: string, request: Request) {
    const factura = await getFacturaDetalle(id);
    if (!factura) return json({ error: 'Factura no encontrada' }, 404);
    if (factura.estado === 'draft') {
        return json({ error: 'Emite la factura antes de enviarla.' }, 409);
    }
    if (!factura.clienteEmail) {
        return json({ error: 'Este cliente no tiene correo registrado.' }, 400);
    }

    const sent = await notifyInvoiceIssued(orgId, id);
    // Regla 14: si el correo no salió, se dice el ESTADO, no el proveedor.
    if (!sent) return json({ error: 'No pudimos enviar el correo. Intenta de nuevo.' }, 502);

    await withOrgTx(orgId, sql`
        update documentos_fiscales set sent_at = now(), updated_at = now()
         where id = ${id} and org_id = ${orgId}`);
    await logAudit(orgId, {
        accion: 'factura.enviada', entidad: 'factura', entidad_id: id,
        detalle: factura.clienteEmail, ip: reqIp(request),
    });
    await logInvoiceEvent(orgId, id, 'sent', `Enviada a ${factura.clienteEmail}`);
    after(dispatchInvoiceEvent(orgId, id, 'invoice.sent'));
    return json({ ok: true });
}

/** Registra un pago manual (transferencia, efectivo, cheque) contra la factura. */
async function payment(orgId: string, id: string, body: any, request: Request) {
    const result = await applyPayment(orgId, id, {
        monto: Number(body.monto),
        currency: String(body.currency ?? ''),
        metodo: String(body.metodo ?? 'manual').slice(0, 40),
        referencia: String(body.referencia ?? '').trim().slice(0, 120) || null,
        nota: String(body.nota ?? '').trim().slice(0, 400) || null,
        registradoPor: currentUserId(),
    });
    if (!result.ok) return json({ error: result.error }, 400);

    await logAudit(orgId, {
        accion: 'factura.pago_registrado', entidad: 'factura', entidad_id: id,
        detalle: `${body.monto} ${body.currency}`, ip: reqIp(request),
    });
    invalidateMoneyCaches(orgId);
    if (result.justPaid) after(dispatchInvoiceEvent(orgId, id, 'invoice.paid'));
    return json({ ok: true, pagado: result.amountPaid, saldo: result.amountRemaining, estado: result.lifecycle });
}

async function voidIt(orgId: string, id: string, body: any, request: Request) {
    const result = await voidInvoice(orgId, id, String(body.motivo ?? '').trim() || undefined);
    if (!result.ok) {
        // 409, no 400: la petición es válida, el estado de la factura es el que
        // no la admite. El cliente de la API necesita distinguirlos para poder
        // ofrecer la nota de crédito como siguiente paso.
        return json({ error: result.error, requires_credit_note: !!result.requiresCreditNote }, 409);
    }
    await logAudit(orgId, {
        accion: 'factura.anulada', entidad: 'factura', entidad_id: id,
        detalle: String(body.motivo ?? '') || 'sin motivo', ip: reqIp(request),
    });
    invalidateMoneyCaches(orgId);
    after(dispatchInvoiceEvent(orgId, id, 'invoice.voided'));
    return json({ ok: true });
}

async function creditNote(orgId: string, id: string, body: any, request: Request) {
    const subscriptionDenied = await requireEntitlement(orgId, await invoicingFeatureFor(orgId));
    if (subscriptionDenied) return subscriptionDenied;

    const result = await createCreditNote(orgId, id, {
        monto: body.monto !== undefined && body.monto !== '' ? Number(body.monto) : undefined,
        motivo: String(body.motivo ?? '').trim().slice(0, 200) || undefined,
        createdBy: currentUserId(),
    });
    if (!result.ok) return json({ error: result.error }, 400);
    await logAudit(orgId, {
        accion: 'factura.nota_credito', entidad: 'factura', entidad_id: result.documentId as string,
        detalle: `Nota de crédito de ${id}`, ip: reqIp(request),
    });
    invalidateMoneyCaches(orgId);
    // Nace como borrador: se emite con `finalize`, igual que cualquier otra.
    return json({ id: result.documentId, token: result.publicToken });
}

async function uncollectible(orgId: string, id: string, doc: any, request: Request) {
    if (doc.lifecycle !== 'open') {
        return json({ error: 'Solo una factura abierta puede marcarse incobrable.' }, 409);
    }
    await withOrgTx(orgId, sql`
        update documentos_fiscales
           set lifecycle = 'uncollectible', updated_at = now()
         where id = ${id} and org_id = ${orgId} and lifecycle = 'open'`);
    await logAudit(orgId, {
        accion: 'factura.incobrable', entidad: 'factura', entidad_id: id,
        detalle: String(doc.invoice_number || id), ip: reqIp(request),
    });
    invalidateMoneyCaches(orgId);
    after(dispatchInvoiceEvent(orgId, id, 'invoice.marked_uncollectible'));
    return json({ ok: true });
}

/** Borrar solo aplica a borradores: una factura emitida se anula, no se borra. */
export const DELETE: APIRoute = async ({ params, request }) => {
    const denied = await requirePerm('cotizar'); if (denied) return denied;
    const id = params.id ?? '';
    const orgId = await getActiveOrgId();
    const [rows] = await withOrgTx(orgId, sql`
        delete from documentos_fiscales
         where id = ${id} and org_id = ${orgId} and lifecycle = 'draft' and invoice_number is null
        returning id`);
    if (!rows.length) {
        return json({ error: 'Solo se puede eliminar un borrador que todavía no tiene folio.' }, 409);
    }
    await logAudit(orgId, {
        accion: 'factura.borrador_eliminado', entidad: 'factura', entidad_id: id,
        detalle: 'Borrador eliminado', ip: reqIp(request),
    });
    invalidateMoneyCaches(orgId);
    return json({ ok: true });
};

function json(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

// /api/facturas/[id] — ciclo de vida de una factura.
//   PATCH { action: 'finalize' | 'finalize_and_send' | 'send' | 'duplicate' | 'payment' | 'void' | 'credit_note' | 'uncollectible' | 'retry_complements' }
//   DELETE                                     → { ok }  (solo borradores)
//
// Cada acción es explícita y unidireccional. En particular `void` NO cae a
// `credit_note` por su cuenta: anular y acreditar tienen consecuencias fiscales
// distintas, y elegir por el usuario es cómo se pierde el rastro de un cobro.
export const prerender = false;

import type { APIRoute } from 'astro';
import { sql, getActiveOrgId, logAudit, reqIp, withOrgTx } from '../../../lib/db';
import { requirePerm, invalidateMoneyCaches, getFacturaDetalle } from '../../../lib/queries';
import { createInvoiceDraft, finalizeInvoice, voidInvoice, createCreditNote, updateInvoiceDraft, parseInvoiceItems, parseInvoiceReferences, parseServiceDates, MAX_INVOICE_ITEMS } from '../../../lib/fiscal/invoices';
import { applyPayment, manualPaymentMethod } from '../../../lib/fiscal/payments';
import { requireEntitlement } from '../../../lib/org-entitlements';
import { dispatchInvoiceEvent } from '../../../lib/webhooks';
import { notifyInvoiceIssued } from '../../../lib/email';
import { logInvoiceEvent } from '../../../lib/fiscal/timeline';
import { invoicingFeatureFor } from '../../../lib/fiscal/gate';
import { currentUserId } from '../../../lib/context';
import { after } from '../../../lib/after';
import { strictRateLimit, strictLimitResponse } from '../../../lib/ratelimit';
import { isISODate } from '../../../lib/rango';
import { leerDescuentoBody, type DescuentoSolicitud } from '../../../lib/descuentos';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Permiso por acción. Emitir, enviar y duplicar son del carril de facturación
 * (`cotizar`). Todo lo que BAJA lo que se cobra —registrar un pago, marcar
 * incobrable, anular o acreditar— es una decisión de cobranza: antes `void` y
 * `credit_note` solo pedían `cotizar`, así que un vendedor podía cancelar un
 * CFDI ante el SAT (irreversible) o saldar una factura con una nota de crédito
 * por el total y sacarla de la cartera sin permiso de cobranza.
 */
export function invoiceActionPermission(action: string): 'cobranza' | 'cotizar' {
    return ['payment', 'uncollectible', 'void', 'cancellation_status', 'credit_note', 'retry_complements'].includes(action)
        ? 'cobranza'
        : 'cotizar';
}

/** Ventana de reenvío del MISMO documento al cliente. */
const SEND_LIMIT = 3;
const SEND_WINDOW_SEC = 600;

export const PATCH: APIRoute = async ({ params, request }) => {
    const id = params.id ?? '';
    // Un id que no es UUID reventaba el cast de Postgres con un 500.
    if (!UUID_RE.test(id)) return json({ error: 'Factura no encontrada' }, 404);
    let body: any;
    try { body = await request.json(); } catch { return json({ error: 'JSON inválido' }, 400); }
    const action = String(body.action ?? '').trim();

    const denied = await requirePerm(invoiceActionPermission(action));
    if (denied) return denied;

    const orgId = await getActiveOrgId();
    // Mismo techo que el PATCH de cotizaciones: el contador in-process del
    // middleware se multiplica por réplica y no acota nada real.
    const limitado = strictLimitResponse(await strictRateLimit(`factura-patch:${orgId}`, 120, 60));
    if (limitado) return limitado;
    const [own] = await withOrgTx(orgId, sql`
        select id, lifecycle, status, total, amount_remaining, invoice_number, currency
          from documentos_fiscales where id = ${id} and org_id = ${orgId}`);
    if (!own.length) return json({ error: 'Factura no encontrada' }, 404);
    const doc = own[0];

    switch (action) {
        case 'update_draft': return updateDraft(orgId, id, body, request);
        case 'finalize': return finalize(orgId, id, request);
        case 'finalize_and_send': return finalizeAndSend(orgId, id, request);
        case 'send': return send(orgId, id, request);
        case 'duplicate': return duplicate(orgId, id, request);
        case 'payment': return payment(orgId, id, body, request);
        case 'void':
        case 'cancellation_status': return voidIt(orgId, id, body, request);
        case 'credit_note': return creditNote(orgId, id, body, request);
        case 'uncollectible': return uncollectible(orgId, id, doc, request);
        case 'retry_complements': {
            // México: vuelve a pedir los complementos de pago que no salieron.
            const { retryPaymentComplements } = await import('../../../lib/fiscal/payment-complement');
            const result = await retryPaymentComplements(orgId, id);
            await logAudit(orgId, {
                accion: 'factura.complementos_reintentados', entidad: 'factura', entidad_id: id,
                detalle: `${result.emitidos}/${result.intentados}`, ip: reqIp(request),
            });
            return json({ ok: true, ...result });
        }
        case 'verifactu_correct': {
            // España: corrige con una subsanación el registro que la AEAT
            // rechazó (o que no se pudo enviar) y lo reenvía. Opcionalmente fija
            // la causa de exención de conceptos al 0 % (índice → código).
            const { corregirRegistroVerifactu } = await import('../../../lib/fiscal/verifactu/incidencias');
            const causas = body.causas && typeof body.causas === 'object' && !Array.isArray(body.causas) ? body.causas : {};
            const result = await corregirRegistroVerifactu(orgId, id, causas);
            if (!result.ok) return json({ error: result.error }, 409);
            await logAudit(orgId, {
                accion: 'factura.verifactu_corregido', entidad: 'factura', entidad_id: id,
                detalle: `registro ${result.registroId}`, ip: reqIp(request),
            });
            return json({ ok: true });
        }
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
    if (dueDate && !isISODate(dueDate)) {
        return json({ error: 'La fecha de vencimiento no es válida.' }, 400);
    }
    const servicio = parseServiceDates(body);
    if (!servicio.ok) return json({ error: servicio.error }, 400);
    // Sin `descuento` ni `cupon` en el body, el borrador conserva el que tenía.
    const descuento = leerDescuentoBody(body);
    if ('error' in descuento) return json({ error: descuento.error, code: 'invalid_discount' }, 400);

    const result = await updateInvoiceDraft(orgId, id, {
        clienteId: String(body.cliente_id ?? '').trim(),
        items,
        documentMode: body.document_mode,
        currency: body.currency ? String(body.currency) : undefined,
        dueDate: dueDate || null,
        serviceDate: servicio.serviceDate,
        serviceDateEnd: servicio.serviceDateEnd,
        notes: String(body.notas ?? '').trim().slice(0, 1000) || null,
        bufferPct: Number(body.fx_buffer_pct) || 0,
        ivaIncluido: body.iva_incluido === true,
        ...parseInvoiceReferences(body),
        descuento: descuento.presente ? descuento.solicitud : undefined,
    });
    if (!result.ok) {
        if (result.code) return json({ error: result.error, code: result.code }, result.status || 400);
        // Igual que al crear: un fallo de FX o del catálogo de impuestos es 503 y
        // se reintenta; una factura ya emitida es 409 porque el estado, no el
        // payload, es lo que impide.
        const serviceDown = /tipo de cambio|catálogo de impuestos/i.test(result.error || '');
        const emitida = /ya fue emitida/i.test(result.error || '');
        return json({ error: result.error }, serviceDown ? 503 : (emitida ? 409 : 400));
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

    const result = await finalizeInvoice(orgId, id);
    if (!result.emitted) {
        return json({ error: result.error || 'No se pudo emitir la factura', fiscal: result }, result.httpStatus || 502);
    }
    await logAudit(orgId, {
        accion: 'factura.emitida', entidad: 'factura', entidad_id: id,
        detalle: result.invoiceNumber || id, ip: reqIp(request),
    });
    invalidateMoneyCaches(orgId);
    after(dispatchInvoiceEvent(orgId, id, 'invoice.finalized'));
    return json({ ok: true, numero: result.invoiceNumber, token: result.publicToken, fiscal_id: result.fiscalId });
}

/**
 * Emite y entrega como una sola intención de producto, sin fingir atomicidad.
 * La emisión fiscal es irreversible: si el correo falla, la respuesta conserva
 * el éxito de la emisión y deja claro que solo falta reintentar la entrega.
 */
async function finalizeAndSend(orgId: string, id: string, request: Request) {
    const finalized = await finalize(orgId, id, request);
    const finalizedBody = await responseBody(finalized);
    if (!finalized.ok) return json(finalizedBody, finalized.status);

    const delivered = await send(orgId, id, request);
    const deliveredBody = await responseBody(delivered);
    if (!delivered.ok) {
        return json({
            ...finalizedBody,
            ok: true,
            issued: true,
            sent: false,
            delivery_error: String((deliveredBody as any)?.error || 'No pudimos enviar el correo. Intenta de nuevo.'),
        });
    }

    return json({ ...finalizedBody, ok: true, issued: true, sent: true });
}

/** Manda la factura al cliente por correo, con su PDF y su link de pago. */
async function send(orgId: string, id: string, request: Request) {
    const factura = await getFacturaDetalle(id);
    if (!factura) return json({ error: 'Factura no encontrada' }, 404);
    if (factura.estado === 'draft') {
        return json({ error: 'Emite la factura antes de enviarla.' }, 409);
    }
    // El correo es "tu factura está lista, págala aquí": mandarlo de una
    // factura anulada le pide al cliente pagar algo que ya no se debe.
    if (factura.estado === 'void') {
        return json({ error: 'Esta factura está anulada y ya no se envía al cliente.' }, 409);
    }
    // Sin tope, un mismo documento se podía reenviar sin fin al correo del
    // cliente desde el dominio de envío de Cord: spam con remitente legítimo y
    // reputación de entrega de toda la plataforma en juego.
    const ventana = strictLimitResponse(await strictRateLimit(`factura-send:${orgId}:${id}`, SEND_LIMIT, SEND_WINDOW_SEC));
    if (ventana) return ventana;
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

/** Copia los datos comerciales a un borrador nuevo, sin reutilizar folio ni vencimiento. */
async function duplicate(orgId: string, id: string, request: Request) {
    const subscriptionDenied = await requireEntitlement(orgId, await invoicingFeatureFor(orgId));
    if (subscriptionDenied) return subscriptionDenied;

    const source = await getFacturaDetalle(id);
    if (!source) return json({ error: 'Factura no encontrada' }, 404);
    if (!source.clienteId) return json({ error: 'La factura original no tiene un cliente editable.' }, 409);

    // Con descuento de documento, el concepto se copia a su precio BRUTO (base
    // + su parte del descuento) y el descuento viaja como definición: copiar
    // el precio neto y además el descuento lo aplicaría dos veces.
    const descuentoOrigen = source.descuento;
    const solicitud: DescuentoSolicitud | null = descuentoOrigen
        ? (descuentoOrigen.codigo
            ? { manual: null, cupon: descuentoOrigen.codigo }
            : { manual: { tipo: descuentoOrigen.tipo, valor: descuentoOrigen.tipo === 'monto' && descuentoOrigen.iva_incluido ? source.descuentoTotal : descuentoOrigen.valor }, cupon: null })
        : null;
    const draft = (descuento: DescuentoSolicitud | null) => createInvoiceDraft(orgId, {
        clienteId: source.clienteId!,
        currency: source.currency || undefined,
        dueDate: null,
        notes: source.notas,
        createdBy: currentUserId(),
        descuento,
        items: source.lineas.map((linea) => ({
            descripcion: linea.descripcion,
            cantidad: linea.cantidad,
            precioUnitario: descuento && linea.descuento > 0 && linea.cantidad > 0
                ? Math.round((linea.subtotal + linea.descuento) / linea.cantidad * 1e6) / 1e6
                : linea.precioUnitario,
            taxRate: linea.taxRate,
        })),
    });
    let result = await draft(solicitud);
    // Un cupón que ya no aplica (vencido, agotado para este cliente) no impide
    // duplicar: la copia sale a precio neto, sin cupón, y se avisa.
    let aviso: string | undefined;
    if (!result.ok && result.code?.startsWith('coupon_') && solicitud) {
        aviso = `${result.error} La copia conserva los importes sin el cupón.`;
        result = await draft(null);
    }
    if (!result.ok) return json({ error: result.error || 'No se pudo duplicar la factura.' }, 400);

    await logAudit(orgId, {
        accion: 'factura.duplicada', entidad: 'factura', entidad_id: result.documentId as string,
        detalle: `Copia de ${source.invoiceNumber || id}`, ip: reqIp(request),
    });
    invalidateMoneyCaches(orgId);
    return json({ ok: true, id: result.documentId, token: result.publicToken, ...(aviso ? { aviso } : {}) });
}

/** Registra un pago manual (transferencia, efectivo, cheque) contra la factura. */
async function payment(orgId: string, id: string, body: any, request: Request) {
    const result = await applyPayment(orgId, id, {
        monto: Number(body.monto),
        currency: String(body.currency ?? ''),
        metodo: manualPaymentMethod(body.metodo),
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
    const result = await voidInvoice(orgId, id, String(body.motivo ?? '').trim() || undefined, body.action === 'cancellation_status');
    invalidateMoneyCaches(orgId);
    if (!result.ok) {
        // 409, no 400: la petición es válida, el estado de la factura es el que
        // no la admite. El cliente de la API necesita distinguirlos para poder
        // ofrecer la nota de crédito como siguiente paso.
        return json({ error: result.error, requires_credit_note: !!result.requiresCreditNote, cancellation_status: result.cancellationStatus }, 409);
    }
    await logAudit(orgId, {
        accion: result.pending ? 'factura.cancelacion_pendiente' : 'factura.anulada', entidad: 'factura', entidad_id: id,
        detalle: String(body.motivo ?? '') || 'sin motivo', ip: reqIp(request),
    });
    if (!result.pending && !result.reused) after(dispatchInvoiceEvent(orgId, id, 'invoice.voided'));
    return json({ ok: true, pending: !!result.pending, cancellation_status: result.cancellationStatus }, result.pending ? 202 : 200);
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
    if (!UUID_RE.test(id)) return json({ error: 'Factura no encontrada' }, 404);
    // El uso de cupón que un intento de emisión fallido dejó registrado se
    // libera en la MISMA transacción y con la misma condición que el borrado:
    // después del delete la redención ya no apuntaría a ningún documento.
    const [, rows] = await withOrgTx(orgId,
        sql`select cord_cupon_liberar(${orgId}::uuid, null, ${id}::uuid)
              from documentos_fiscales
             where id = ${id} and org_id = ${orgId} and lifecycle = 'draft' and invoice_number is null and provider_data->'cord_issuance' is null
               and descuento->>'cupon_id' is not null`,
        sql`
        delete from documentos_fiscales
         where id = ${id} and org_id = ${orgId} and lifecycle = 'draft' and invoice_number is null and provider_data->'cord_issuance' is null
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

async function responseBody(response: Response): Promise<Record<string, unknown>> {
    try { return await response.json(); }
    catch { return {}; }
}

// Sustitución de un CFDI emitido (México).
//
// Corregir una factura timbrada no es editarla: el SAT pide emitir PRIMERO un
// comprobante nuevo relacionado con el original por la clave 04 ("Sustitución
// de los CFDI previos") y DESPUÉS cancelar el original con el motivo 01 citando
// el folio fiscal del nuevo (SAT, Preguntas frecuentes de cancelación 2026,
// preguntas 2 y 7; Facturapi: `related_documents[].relationship = '04'` al
// crear y `DELETE /invoices/{id}?motive=01&substitution=<uuid>` al cancelar).
//
// El flujo en Cord:
//   1. `createSubstitutionDraft` arma un borrador con los datos del original
//      (cliente, conceptos, claves SAT, uso y forma de pago), editable en el
//      editor de facturas, con `sustituye_a` apuntando al original.
//   2. Al emitirlo, `finalizeInvoice` (invoices.ts) corre `substitutionPreflight`,
//      timbra con la relación 04 y, en la MISMA transacción que lo marca
//      emitido, pasa los cobros del original al sustituto y marca el original
//      con `sustituida_por`. Desde ahí se cobra el sustituto.
//   3. Pide la cancelación del original con motivo 01: `accepted`, `pending` o
//      `verifying` se guardan como cualquier cancelación; un rechazo deja los
//      dos CFDI vigentes ante el SAT y el detalle lo dice.
//
// Lo que bloquea la sustitución (fuente: SAT, "Esquema de cancelación de CFDI":
// un CFDI es No cancelable si tiene al menos un documento relacionado vigente):
//   - complementos de pago emitidos o en proceso: cada uno relaciona al CFDI y
//     lo vuelve no cancelable. Cord no cancela complementos todavía, así que
//     se dice antes de timbrar un sustituto que dejaría dos CFDI vigentes;
//   - notas de crédito vigentes (relación 01 al original), por la misma razón;
//   - una cancelación ya en curso o aceptada.

import { sql, withOrgTx } from '../db';
import { createInvoiceDraft, releaseInvoicePaymentAttempts, type DraftResult } from './invoices';
import { isFormaPago, isUsoCfdi } from './cfdi-catalogos';
import { logInvoiceEvent } from './timeline';
import type { FiscalLineItem } from './index';

/** Estado de los complementos de pago del documento (provider_data.reps). */
export function repsBloqueantes(providerData: unknown): number {
    const reps = (providerData as any)?.reps;
    if (!reps || typeof reps !== 'object') return 0;
    return Object.values(reps as Record<string, any>).filter((r) => r && (
        r.status === 'issued' || r.status === 'pending' || (r.status === 'error' && r.delivery_uncertain === true)
    )).length;
}

/**
 * Por qué este CFDI no se puede sustituir hoy, o null. Función pura: la usan
 * el borrador, la emisión del sustituto y el detalle (para no ofrecer un botón
 * que el servidor va a rechazar).
 */
export function substitutionBlocker(doc: {
    country_code?: unknown; document_type?: unknown; status?: unknown; lifecycle?: unknown;
    credit_note_of?: unknown; informacion_global?: unknown; sustituida_por?: unknown;
    provider_data?: any; has_credit_notes?: unknown;
}, replacementId?: string): string | null {
    if (String(doc.country_code || '').toUpperCase() !== 'MX' || doc.document_type !== 'cfdi_40') {
        return 'Solo un CFDI de ingreso de México se sustituye.';
    }
    if (doc.credit_note_of) return 'Una nota de crédito no se sustituye.';
    if (doc.informacion_global) {
        return 'Una factura global se corrige cancelándola y emitiéndola de nuevo para el mismo periodo.';
    }
    if (doc.status !== 'issued' || doc.lifecycle === 'void') return 'Solo una factura emitida y vigente se sustituye.';
    if (doc.sustituida_por && doc.sustituida_por !== replacementId) return 'Esta factura ya fue sustituida.';
    const cancelacion = String(doc.provider_data?.cancelacion?.status || '');
    if (!doc.sustituida_por && ['pending', 'verifying', 'accepted'].includes(cancelacion)) {
        return 'Esta factura ya tiene una cancelación en curso.';
    }
    if (doc.has_credit_notes) {
        return 'Tiene notas de crédito vigentes relacionadas: el SAT no deja cancelar un CFDI con comprobantes relacionados vigentes. Cancélalas primero.';
    }
    const reps = repsBloqueantes(doc.provider_data);
    if (reps > 0) {
        return 'Tiene complementos de pago emitidos: el SAT no deja cancelar un CFDI con comprobantes relacionados vigentes, así que primero hay que cancelar sus complementos. Escríbenos a soporte@flouvia.com para hacerlo.';
    }
    return null;
}

async function readOriginal(orgId: string, originalId: string) {
    const [rows] = await withOrgTx(orgId, sql`
        select d.id, d.org_id, d.country_code, d.document_type, d.status, d.lifecycle, d.credit_note_of,
               d.informacion_global, d.sustituida_por, d.provider_data, d.invoice_number, d.fiscal_id,
               d.cotizacion_id, d.cliente_id, d.currency, d.due_date, d.notes, d.service_date, d.service_date_end,
               d.line_items_snapshot, d.cfdi_uso, d.cfdi_forma_pago, d.amount_paid,
               d.stripe_payment_intent_id, d.mp_preference_id, o.stripe_account_id,
               exists (select 1 from documentos_fiscales n where n.credit_note_of = d.id and n.org_id = d.org_id
                        and n.lifecycle <> 'void') as has_credit_notes,
               (select r.id from documentos_fiscales r where r.sustituye_a = d.id and r.org_id = d.org_id
                        and r.lifecycle <> 'void' limit 1) as sustituto_vivo
          from documentos_fiscales d
          join orgs o on o.id = d.org_id
         where d.id = ${originalId} and d.org_id = ${orgId}
         limit 1`);
    return rows[0] as any;
}

/**
 * Antes de timbrar el sustituto: el original sigue siendo sustituible, y sus
 * cobros en vuelo (PaymentIntent, preferencia de Mercado Pago) se cierran. Una
 * tarjeta confirmada sobre el original después de sustituirlo sería un cobro
 * contra un CFDI que se está cancelando. Falla cerrada. Devuelve el error para
 * el negocio, o null si se puede timbrar.
 */
export async function substitutionPreflight(orgId: string, originalId: string, replacementId: string): Promise<string | null> {
    const original = await readOriginal(orgId, originalId);
    if (!original) return 'La factura que se sustituye ya no existe.';
    const blocked = substitutionBlocker(original, replacementId);
    if (blocked) return blocked;
    if (!original.fiscal_id && original.provider_data?.simulado !== true) {
        return 'La factura que se sustituye no tiene folio fiscal.';
    }
    const released = await releaseInvoicePaymentAttempts(orgId, original);
    return released.ok ? null : released.error;
}

/**
 * Crea el borrador sustituto con los datos del original. Se edita en el editor
 * de facturas como cualquier borrador: cliente (y sus datos fiscales), conceptos,
 * claves SAT, uso del CFDI y forma de pago.
 */
export async function createSubstitutionDraft(
    orgId: string, originalId: string, opts: { createdBy?: string | null } = {},
): Promise<DraftResult> {
    const original = await readOriginal(orgId, originalId);
    if (!original) return { ok: false, error: 'Factura no encontrada.' };
    const blocked = substitutionBlocker(original);
    if (blocked) return { ok: false, error: blocked };
    if (original.sustituto_vivo) {
        return { ok: false, error: 'Esta factura ya tiene un borrador que la sustituye.', documentId: String(original.sustituto_vivo) };
    }
    if (!original.cliente_id) return { ok: false, error: 'La factura original no tiene un cliente editable.' };

    const lines = (Array.isArray(original.line_items_snapshot) ? original.line_items_snapshot : []) as FiscalLineItem[];
    if (!lines.length) return { ok: false, error: 'La factura original no tiene conceptos que copiar.' };
    const providerData = original.provider_data || {};
    const day = (v: unknown) => (v instanceof Date ? v.toISOString().slice(0, 10) : (v ? String(v).slice(0, 10) : null));
    const formaOriginal = original.cfdi_forma_pago
        || (providerData.payment_method === 'PUE' && isFormaPago(providerData.payment_form) ? providerData.payment_form : null);

    let result: DraftResult;
    try {
        result = await createInvoiceDraft(orgId, {
            clienteId: String(original.cliente_id),
            // Fiscal: un sustituto de un CFDI es un CFDI.
            documentMode: 'fiscal',
            currency: original.currency || undefined,
            dueDate: day(original.due_date),
            serviceDate: day(original.service_date),
            serviceDateEnd: day(original.service_date_end),
            notes: original.notes || null,
            createdBy: opts.createdBy ?? null,
            // El snapshot ya es base sin impuesto; el unitario se recupera con
            // la misma precisión con la que se timbró.
            items: lines.map((l) => ({
                descripcion: String(l.description || 'Concepto'),
                cantidad: Number(l.quantity) || 1,
                precioUnitario: Number(l.quantity) ? Math.round((Number(l.subtotal) / Number(l.quantity)) * 1e6) / 1e6 : Number(l.unitPrice) || 0,
                taxRate: Number(l.taxRate),
                productKey: l.productKey ?? null,
                unitKey: l.unitKey ?? null,
            })),
            cfdiUso: isUsoCfdi(original.cfdi_uso) ? original.cfdi_uso : null,
            cfdiFormaPago: isFormaPago(formaOriginal) ? formaOriginal : null,
            sustituyeA: originalId,
            cotizacionId: original.cotizacion_id ? String(original.cotizacion_id) : null,
        });
    } catch (error: any) {
        // El índice único `uq_documentos_sustituye_a` cierra la carrera de dos
        // clics: solo un borrador sustituto vivo por original.
        if (String(error?.message || '').includes('uq_documentos_sustituye_a')) {
            return { ok: false, error: 'Esta factura ya tiene un borrador que la sustituye.' };
        }
        throw error;
    }
    if (result.ok && result.documentId) {
        await logInvoiceEvent(orgId, result.documentId, 'created',
            `Borrador que sustituye a ${String(original.invoice_number || '').trim() || 'la factura original'}`);
    }
    return result;
}

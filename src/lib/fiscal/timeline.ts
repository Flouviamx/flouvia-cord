// Timeline de una factura.
//
// `eventos` alimentaba el feed de actividad de la cotización desde siempre, pero
// solo tenía `cotizacion_id`: la página de una factura no tenía historia. Sin
// cuándo se envió, cuándo la abrió el cliente ni cuándo entró un pago, un
// documento con saldo pendiente es imposible de cobrar con criterio — el
// vendedor no sabe si el cliente ya lo vio o si el correo se perdió.
//
// Se escribe best-effort a propósito: perder un renglón del timeline no puede
// tumbar una emisión, un pago ni una anulación.

import { sql, withOrgTx } from '../db';
import { trackServer } from '../posthog-server';
import type { EventName } from '../analytics-events';

export type InvoiceEventType =
    | 'created'      // borrador creado
    | 'issued'       // folio reservado y documento emitido
    | 'sent'         // correo al cliente
    | 'viewed'       // el CLIENTE abrió el link (regla 19: nunca desde el SSR)
    | 'payment'      // abono aplicado
    | 'paid'         // saldo en cero
    | 'reminder'     // etapa de la escalera de cobranza
    | 'void'         // anulada
    | 'credit_note'  // nota de crédito emitida
    | 'uncollectible';

// El timeline ya marca CADA transición del ciclo de vida de la factura, así que
// es el ancla natural para la analítica del carril: emitir aquí hace que "¿se
// nos olvidó una?" se responda leyendo un solo archivo. Best-effort igual que el
// renglón del timeline; nunca bloquea emisión, pago ni anulación.
const ANALYTICS_EVENT: Partial<Record<InvoiceEventType, EventName>> = {
    created: 'invoice_created',
    issued: 'invoice_finalized',   // → 'credit_note_created' si credit_note_of
    sent: 'invoice_sent',
    viewed: 'invoice_viewed',
    paid: 'invoice_paid',
    void: 'invoice_voided',
};

export async function logInvoiceEvent(
    orgId: string,
    documentoId: string,
    tipo: InvoiceEventType,
    detalle: string,
): Promise<void> {
    try {
        await withOrgTx(orgId, sql`
            insert into eventos (org_id, documento_id, tipo, detalle)
            values (${orgId}, ${documentoId}, ${tipo}, ${detalle.slice(0, 300)})`);
    } catch { /* el timeline es informativo: nunca bloquea la operación */ }

    if (!ANALYTICS_EVENT[tipo]) return;
    try {
        const [[d]] = await withOrgTx(orgId, sql`
            select df.total, df.currency, df.country_code, df.document_type,
                   df.credit_note_of, df.cotizacion_id, df.amount_paid,
                   df.issued_at,
                   (o.sandbox_of is not null) as is_sandbox, o.is_demo
              from documentos_fiscales df join orgs o on o.id = df.org_id
             where df.id = ${documentoId} and df.org_id = ${orgId}`);
        if (!d) return;

        const total = Number(d.total ?? 0);
        const currency = String(d.currency || 'MXN');
        const isSandbox = !!d.is_sandbox;
        const isDemo = !!d.is_demo;
        const isCreditNote = !!d.credit_note_of;

        if (tipo === 'created') {
            await trackServer('invoice_created', orgId, {
                event_id: documentoId, invoice_id: documentoId, total, currency,
                source: d.cotizacion_id ? 'quote' : 'manual',
                country_code: (d.country_code as string) ?? undefined,
                document_type: (d.document_type as string) ?? undefined,
                from_quote_id: (d.cotizacion_id as string) ?? undefined,
            }, isSandbox, isDemo);
        } else if (tipo === 'issued' && isCreditNote) {
            await trackServer('credit_note_created', orgId, {
                event_id: `${documentoId}:cn`, invoice_id: documentoId,
                credit_note_of: String(d.credit_note_of), total, currency,
            }, isSandbox, isDemo);
        } else if (tipo === 'issued') {
            await trackServer('invoice_finalized', orgId, {
                event_id: `${documentoId}:issued`, invoice_id: documentoId, total, currency,
                has_fiscal_stamp: d.country_code === 'MX' || d.country_code === 'ES',
                document_type: (d.document_type as string) ?? undefined,
            }, isSandbox, isDemo);
        } else if (tipo === 'sent') {
            await trackServer('invoice_sent', orgId, {
                event_id: `${documentoId}:${Date.now()}`, invoice_id: documentoId,
            }, isSandbox, isDemo);
        } else if (tipo === 'viewed') {
            await trackServer('invoice_viewed', orgId, {
                event_id: documentoId, invoice_id: documentoId, total, currency,
            }, isSandbox, isDemo);
        } else if (tipo === 'paid') {
            const daysToPay = d.issued_at
                ? Math.max(0, Math.round((Date.now() - new Date(d.issued_at as string).getTime()) / 86400000))
                : undefined;
            await trackServer('invoice_paid', orgId, {
                event_id: documentoId, invoice_id: documentoId, total, currency,
                days_to_pay: daysToPay,
            }, isSandbox, isDemo);
        } else if (tipo === 'void') {
            await trackServer('invoice_voided', orgId, {
                event_id: `${documentoId}:void`, invoice_id: documentoId,
                void_reason: detalle.replace(/^Anulada:?\s*/i, '').trim() || undefined,
                had_payments: Number(d.amount_paid ?? 0) > 0,
            }, isSandbox, isDemo);
        }
    } catch { /* la analítica es best-effort: nunca bloquea la operación */ }
}

export interface InvoiceTimelineEntry {
    tipo: string;
    detalle: string;
    cuando: string;
}

/** Historia de la factura, de lo más reciente a lo más antiguo. */
export async function getInvoiceTimeline(orgId: string, documentoId: string): Promise<InvoiceTimelineEntry[]> {
    try {
        const [rows] = await withOrgTx(orgId, sql`
            select tipo, detalle, created_at
              from eventos
             where documento_id = ${documentoId} and org_id = ${orgId}
             order by created_at desc
             limit 50`);
        return rows.map((e: any) => ({
            tipo: String(e.tipo),
            detalle: String(e.detalle ?? ''),
            cuando: e.created_at instanceof Date ? e.created_at.toISOString() : String(e.created_at),
        }));
    } catch { return []; }
}

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

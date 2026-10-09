// Factura electrónica europea desde un documento guardado: la descarga, el
// adjunto del correo y el detalle de la factura pasan por aquí.
//
// Todo sale de la fila de `loadInvoiceDocumentRow` (snapshot inmutable). Lo
// único que se lee "en vivo" es lo que también lee el PDF de siempre —marca y
// condiciones—, porque el Factur-X ES ese PDF.
//
// Qué NO hace: transmitir. Ni red Peppol ni plataforma de facturación
// electrónica francesa: el documento se genera, se descarga y viaja adjunto al
// correo. La UI no ofrece un envío que no existe (regla 15).

import { decryptSecret } from '../../crypto-secret';
import { invoicePdfInput } from '../invoice-download';
import { loadArchivalFonts } from '../../pdf/pdfa';
import { isTermCode } from '../../payment-terms';
import {
    assessEInvoice, formatProblems, EINVOICE_FORMATS,
    type EInvoiceAssessment, type EInvoiceFormat, type EInvoiceProblem, type EInvoiceSource,
} from './model';
import { serializeCii } from './cii';
import { serializeUbl } from './ubl';
import { buildFacturX } from './facturx';
import type { FiscalLineItem, FiscalParty } from '../index';

export interface EInvoiceFile {
    filename: string;
    contentType: string;
    content: Buffer;
}

/** La cuenta para transferencia congelada al emitir (`payee_account`). */
function payee(doc: any): { iban: string | null; bic: string | null; accountName: string | null } {
    const acc = doc.payee_account && typeof doc.payee_account === 'object' ? doc.payee_account : null;
    return {
        iban: acc?.ibanEnc ? (decryptSecret(String(acc.ibanEnc)) || null) : null,
        bic: acc?.bic ? String(acc.bic) : null,
        accountName: acc?.holder ? String(acc.holder) : null,
    };
}

/** Fila de `loadInvoiceDocumentRow` → fuente del modelo EN 16931. */
export function sourceFromRow(doc: any): EInvoiceSource {
    const term = String(doc.terminos || '');
    return {
        invoiceNumber: String(doc.invoice_number || ''),
        documentType: String(doc.document_type || ''),
        status: String(doc.status || ''),
        lifecycle: String(doc.lifecycle || ''),
        simulated: Boolean(doc.provider_data?.simulado),
        countryCode: String(doc.country_code || ''),
        currency: String(doc.currency || ''),
        ledgerCurrency: doc.ledger_currency ? String(doc.ledger_currency) : null,
        fxRate: doc.fx_rate !== null && doc.fx_rate !== undefined ? Number(doc.fx_rate) : null,
        subtotal: Number(doc.subtotal || 0),
        taxTotal: Number(doc.tax_total || 0),
        total: Number(doc.total || 0),
        retencionTotal: Number(doc.retencion_total || 0),
        issuedAt: doc.issued_at ?? null,
        timeZone: (doc.zona_horaria as string) || null,
        dueDate: (doc.invoice_due_text as string) || null,
        serviceDate: (doc.service_date as string) || null,
        serviceDateEnd: (doc.service_date_end as string) || null,
        notes: (doc.document_notes as string) || null,
        buyerReference: (doc.buyer_reference as string) || null,
        purchaseOrder: (doc.purchase_order as string) || null,
        creditNoteOf: doc.credit_note_of_number
            ? { number: String(doc.credit_note_of_number), issuedAt: doc.credit_note_of_issued_at ?? null }
            : null,
        paymentTermsCode: isTermCode(term) ? term : null,
        issuer: (doc.issuer_snapshot || {}) as FiscalParty,
        recipient: (doc.recipient_snapshot || {}) as FiscalParty,
        lines: (Array.isArray(doc.line_items_snapshot) ? doc.line_items_snapshot : []) as FiscalLineItem[],
        ...payee(doc),
    };
}

/** Qué formatos admite el documento y, de los que no, qué falta. */
export function einvoiceStatus(doc: any): { assessment: EInvoiceAssessment; formats: Record<EInvoiceFormat, EInvoiceProblem[]> } {
    const assessment = assessEInvoice(sourceFromRow(doc));
    const formats = Object.fromEntries(EINVOICE_FORMATS.map((f) => [f, formatProblems(f, assessment)])) as Record<EInvoiceFormat, EInvoiceProblem[]>;
    return { assessment, formats };
}

const safeName = (value: string) => String(value).replace(/[^a-zA-Z0-9._-]/g, '-').slice(0, 80) || 'invoice';

/** Genera el archivo del formato pedido, o dice por qué no se puede. */
export async function renderEInvoice(orgId: string, doc: any, format: EInvoiceFormat):
    Promise<{ ok: true; file: EInvoiceFile } | { ok: false; problems: EInvoiceProblem[] }> {
    const assessment = assessEInvoice(sourceFromRow(doc));
    const problems = formatProblems(format, assessment);
    if (problems.length || !assessment.invoice) return { ok: false, problems };
    const invoice = assessment.invoice;
    const name = safeName(invoice.number);
    switch (format) {
        case 'facturx': {
            const fonts = await loadArchivalFonts();
            const { pdf } = buildFacturX(await invoicePdfInput(orgId, doc, false), invoice, fonts);
            return { ok: true, file: { filename: `${name}.pdf`, contentType: 'application/pdf', content: pdf } };
        }
        case 'xrechnung':
            return { ok: true, file: { filename: `${name}-xrechnung.xml`, contentType: 'application/xml', content: Buffer.from(serializeUbl(invoice, 'xrechnung'), 'utf8') } };
        case 'xrechnung-cii':
            return { ok: true, file: { filename: `${name}-xrechnung-cii.xml`, contentType: 'application/xml', content: Buffer.from(serializeCii(invoice, 'xrechnung'), 'utf8') } };
        case 'peppol':
            return { ok: true, file: { filename: `${name}-peppol.xml`, contentType: 'application/xml', content: Buffer.from(serializeUbl(invoice, 'peppol'), 'utf8') } };
    }
}

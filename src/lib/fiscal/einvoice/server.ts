// Factura electrónica desde un documento guardado: la descarga, el adjunto del
// correo y el detalle de la factura pasan por aquí.
//
// Todo sale de la fila de `loadInvoiceDocumentRow` (snapshot inmutable). Lo
// único que se lee "en vivo" es lo que también lee el PDF de siempre —marca y
// condiciones—, porque el Factur-X ES ese PDF, y el certificado con que el
// negocio firma su Facturae si lo activó.
//
// Qué NO hace: transmitir. Ni red Peppol, ni plataforma de facturación
// electrónica francesa, ni FACe: el documento se genera, se descarga y viaja
// adjunto al correo. La UI no ofrece un envío que no existe (regla 15).

import { decryptSecret } from '../../crypto-secret';
import { sql, withOrgTx } from '../../db';
import { invoicePdfInput, loadInvoiceDocumentRow } from '../invoice-download';
import { loadArchivalFonts } from '../../pdf/pdfa';
import { isTermCode } from '../../payment-terms';
import {
    assessEInvoice, formatProblems, EN16931_FORMATS,
    type EInvoiceAssessment, type EInvoiceFormat, type EInvoiceProblem, type EInvoiceSource, type En16931Format,
} from './model';
import { serializeCii } from './cii';
import { serializeUbl } from './ubl';
import { buildFacturX } from './facturx';
import { assessFacturae, type FacturaeSource } from './facturae';
import { signFacturae, type FacturaeSigner } from './xades';
import { credencialesFirma } from '../verifactu/cert';
import type { FiscalAddress, FiscalLineItem, FiscalParty, FiscalRetencion } from '../index';

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

/** Fila de `loadInvoiceDocumentRow` → fuente del modelo. */
export function sourceFromRow(doc: any): FacturaeSource {
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
        retenciones: (Array.isArray(doc.retenciones_snapshot) ? doc.retenciones_snapshot : []) as FiscalRetencion[],
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
        deliveryAddress: doc.delivery_address && typeof doc.delivery_address === 'object' ? doc.delivery_address as FiscalAddress : null,
        ...payee(doc),
    };
}

const isSpanishIssuer = (src: EInvoiceSource) =>
    String(src.issuer?.address?.countryCode || src.countryCode || '').toUpperCase() === 'ES';

/** Qué formatos admite el documento y, de los que no, qué falta. */
export function einvoiceStatus(doc: any): { assessment: EInvoiceAssessment; formats: Partial<Record<EInvoiceFormat, EInvoiceProblem[]>> } {
    const src = sourceFromRow(doc);
    const assessment = assessEInvoice(src);
    const formats: Partial<Record<EInvoiceFormat, EInvoiceProblem[]>> = Object.fromEntries(EN16931_FORMATS.map((f) => [f, formatProblems(f, assessment)]));
    // Facturae es el formato español: solo se ofrece a emisores en España.
    if (isSpanishIssuer(src)) formats.facturae = assessFacturae(src).problems;
    return { assessment, formats };
}

const safeName = (value: string) => String(value).replace(/[^a-zA-Z0-9._-]/g, '-').slice(0, 80) || 'invoice';

/**
 * El certificado con que el negocio firma su Facturae: el mismo que subió para
 * Verifactu, y solo si activó la firma en Ajustes › Perfil fiscal
 * (`fiscal_metadata.facturae_firma`). Sin certificado vigente, `null`: la
 * Facturae se entrega sin firmar y la pantalla lo dice.
 */
async function signingRow(orgId: string): Promise<any | null> {
    const [rows] = await withOrgTx(orgId, sql`
        select fiscal_metadata, verifactu_cert_enc, verifactu_cert_pass_enc, verifactu_cert_caduca
          from orgs where id = ${orgId} limit 1`);
    const org = rows[0];
    if (!org || org.fiscal_metadata?.facturae_firma !== true || !org.verifactu_cert_enc) return null;
    // `verifactu_cert_caduca` es un día: el certificado vale todo ese día.
    const caduca = org.verifactu_cert_caduca instanceof Date
        ? org.verifactu_cert_caduca.toISOString().slice(0, 10)
        : String(org.verifactu_cert_caduca || '').slice(0, 10);
    if (caduca && caduca < new Date().toISOString().slice(0, 10)) return null;
    return org;
}

export async function facturaeSigner(orgId: string): Promise<FacturaeSigner | null> {
    const org = await signingRow(orgId);
    if (!org) return null;
    const p12b64 = decryptSecret(String(org.verifactu_cert_enc));
    const password = decryptSecret(String(org.verifactu_cert_pass_enc || ''));
    if (!p12b64 || !password) return null;
    try {
        return credencialesFirma(Buffer.from(p12b64, 'base64'), password);
    } catch {
        return null;
    }
}

/** Genera el archivo del formato pedido, o dice por qué no se puede. */
export async function renderEInvoice(orgId: string, doc: any, format: EInvoiceFormat):
    Promise<{ ok: true; file: EInvoiceFile; signed?: boolean } | { ok: false; problems: EInvoiceProblem[] }> {
    const src = sourceFromRow(doc);
    if (format === 'facturae') {
        if (!isSpanishIssuer(src)) {
            return { ok: false, problems: [{ code: 'facturae_es_only', es: 'Facturae es el formato de factura electrónica de España: solo para emisores establecidos ahí.', en: 'Facturae is the Spanish e-invoice format: only for issuers established in Spain.' }] };
        }
        const fe = assessFacturae(src);
        if (!fe.xml) return { ok: false, problems: fe.problems };
        const name = safeName(src.invoiceNumber);
        const signer = await facturaeSigner(orgId);
        if (signer) {
            return { ok: true, signed: true, file: { filename: `${name}-facturae.xsig`, contentType: 'application/xml', content: Buffer.from(signFacturae(fe.xml, signer), 'utf8') } };
        }
        return { ok: true, signed: false, file: { filename: `${name}-facturae.xml`, contentType: 'application/xml', content: Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>\n${fe.xml}`, 'utf8') } };
    }
    const assessment = assessEInvoice(src);
    const problems = formatProblems(format, assessment);
    if (problems.length || !assessment.invoice) return { ok: false, problems };
    const invoice = assessment.invoice;
    const name = safeName(invoice.number);
    switch (format as En16931Format) {
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
    return { ok: false, problems: [] };
}

/** Nombres de los formatos: nombres propios, iguales en todo idioma. */
export const EINVOICE_LABELS: Record<EInvoiceFormat, string> = {
    facturx: 'Factur-X (PDF)',
    xrechnung: 'XRechnung (UBL)',
    'xrechnung-cii': 'XRechnung (CII)',
    peppol: 'Peppol BIS 3.0 (UBL)',
    facturae: 'Facturae 3.2.2 (XML)',
};

// Problemas que significan "este documento no tiene versión electrónica" (no
// es de la UE, es una proforma, no está emitido…): la sección no se dibuja en
// vez de listar algo que el negocio no puede ni debe corregir.
const NO_APLICA = new Set(['issuer_not_eu', 'proforma', 'document_type', 'not_issued', 'void', 'test_document']);

export interface EInvoiceSummary {
    available: EInvoiceFormat[];
    /** Lo que falta para los formatos que no se pueden generar, sin repetir. */
    missing: EInvoiceProblem[];
    /** Facturae: si se descarga firmada con el certificado del negocio. `null` si no aplica. */
    facturaeSigned: boolean | null;
}

/**
 * Qué formatos ofrece la factura y qué falta para el resto, o `null` si el
 * documento no tiene versión electrónica. Lo leen el detalle de la factura y
 * su página pública (con el token, que acota la lectura).
 */
export async function einvoiceSummary(orgId: string, documentId: string, publicToken?: string): Promise<EInvoiceSummary | null> {
    const doc = await loadInvoiceDocumentRow(orgId, documentId, publicToken);
    if (!doc || doc.status !== 'issued') return null;
    const { assessment, formats } = einvoiceStatus(doc);
    if (assessment.problems.some((p) => NO_APLICA.has(p.code))) return null;
    const offered = Object.keys(formats) as EInvoiceFormat[];
    const available = offered.filter((f) => formats[f]!.length === 0);
    const missing: EInvoiceProblem[] = [];
    for (const f of offered) {
        for (const p of formats[f]!) if (!missing.some((m) => m.code === p.code)) missing.push(p);
    }
    // Sin abrir el certificado (su contraseña cuesta derivaciones): firma activada
    // y certificado vigente. Si al descargar no se pudiera abrir, sale sin firmar.
    const facturaeSigned = available.includes('facturae') ? (await signingRow(orgId)) !== null : null;
    return { available, missing, facturaeSigned };
}

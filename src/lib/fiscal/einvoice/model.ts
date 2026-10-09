// Modelo semántico EN 16931 de una factura de Cord.
//
// La factura electrónica europea (Factur-X, XRechnung, Peppol BIS Billing 3.0)
// no es otro documento: es la MISMA factura que el PDF, escrita para una
// máquina. Por eso este modelo se arma SOLO con lo que quedó congelado al
// emitir —`documentos_fiscales` y sus snapshots— y nunca con datos vivos de la
// organización, que cambian después: el XML de una factura de marzo no puede
// salir con la dirección que el negocio capturó en junio.
//
// Los importes no se recalculan: se TOMAN del snapshot y se comprueba que
// cuadren con las reglas del estándar (BR-CO-10/13/14/15, BR-S-08, BR-*-08 del
// desglose). Si un documento viejo no cuadra al céntimo, no se genera: un XML
// con un total distinto al del PDF serían dos facturas distintas con el mismo
// número.
//
// Fuentes primarias verificadas (oct 2026): EN 16931-1 vía el schematron
// oficial CEN/TC 434 v1.3.16 (UBL y CII), XRechnung 3.0.2 (configuración del
// validador KoSIT), Peppol BIS Billing 3.0.21 y Factur-X 1.07.2/1.09.

import type { FiscalLineItem, FiscalParty } from '../index';
import { getCountryProfile, isEuCountry, spainTaxTerritory } from '../../countries';
import { currencyDecimals, normalizeCurrency } from '../../currency';
import { checkTaxId } from '../../../../packages/elements/src/fiscal/tax-id';
import { nifIvaUE } from '../verifactu/validacion';
import { docLangFor, termText, type DocLang } from '../invoice-pdf';
import { EU_EXEMPTION_INFO, EXEMPTION_INFO, isEuExemptionCode, isExemptionReason, type ZeroVatCategory } from '../exemption';
import { ibanValido } from '../../payout-fields';
import { EAS_SCHEMES, splitEInvoiceAddress } from './codes';

export type VatCategory = 'S' | ZeroVatCategory;
export type EInvoiceFormat = 'facturx' | 'xrechnung' | 'xrechnung-cii' | 'peppol';
export const EINVOICE_FORMATS: readonly EInvoiceFormat[] = ['facturx', 'xrechnung', 'xrechnung-cii', 'peppol'];

export function isEInvoiceFormat(value: unknown): value is EInvoiceFormat {
    return typeof value === 'string' && (EINVOICE_FORMATS as readonly string[]).includes(value);
}

/** Lo que el documento congeló al emitir. Nada de aquí sale de `orgs` en vivo. */
export interface EInvoiceSource {
    invoiceNumber: string;
    documentType: string;
    status?: string;
    lifecycle?: string;
    simulated?: boolean;
    countryCode: string;
    currency: string;
    ledgerCurrency?: string | null;
    fxRate?: number | null;
    subtotal: number;
    taxTotal: number;
    total: number;
    retencionTotal?: number | null;
    issuedAt: string | Date | null;
    /**
     * Zona del emisor para la fecha de expedición. Es la misma que usa el PDF
     * (`orgs.zona_horaria`): las dos representaciones dicen el mismo día.
     */
    timeZone?: string | null;
    dueDate?: string | Date | null;
    serviceDate?: string | null;
    serviceDateEnd?: string | null;
    notes?: string | null;
    buyerReference?: string | null;
    purchaseOrder?: string | null;
    creditNoteOf?: { number: string; issuedAt?: string | Date | null } | null;
    paymentTermsCode?: string | null;
    issuer: FiscalParty;
    recipient: FiscalParty;
    lines: FiscalLineItem[];
    /**
     * Cuenta para transferencia congelada al emitir (`documentos_fiscales.
     * payee_account`): el IBAN ya descifrado por quien carga el documento.
     */
    iban?: string | null;
    bic?: string | null;
    accountName?: string | null;
}

export interface EnAddress {
    line1?: string;
    line2?: string;
    city?: string;
    postalCode?: string;
    region?: string;
    country: string;
}

export interface EnParty {
    name: string;
    /** BT-31 / BT-48 — con prefijo de país (BR-CO-09). */
    vatId?: string;
    /** BT-32, solo vendedor (esquema "FC"). */
    taxRegistrationId?: string;
    /** BT-30 / BT-47. */
    legalId?: { id: string; scheme?: string };
    /** BT-34 / BT-49. */
    electronicAddress?: { scheme: string; id: string };
    address: EnAddress;
    contact?: { name?: string; phone?: string; email?: string };
}

export interface EnLine {
    id: string;
    name: string;
    quantity: number;
    unitCode: string;
    /** BT-131: importe neto de la línea ANTES del descuento de documento. */
    netAmount: number;
    /** BT-146: precio neto por unidad (BT-131 / cantidad). */
    netPrice: number;
    category: VatCategory;
    /** BT-152 en porcentaje. No se escribe para la categoría O (BR-O-05). */
    rate: number;
    /** Descuento de documento repartido a la línea (va al BG-20 de su categoría). */
    discount: number;
    /** Base imponible de la línea = netAmount − discount = `subtotal` del snapshot. */
    taxable: number;
    tax: number;
    exemptionCode?: string;
    exemptionText?: string;
}

export interface EnAllowance {
    /** BT-92. */
    amount: number;
    category: VatCategory;
    rate: number;
    /** BT-97 y BT-98 (UNTDID 5189: 95 = descuento). */
    reason: string;
    reasonCode: '95';
}

export interface EnVatBreakdown {
    category: VatCategory;
    rate: number;
    /** BT-116. */
    taxable: number;
    /** BT-117. */
    tax: number;
    exemptionCode?: string;
    exemptionText?: string;
}

export interface En16931Invoice {
    number: string;
    /** 380 factura, 381 nota de crédito (UNTDID 1001). */
    typeCode: '380' | '381';
    issueDate: string;
    currency: string;
    /** BT-6: divisa contable del IVA cuando difiere de la del documento. */
    taxCurrency?: string;
    dueDate?: string;
    buyerReference?: string;
    purchaseOrder?: string;
    /** BG-1: texto (BT-22) y, si aplica, su código de asunto UNTDID 4451 (BT-21). */
    notes: { text: string; subject?: string }[];
    preceding?: { number: string; issueDate?: string };
    seller: EnParty;
    buyer: EnParty;
    /** BT-72 y BG-15 (dirección de entrega, con su país BT-80). */
    delivery?: { date?: string; address?: EnAddress };
    /** BG-14. */
    period?: { start: string; end: string };
    /** BG-16. */
    paymentMeans?: { code: string; iban?: string; bic?: string; accountName?: string; remittance?: string };
    paymentTerms?: string;
    allowances: EnAllowance[];
    lines: EnLine[];
    vat: EnVatBreakdown[];
    totals: {
        lineNet: number;       // BT-106
        allowances: number;    // BT-107
        taxExclusive: number;  // BT-109
        tax: number;           // BT-110
        taxInAccounting?: number; // BT-111
        taxInclusive: number;  // BT-112
        payable: number;       // BT-115
    };
    lang: DocLang;
}

/** Algo que impide generar el documento, dicho para quien lo puede arreglar. */
export interface EInvoiceProblem {
    code: string;
    es: string;
    en: string;
    /** Dónde se corrige: Ajustes › Datos fiscales, Ajustes › Cobros, el cliente, la factura o el catálogo de impuestos. */
    fix?: 'fiscal' | 'cobros' | 'cliente' | 'factura' | 'impuestos';
}

const p = (code: string, es: string, en: string, fix?: EInvoiceProblem['fix']): EInvoiceProblem => ({ code, es, en, ...(fix ? { fix } : {}) });

const round2 = (n: number) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const cents = (n: number) => Math.round((Number(n) + Number.EPSILON) * 100);

// ── Fechas ─────────────────────────────────────────────────────────────────

function validTimeZone(value: string | null | undefined): string | undefined {
    if (!value) return undefined;
    try { new Intl.DateTimeFormat('en-US', { timeZone: value }); return value; } catch { return undefined; }
}

/** El día de un instante en la zona del emisor, aaaa-mm-dd. Mismo criterio que el PDF. */
export function isoDayIn(value: string | Date, timeZone?: string | null): string {
    const parts = new Intl.DateTimeFormat('en-CA', {
        year: 'numeric', month: '2-digit', day: '2-digit', timeZone: validTimeZone(timeZone) ?? 'UTC',
    }).formatToParts(new Date(value));
    const get = (t: string) => parts.find((x) => x.type === t)?.value ?? '';
    return `${get('year')}-${get('month')}-${get('day')}`;
}

/**
 * Una columna `date` de Postgres: el driver la entrega como un Date a
 * medianoche LOCAL del proceso. Se toman sus componentes locales, igual que
 * `venceDia()`; con `toISOString()` una fecha se correría un día.
 */
export function calendarDay(value: string | Date | null | undefined): string | undefined {
    if (!value) return undefined;
    if (value instanceof Date) {
        if (!Number.isFinite(value.getTime())) return undefined;
        return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
    }
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value));
    return m ? `${m[1]}-${m[2]}-${m[3]}` : undefined;
}

// ── Partes ─────────────────────────────────────────────────────────────────

const clean = (v: unknown) => String(v ?? '').trim();

/** { scheme, id } del snapshot (o "0204:991-12345-67"), solo con un esquema de la lista EAS. */
export function parseElectronicAddress(value: unknown): { scheme: string; id: string } | null {
    if (value && typeof value === 'object') {
        const o = value as { scheme?: unknown; id?: unknown };
        const scheme = clean(o.scheme).toUpperCase();
        const id = clean(o.id);
        return scheme && id && EAS_SCHEMES.has(scheme) ? { scheme, id } : null;
    }
    return splitEInvoiceAddress(value);
}

/** Clave de la TVA francesa a partir del SIREN: (12 + 3 × (SIREN mod 97)) mod 97. */
export function frVatFromSiren(siren: string): string {
    const key = (12 + 3 * (Number(siren) % 97)) % 97;
    return `FR${String(key).padStart(2, '0')}${siren}`;
}

interface PartyIds { vatId?: string; taxRegistrationId?: string; legalId?: { id: string; scheme?: string } }

/**
 * Qué es cada identificador. Cord guarda UN `taxId` por parte; el estándar
 * distingue el NIF-IVA (BT-31/48), el registro fiscal local (BT-32) y el
 * registro legal (BT-30/47). El tipo se re-deriva con los mismos validadores
 * que lo aceptaron al capturarlo (`checkTaxId`), no se adivina por longitud.
 */
export function partyIds(party: FiscalParty, role: 'seller' | 'buyer', smallBusiness = false): PartyIds {
    const cc = clean(party.address?.countryCode).toUpperCase();
    const out: PartyIds = {};
    // El registro mercantil capturado a mano. En Francia su forma dice qué es
    // (SIREN 9 dígitos → esquema 0002, SIRET 14 → 0009); en el resto se
    // declara sin esquema, que el estándar admite.
    const legal = clean(party.legalRegistrationId?.id);
    const legalScheme = clean(party.legalRegistrationId?.scheme)
        || (cc === 'FR' && /^\d{9}$/.test(legal) ? '0002' : cc === 'FR' && /^\d{14}$/.test(legal) ? '0009' : '');
    const explicit = legal ? { id: legal, ...(legalScheme ? { scheme: legalScheme } : {}) } : undefined;
    if (explicit) out.legalId = explicit;
    const raw = clean(party.taxId);
    if (!raw) return out;
    const checked = checkTaxId(cc, raw);
    const kind = checked.ok ? checked.kind : undefined;
    const normalized = checked.ok ? checked.normalized : raw.toUpperCase().replace(/\s+/g, '');
    switch (cc) {
        case 'FR':
            if (kind === 'tva') {
                out.vatId = normalized;
                out.legalId ??= { id: normalized.slice(4), scheme: '0002' };
            } else if (kind === 'siren' || kind === 'siret') {
                const siren = normalized.slice(0, 9);
                out.legalId ??= kind === 'siren' ? { id: siren, scheme: '0002' } : { id: normalized, scheme: '0009' };
                // Un vendedor que repercute TVA tiene número intracomunitario, y
                // su clave se calcula del SIREN con la fórmula oficial. En
                // franquicia no lo usa: el SIREN va como registro fiscal.
                if (role === 'seller' && !smallBusiness) out.vatId = frVatFromSiren(siren);
                else if (role === 'seller') out.taxRegistrationId = siren;
            } else if (role === 'buyer') out.legalId ??= { id: normalized };
            return out;
        case 'DE':
            if (kind === 'ust_idnr') out.vatId = normalized;
            // La Steuernummer es registro FISCAL (BT-32), no mercantil: del
            // comprador no tiene casilla en el estándar y no se fuerza en otra.
            else if (kind === 'steuernummer') { if (role === 'seller') out.taxRegistrationId = normalized; }
            else if (role === 'buyer') out.legalId ??= { id: normalized };
            return out;
        case 'ES':
            if (kind === 'nif' || kind === 'nie' || kind === 'cif') {
                out.vatId = `ES${normalized}`;
                out.legalId ??= { id: normalized };
            } else if (role === 'buyer') out.legalId ??= { id: normalized };
            return out;
        default: {
            const vat = isEuCountry(cc) ? nifIvaUE(cc, raw) : null;
            if (vat) out.vatId = vat;
            else if (kind === 'vat' && /^[A-Z]{2}/.test(normalized)) out.vatId = normalized;
            else if (role === 'buyer') out.legalId ??= { id: normalized };
            else out.taxRegistrationId = normalized;
            return out;
        }
    }
}

function enAddress(party: FiscalParty): EnAddress {
    const a = party.address;
    return {
        ...(clean(a?.line1) ? { line1: clean(a?.line1) } : {}),
        ...(clean(a?.line2) ? { line2: clean(a?.line2) } : {}),
        ...(clean(a?.city) ? { city: clean(a?.city) } : {}),
        ...(clean(a?.postalCode) ? { postalCode: clean(a?.postalCode) } : {}),
        ...(clean(a?.region) ? { region: clean(a?.region) } : {}),
        country: clean(a?.countryCode).toUpperCase(),
    };
}

// ── Textos en la lengua del documento ────────────────────────────────────────

const DISCOUNT_TEXT: Record<DocLang, string> = { es: 'Descuento', en: 'Discount', fr: 'Remise', de: 'Rabatt', pt: 'Desconto' };
const EXEMPT_TEXT: Record<DocLang, string> = {
    es: 'Operación exenta de IVA', en: 'Exempt from VAT', fr: 'Exonération de TVA', de: 'Steuerbefreite Leistung', pt: 'Isento de IVA',
};
const SMALL_BUSINESS_DE = 'Kleinunternehmer gemäß § 19 UStG';
// Francia, entre profesionales: las menciones del art. L441-9/L441-10 del Code
// de commerce que el PDF imprime en un párrafo (FR_B2B_NOTICE de invoice-pdf),
// separadas con los códigos de asunto que usa la factura electrónica francesa
// (BR-FR-05: PMD penalidades, PMT indemnización de cobro, AAB descuento).
const FR_B2B_NOTES: { subject: string; text: string }[] = [
    { subject: 'PMD', text: "En cas de retard de paiement, pénalités au taux d'intérêt de la BCE majoré de 10 points (art. L441-10 du Code de commerce)." },
    { subject: 'PMT', text: 'Indemnité forfaitaire pour frais de recouvrement de 40 € (art. L441-10 du Code de commerce).' },
    { subject: 'AAB', text: "Pas d'escompte pour paiement anticipé." },
];
const CREDIT_TERMS: Record<DocLang, (n: string) => string> = {
    es: (n) => `Nota de crédito de la factura ${n}`,
    en: (n) => `Credit note for invoice ${n}`,
    fr: (n) => `Avoir sur la facture ${n}`,
    de: (n) => `Gutschrift zur Rechnung ${n}`,
    pt: (n) => `Nota de crédito da fatura ${n}`,
};

// ── Categoría de IVA de cada línea ───────────────────────────────────────────

interface LineVat { category: VatCategory; code?: string; text?: string }

/**
 * Categoría UNTDID 5305 de una línea.
 *
 * - Tasa > 0 → S, siempre.
 * - Al 0 % con causa explícita: España traduce su causa de Verifactu (la que
 *   declara a la AEAT) y el resto de la UE usa la clasificación VATEX que el
 *   negocio eligió en su perfil exento (`exemption.ts`).
 * - Al 0 % sin causa se deriva del contexto, solo donde el contexto alcanza:
 *     · franquicia del emisor (FR art. 293 B, DE § 19) → E con su mención;
 *     · cliente de OTRO Estado miembro con NIF-IVA en ambos lados → AE;
 *     · cliente fuera de la UE → G (exportación). Se eligió G y no O porque
 *       O (BR-O-02) obliga a quitar el NIF-IVA del vendedor, que el art. 226.3
 *       de la Directiva pide en toda factura, y (BR-O-11..14) prohíbe cualquier
 *       otra categoría en el documento. Un servicio fuera del ámbito del IVA se
 *       declara eligiendo VATEX-EU-O en el perfil exento;
 *     · nacional → E con el texto genérico de exención.
 */
export function lineVat(line: FiscalLineItem, ctx: { issuerCountry: string; buyerCountry: string; sellerVat?: string; buyerVat?: string; smallBusiness: boolean; lang: DocLang }): LineVat {
    const rate = Number(line.taxRate) || 0;
    if (rate > 0) return { category: 'S' };
    const reason = clean(line.exemptionReason).toUpperCase();
    if (ctx.issuerCountry === 'ES' && isExemptionReason(reason)) {
        const mencion = EXEMPTION_INFO[reason].mencion;
        switch (reason) {
            case 'E2': return { category: 'G', code: 'VATEX-EU-G', text: mencion };
            case 'E5': return { category: 'K', code: 'VATEX-EU-IC', text: mencion };
            case 'S2': return { category: 'AE', code: 'VATEX-EU-AE', text: mencion };
            case 'N1': return { category: 'O', code: 'VATEX-EU-O', text: mencion };
            case 'N2':
                // No sujeta por localización: con un empresario de otro Estado
                // miembro es la inversión del sujeto pasivo del art. 196 de la
                // Directiva; fuera de la UE, fuera del ámbito del IVA.
                return isEuCountry(ctx.buyerCountry) && ctx.buyerCountry !== 'ES' && ctx.buyerVat
                    ? { category: 'AE', code: 'VATEX-EU-AE', text: mencion }
                    : { category: 'O', code: 'VATEX-EU-O', text: mencion };
            default: return { category: 'E', text: mencion };
        }
    }
    if (isEuExemptionCode(reason)) {
        const info = EU_EXEMPTION_INFO[reason];
        return info.category === 'Z' ? { category: 'Z' } : { category: info.category, code: reason, text: info.text };
    }
    if (ctx.smallBusiness) {
        return ctx.issuerCountry === 'FR'
            ? { category: 'E', code: 'VATEX-FR-FRANCHISE', text: EU_EXEMPTION_INFO['VATEX-FR-FRANCHISE'].text }
            : { category: 'E', text: SMALL_BUSINESS_DE };
    }
    const foreignEu = isEuCountry(ctx.buyerCountry) && ctx.buyerCountry !== ctx.issuerCountry;
    if (foreignEu && ctx.sellerVat && ctx.buyerVat) return { category: 'AE', code: 'VATEX-EU-AE', text: EU_EXEMPTION_INFO['VATEX-EU-AE'].text };
    if (ctx.buyerCountry && !isEuCountry(ctx.buyerCountry)) return { category: 'G', code: 'VATEX-EU-G', text: EU_EXEMPTION_INFO['VATEX-EU-G'].text };
    return { category: 'E', text: EXEMPT_TEXT[ctx.lang] };
}

// ── Ensamble ─────────────────────────────────────────────────────────────────

export interface EInvoiceAssessment {
    invoice: En16931Invoice | null;
    /** Problemas que impiden CUALQUIER formato. */
    problems: EInvoiceProblem[];
}

const CREDIT_TYPES = new Set(['commercial_credit_note', 'verifactu_credit_note', 'credit_note']);
const INVOICE_TYPES = new Set(['commercial_invoice', 'verifactu_invoice']);

/**
 * Arma el modelo y dice qué falta. Puro: sin red, sin base de datos, sin
 * reloj (salvo el formato de fechas). Lo ejercen vitest y el check oficial.
 */
export function assessEInvoice(src: EInvoiceSource): EInvoiceAssessment {
    const problems: EInvoiceProblem[] = [];
    const issuerCountry = clean(src.issuer?.address?.countryCode || src.countryCode).toUpperCase();
    const buyerCountry = clean(src.recipient?.address?.countryCode).toUpperCase();
    const isCredit = !!src.creditNoteOf || CREDIT_TYPES.has(src.documentType);

    // ── Qué documentos admiten una factura electrónica ──
    if (src.status && src.status !== 'issued') problems.push(p('not_issued', 'La factura todavía no está emitida.', 'The invoice has not been issued yet.', 'factura'));
    if (src.lifecycle === 'void') problems.push(p('void', 'Una factura anulada no genera factura electrónica.', 'A voided invoice does not produce an e-invoice.'));
    if (src.simulated) problems.push(p('test_document', 'Un documento de prueba no genera factura electrónica.', 'A test document does not produce an e-invoice.'));
    if (!INVOICE_TYPES.has(src.documentType) && !CREDIT_TYPES.has(src.documentType)) {
        problems.push(src.documentType === 'proforma'
            ? p('proforma', 'Una proforma no es una factura y no tiene versión electrónica.', 'A pro forma is not an invoice and has no e-invoice version.')
            : p('document_type', 'Este tipo de documento no tiene versión electrónica europea.', 'This document type has no European e-invoice version.'));
    }
    if (!isEuCountry(issuerCountry)) {
        problems.push(p('issuer_not_eu', 'La factura electrónica europea es para emisores establecidos en la UE.', 'European e-invoices are for issuers established in the EU.', 'fiscal'));
    }
    if (issuerCountry === 'ES' && spainTaxTerritory(src.issuer?.address?.region) !== 'iva') {
        problems.push(p('igic_ipsi', 'Las facturas con IGIC o IPSI todavía no tienen versión electrónica europea en Cord.', 'Invoices with IGIC or IPSI do not have a European e-invoice version in Cord yet.'));
    }
    // Las retenciones (IRPF) no existen en EN 16931: un "importe a pagar" menor
    // que el total rompería BR-CO-16 o declararía un pago que no es.
    if (Number(src.retencionTotal) > 0) {
        problems.push(p('withholding', 'Esta factura tiene retenciones y la factura electrónica europea no las admite. Emite sin retención para generarla.', 'This invoice has withholdings, which European e-invoices do not support. Issue it without withholding to generate one.'));
    }
    const currency = normalizeCurrency(src.currency, '');
    if (!currency) problems.push(p('currency', 'La divisa del documento no es válida.', 'The document currency is not valid.'));
    else if (currencyDecimals(currency) > 2) {
        problems.push(p('currency_decimals', `${currency} usa tres decimales y la factura electrónica europea admite dos.`, `${currency} uses three decimals and European e-invoices allow two.`));
    }
    if (!src.invoiceNumber) problems.push(p('no_number', 'La factura no tiene folio.', 'The invoice has no number.'));
    if (!src.issuedAt) problems.push(p('no_date', 'La factura no tiene fecha de emisión.', 'The invoice has no issue date.'));
    const lines = Array.isArray(src.lines) ? src.lines : [];
    if (!lines.length) problems.push(p('no_lines', 'La factura no tiene conceptos.', 'The invoice has no lines.'));

    const lang = docLangFor(getCountryProfile(issuerCountry || 'US').locale);
    const smallBusiness = src.issuer?.vatRegime === 'small_business';

    // ── Partes ──
    const sellerIds = partyIds(src.issuer || ({} as FiscalParty), 'seller', smallBusiness);
    const buyerIds = partyIds(src.recipient || ({} as FiscalParty), 'buyer');
    const seller: EnParty = {
        name: clean(src.issuer?.legalName),
        ...sellerIds,
        ...(src.issuer?.electronicAddress ? { electronicAddress: parseElectronicAddress(src.issuer.electronicAddress) ?? undefined } : {}),
        address: enAddress(src.issuer || ({} as FiscalParty)),
        contact: {
            ...(clean(src.issuer?.contactName) ? { name: clean(src.issuer?.contactName) } : {}),
            ...(clean(src.issuer?.phone) ? { phone: clean(src.issuer?.phone) } : {}),
            ...(clean(src.issuer?.email) ? { email: clean(src.issuer?.email) } : {}),
        },
    };
    const buyer: EnParty = {
        name: clean(src.recipient?.legalName),
        ...buyerIds,
        ...(src.recipient?.electronicAddress ? { electronicAddress: parseElectronicAddress(src.recipient.electronicAddress) ?? undefined } : {}),
        address: enAddress(src.recipient || ({} as FiscalParty)),
        contact: {
            ...(clean(src.recipient?.contactName) ? { name: clean(src.recipient?.contactName) } : {}),
            ...(clean(src.recipient?.phone) ? { phone: clean(src.recipient?.phone) } : {}),
            ...(clean(src.recipient?.email) ? { email: clean(src.recipient?.email) } : {}),
        },
    };
    if (!seller.electronicAddress) delete seller.electronicAddress;
    if (!buyer.electronicAddress) delete buyer.electronicAddress;
    if (!seller.name) problems.push(p('seller_name', 'Falta la razón social del emisor.', 'The issuer legal name is missing.', 'fiscal'));
    if (!seller.address.line1 || !seller.address.city || !seller.address.postalCode) {
        problems.push(p('seller_address', 'Completa el domicilio fiscal del emisor (calle, ciudad y código postal).', "Complete the issuer's address (street, city and postal code).", 'fiscal'));
    }
    if (!buyer.name) problems.push(p('buyer_name', 'Falta el nombre del cliente.', 'The client name is missing.', 'cliente'));
    if (!buyer.address.country) problems.push(p('buyer_country', 'Falta el país del cliente.', "The client's country is missing.", 'cliente'));

    // ── Líneas ──
    const ctx = { issuerCountry, buyerCountry, sellerVat: sellerIds.vatId, buyerVat: buyerIds.vatId, smallBusiness, lang };
    const enLines: EnLine[] = [];
    let linesCuadran = true;
    lines.forEach((line, index) => {
        const quantity = Number(line.quantity);
        const taxable = Number(line.subtotal);
        const discount = Math.max(0, Number(line.discount) || 0);
        const tax = Number(line.taxAmount);
        const rate = Number(line.taxRate) || 0;
        if (!(quantity > 0) || !Number.isFinite(taxable) || taxable < 0 || !Number.isFinite(tax)) {
            linesCuadran = false;
            return;
        }
        const vat = lineVat(line, ctx);
        if (vat.category !== 'S' && cents(tax) !== 0) linesCuadran = false;
        const netAmount = round2(taxable + discount);
        enLines.push({
            id: String(index + 1),
            name: clean(line.description) || '—',
            quantity,
            unitCode: clean(line.unitKey).toUpperCase() || 'C62',
            netAmount,
            netPrice: unitPrice(netAmount, quantity),
            category: vat.category,
            rate: vat.category === 'S' ? Math.round(rate * 1e8) / 1e6 : 0,
            discount: round2(discount),
            taxable: round2(taxable),
            tax: round2(tax),
            ...(vat.code ? { exemptionCode: vat.code } : {}),
            ...(vat.text ? { exemptionText: vat.text } : {}),
        });
    });
    if (!linesCuadran) {
        problems.push(p('lines_inconsistent', 'Los importes de los conceptos no cuadran entre sí; esta factura no puede representarse como factura electrónica.', 'The line amounts do not reconcile; this invoice cannot be represented as an e-invoice.'));
    }

    // ── Totales: se toman del documento y se comprueban al céntimo ──
    const sumTaxable = enLines.reduce((s, l) => s + cents(l.taxable), 0);
    const sumTax = enLines.reduce((s, l) => s + cents(l.tax), 0);
    const sumNet = enLines.reduce((s, l) => s + cents(l.netAmount), 0);
    const sumDiscount = enLines.reduce((s, l) => s + cents(l.discount), 0);
    if (linesCuadran && lines.length && (sumTaxable !== cents(src.subtotal) || sumTax !== cents(src.taxTotal)
        || cents(src.subtotal) + cents(src.taxTotal) - (Number(src.retencionTotal) > 0 ? cents(Number(src.retencionTotal)) : 0) !== cents(src.total))) {
        problems.push(p('totals_mismatch', 'Los totales de esta factura no son la suma exacta de sus conceptos (documento anterior al redondeo por línea). No se puede generar su factura electrónica sin cambiar importes.', 'The totals of this invoice are not the exact sum of its lines (a document from before per-line rounding). Its e-invoice cannot be generated without changing amounts.'));
    }

    // ── Desglose por categoría (BG-23) y descuentos de documento (BG-20) ──
    // E, AE, K, G, O y Z admiten UN solo grupo por categoría (BR-E-01 y
    // hermanas); S, uno por tasa. Los descuentos de documento repartidos a las
    // líneas se suman por la misma llave: así BT-116 = Σ BT-131 − Σ BT-92 de su
    // grupo exactamente, que es lo que piden BR-S-08 y BR-*-08.
    const groups = new Map<string, { category: VatCategory; rate: number; taxable: number; tax: number; discount: number; codes: Set<string>; texts: string[] }>();
    for (const l of enLines) {
        const key = l.category === 'S' ? `S:${l.rate}` : l.category;
        const g = groups.get(key) ?? { category: l.category, rate: l.category === 'S' ? l.rate : 0, taxable: 0, tax: 0, discount: 0, codes: new Set<string>(), texts: [] };
        g.taxable += cents(l.taxable);
        g.tax += cents(l.tax);
        g.discount += cents(l.discount);
        if (l.exemptionCode) g.codes.add(l.exemptionCode);
        if (l.exemptionText && !g.texts.includes(l.exemptionText)) g.texts.push(l.exemptionText);
        groups.set(key, g);
    }
    const ordered = [...groups.values()].sort((a, b) => (a.category === b.category ? a.rate - b.rate : a.category < b.category ? -1 : 1));
    const vat: EnVatBreakdown[] = ordered.map((g) => ({
        category: g.category,
        rate: g.rate,
        taxable: g.taxable / 100,
        tax: g.tax / 100,
        // Un solo código por grupo: si las líneas traen causas distintas, el
        // grupo conserva los textos (BT-120) y no inventa un código común.
        ...(g.codes.size === 1 ? { exemptionCode: [...g.codes][0] } : {}),
        ...(g.texts.length ? { exemptionText: g.texts.join(' ') } : {}),
    }));
    // El IVA de cada grupo es la suma de los impuestos YA redondeados por línea
    // (lo que dice el PDF). EN 16931 lo admite mientras difiera menos de una
    // unidad de base × tasa (BR-CO-17 y BR-S-09, schematron CEN v1.3.16); más
    // allá no hay forma honesta de escribirlo.
    if (ordered.some((g) => g.category === 'S' && Math.abs(g.tax - Math.round(g.taxable * g.rate / 100)) >= 100)) {
        problems.push(p('vat_rounding', 'El IVA de esta factura, redondeado concepto por concepto, se aleja más de una unidad del calculado sobre la base de cada tasa; la factura electrónica europea no lo admite.', 'The VAT on this invoice, rounded line by line, differs by more than one unit from the VAT computed on each rate base; European e-invoices do not allow it.'));
    }
    const allowances: EnAllowance[] = ordered.filter((g) => g.discount > 0).map((g) => ({
        amount: g.discount / 100, category: g.category, rate: g.rate, reason: DISCOUNT_TEXT[lang], reasonCode: '95',
    }));

    const categories = new Set(enLines.map((l) => l.category));
    // ── Reglas de categoría que dependen de las partes ──
    if (categories.has('O') && categories.size > 1) {
        problems.push(p('o_mixed', 'Una operación no sujeta al IVA no puede ir en la misma factura que conceptos con otra categoría de IVA. Emítelos en facturas separadas.', 'A supply not subject to VAT cannot share an invoice with lines of another VAT category. Issue them separately.', 'impuestos'));
    }
    if (categories.has('O')) {
        // BR-O-02: ni NIF-IVA del vendedor ni del comprador. El registro legal
        // identifica entonces al vendedor (BR-CO-26).
        delete seller.vatId;
        delete buyer.vatId;
        if (!seller.legalId && !seller.taxRegistrationId) {
            problems.push(p('o_legal_id', 'Para una operación no sujeta al IVA, la factura identifica al emisor por su número de registro mercantil. Agrégalo en Ajustes › Datos fiscales.', 'For a supply not subject to VAT, the invoice identifies the issuer by its company registration number. Add it in Settings › Tax profile.', 'fiscal'));
        }
    }
    const needsSellerVatOrTax = ['S', 'Z', 'E', 'AE'].some((c) => categories.has(c as VatCategory));
    if (needsSellerVatOrTax && !seller.vatId && !seller.taxRegistrationId) {
        problems.push(p('seller_vat', 'Falta el número de IVA del emisor. Agrégalo en Ajustes › Datos fiscales.', 'The issuer VAT number is missing. Add it in Settings › Tax profile.', 'fiscal'));
    }
    if ((categories.has('K') || categories.has('G')) && !seller.vatId) {
        problems.push(p('seller_vat_intl', 'Una exportación o entrega intracomunitaria necesita el número de IVA del emisor (con prefijo de país).', 'An export or intra-community supply needs the issuer VAT number (with country prefix).', 'fiscal'));
    }
    if (categories.has('K') && !buyer.vatId) {
        problems.push(p('buyer_vat_k', 'Una entrega intracomunitaria necesita el número de IVA del cliente (con prefijo de país).', "An intra-community supply needs the client's VAT number (with country prefix).", 'cliente'));
    }
    if (categories.has('AE') && !buyer.vatId && !buyer.legalId) {
        problems.push(p('buyer_vat_ae', 'La inversión del sujeto pasivo necesita el número de IVA del cliente.', "Reverse charge needs the client's VAT number.", 'cliente'));
    }

    // ── Fechas, periodo y entrega ──
    const issueDate = src.issuedAt ? isoDayIn(src.issuedAt, src.timeZone) : '';
    const serviceStart = calendarDay(src.serviceDate);
    const serviceEnd = calendarDay(src.serviceDateEnd);
    const period = serviceStart && serviceEnd ? { start: serviceStart, end: serviceEnd } : undefined;
    let deliveryDate = !period ? serviceStart : undefined;
    // Alemania: sin fecha de prestación, el PDF dice "entspricht dem
    // Rechnungsdatum" (§ 14 Abs. 4 Nr. 6 UStG). El XML dice lo mismo con datos.
    if (!deliveryDate && !period && issuerCountry === 'DE' && !isCredit) deliveryDate = issueDate;
    // Entrega intracomunitaria: BR-IC-11 pide fecha de entrega o periodo y
    // BR-IC-12 el país de destino, que Cord toma del domicilio del cliente. Va
    // la dirección completa y no solo el país: XRechnung pide ciudad y código
    // postal en cuanto hay dirección de entrega (BR-DE-10, BR-DE-11).
    if (categories.has('K') && !deliveryDate && !period) deliveryDate = issueDate;
    const delivery = deliveryDate || categories.has('K')
        ? { ...(deliveryDate ? { date: deliveryDate } : {}), ...(categories.has('K') && buyerCountry ? { address: { ...buyer.address } } : {}) }
        : undefined;

    // ── Divisa contable del IVA (BT-6 / BT-111): Directiva, art. 230 ──
    const ledger = normalizeCurrency(src.ledgerCurrency ?? '', '');
    const fx = Number(src.fxRate);
    const taxCurrency = ledger && currency && ledger !== currency && Number.isFinite(fx) && fx > 0 ? ledger : undefined;
    if (taxCurrency && currencyDecimals(taxCurrency) > 2) {
        problems.push(p('tax_currency_decimals', `${taxCurrency} usa tres decimales y la factura electrónica europea admite dos.`, `${taxCurrency} uses three decimals and European e-invoices allow two.`));
    }

    // ── Pago ──
    const iban = clean(src.iban).replace(/\s+/g, '').toUpperCase();
    const ibanOk = !!iban && ibanValido(iban);
    // Nota de crédito: el dinero va del vendedor al comprador y Cord no tiene la
    // cuenta del comprador. XRechnung (BR-DE-1) y Peppol entre empresas
    // alemanas (DE-R-001) exigen igualmente el grupo de instrucciones de pago,
    // así que se declara con UNTDID 4461 "1" (instrumento no definido): cierto,
    // y sin pretender una transferencia hacia una cuenta que no es la del
    // comprador.
    const paymentMeans = isCredit
        ? { code: '1' }
        : ibanOk
            ? {
                // 58 = transferencia SEPA (IBAN de la zona SEPA y euros); 30 = transferencia.
                code: currency === 'EUR' ? '58' : '30',
                iban,
                ...(clean(src.bic) ? { bic: clean(src.bic).toUpperCase() } : {}),
                ...(clean(src.accountName) ? { accountName: clean(src.accountName) } : {}),
                remittance: src.invoiceNumber,
            }
            : undefined;
    const dueDate = !isCredit ? calendarDay(src.dueDate) : undefined;
    const paymentTerms = isCredit
        ? CREDIT_TERMS[lang](src.creditNoteOf?.number || '')
        : src.paymentTermsCode ? termText(src.paymentTermsCode, lang) : undefined;

    const notes: { text: string; subject?: string }[] = [
        ...(clean(src.notes) ? [{ text: clean(src.notes) }] : []),
        ...(issuerCountry === 'FR' && clean(src.recipient?.taxId) ? FR_B2B_NOTES : []),
    ];

    const invoice: En16931Invoice | null = problems.length ? null : {
        number: src.invoiceNumber,
        typeCode: isCredit ? '381' : '380',
        issueDate,
        currency,
        ...(taxCurrency ? { taxCurrency } : {}),
        ...(dueDate ? { dueDate } : {}),
        ...(clean(src.buyerReference) ? { buyerReference: clean(src.buyerReference) } : {}),
        ...(clean(src.purchaseOrder) ? { purchaseOrder: clean(src.purchaseOrder) } : {}),
        notes,
        ...(src.creditNoteOf?.number ? {
            preceding: {
                number: src.creditNoteOf.number,
                ...(src.creditNoteOf.issuedAt ? { issueDate: isoDayIn(src.creditNoteOf.issuedAt, src.timeZone) } : {}),
            },
        } : {}),
        seller,
        buyer,
        ...(delivery ? { delivery } : {}),
        ...(period ? { period } : {}),
        ...(paymentMeans ? { paymentMeans } : {}),
        ...(paymentTerms ? { paymentTerms } : {}),
        allowances,
        lines: enLines,
        vat,
        totals: {
            lineNet: sumNet / 100,
            allowances: sumDiscount / 100,
            taxExclusive: sumTaxable / 100,
            tax: sumTax / 100,
            ...(taxCurrency ? { taxInAccounting: round2(Number(src.taxTotal) * fx) } : {}),
            taxInclusive: (sumTaxable + sumTax) / 100,
            payable: (sumTaxable + sumTax) / 100,
        },
        lang,
    };
    return { invoice, problems };
}

/**
 * Precio neto por unidad que reproduce el importe de la línea: Peppol
 * (PEPPOL-EN16931-R120) exige cantidad × precio ≈ importe con 0.02 de holgura.
 * Seis decimales bastan casi siempre; con cantidades enormes se usan más.
 */
export function unitPrice(netAmount: number, quantity: number): number {
    for (const digits of [2, 4, 6, 8, 10]) {
        const f = 10 ** digits;
        const price = Math.round((netAmount / quantity) * f) / f;
        if (Math.abs(price * quantity - netAmount) <= 0.005) return price;
    }
    return netAmount / quantity;
}

/** Lo que además pide cada formato. Vacío = se puede generar. */
export function formatProblems(format: EInvoiceFormat, assessment: EInvoiceAssessment): EInvoiceProblem[] {
    const out = [...assessment.problems];
    const inv = assessment.invoice;
    if (!inv) return out;
    if (format === 'xrechnung' || format === 'xrechnung-cii') {
        // BR-DE-15: la referencia del comprador (Leitweg-ID en el sector público).
        if (!inv.buyerReference) {
            out.push(p('buyer_reference', 'XRechnung pide la referencia del comprador (Leitweg-ID si es administración pública). Agrégala en el cliente o en la factura.', 'XRechnung requires the buyer reference (Leitweg-ID for public bodies). Add it on the client or on the invoice.', 'cliente'));
        }
        // BR-DE-2, -5, -6, -7: contacto del vendedor con nombre, teléfono y correo.
        if (!inv.seller.contact?.name || !inv.seller.contact?.phone || !inv.seller.contact?.email) {
            out.push(p('seller_contact', 'XRechnung pide un contacto del emisor con nombre, teléfono y correo. Complétalo en Ajustes › Datos fiscales.', 'XRechnung requires an issuer contact with name, phone and email. Complete it in Settings › Tax profile.', 'fiscal'));
        } else if ((inv.seller.contact.phone.match(/\d/g) || []).length < 3) {
            out.push(p('seller_phone', 'El teléfono del emisor necesita al menos tres dígitos.', 'The issuer phone needs at least three digits.', 'fiscal'));
        }
        // BR-DE-8/9: ciudad y código postal del comprador.
        if (!inv.buyer.address.city || !inv.buyer.address.postalCode) {
            out.push(p('buyer_address', 'XRechnung pide la ciudad y el código postal del cliente.', "XRechnung requires the client's city and postal code.", 'cliente'));
        }
        // BR-DE-1: instrucciones de pago. Cord las da con la transferencia.
        if (inv.typeCode === '380' && !inv.paymentMeans) {
            out.push(p('iban', 'XRechnung pide cómo pagar: agrega tu IBAN en Ajustes › Cobros.', 'XRechnung requires payment instructions: add your IBAN in Settings › Payments.', 'cobros'));
        }
    }
    if (format === 'peppol') {
        // PEPPOL-EN16931-R003: referencia del comprador u orden de compra.
        if (!inv.buyerReference && !inv.purchaseOrder) {
            out.push(p('peppol_reference', 'Peppol pide la referencia del comprador o la orden de compra. Agrégala en la factura o en el cliente.', 'Peppol requires the buyer reference or the purchase order. Add it on the invoice or on the client.', 'factura'));
        }
        // PEPPOL-EN16931-R020 y R010: direcciones electrónicas de las dos partes.
        if (!inv.seller.electronicAddress || inv.seller.electronicAddress.scheme === 'EM') {
            out.push(p('seller_endpoint', 'Peppol pide tu identificador de participante (por ejemplo 0088 GLN o el NIF-IVA). Agrégalo en Ajustes › Datos fiscales.', 'Peppol requires your participant identifier (for example a 0088 GLN or your VAT number). Add it in Settings › Tax profile.', 'fiscal'));
        }
        if (!inv.buyer.electronicAddress || inv.buyer.electronicAddress.scheme === 'EM') {
            out.push(p('buyer_endpoint', 'Peppol pide el identificador de participante del cliente. Agrégalo en el cliente.', "Peppol requires the client's participant identifier. Add it on the client.", 'cliente'));
        }
        // DE-R-001: entre empresas alemanas, la factura lleva instrucciones de pago.
        if (inv.seller.address.country === 'DE' && inv.buyer.address.country === 'DE' && !inv.paymentMeans) {
            out.push(p('iban', 'Peppol pide, entre empresas alemanas, cómo pagar: agrega tu IBAN en Ajustes › Cobros.', 'Between German companies Peppol requires payment instructions: add your IBAN in Settings › Payments.', 'cobros'));
        }
    }
    return out;
}

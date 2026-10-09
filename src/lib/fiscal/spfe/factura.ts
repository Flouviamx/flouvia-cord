// Factura electrónica de la solución pública de la AEAT (SPFE): UBL 2.5 con el
// contenido del Anexo I de la Orden HAC/1028/2026.
//
// Cord envía la ORIGINAL por la SPFE como medio de interconexión (Orden, art.
// 5.2): la factura queda a disposición del destinatario —o de la plataforma
// privada que él eligió, que la recupera de la SPFE (RD 238/2026, art. 8.2;
// Orden, art. 9)— y de la Administración, sin copia fiel (Orden, art. 3.4; RD,
// art. 11.9). Por eso `CopyIndicator` va en false.
//
// Igual que el resto de la factura electrónica, sale SOLO del snapshot
// congelado al emitir y con los importes comprobados al céntimo:
// `assessEInvoice` (einvoice/model.ts) arma las partes, las líneas, el
// desglose por categoría y los descuentos de documento, y falla cerrado si algo
// no cuadra. Aquí se añade lo que el Anexo I pide sobre EN 16931:
//
//   - BT-23 y BT-24 con los valores fijos de la AEAT;
//   - el NIF como identificador fiscal (TaxScheme LOC, schemeID FC: BT-32 del
//     vendedor y BT-47 del comprador, rutas literales del anexo), con BT-30;
//   - la clave de régimen de cada línea (BG-32 REGI, listas L3A/L3B/L3C) y el
//     impuesto nacional en cbc:ValueQualifier (BT-ES-24);
//   - el QR de VERI*FACTU (BG-24 QR FISCAL) si la factura lo lleva;
//   - la rectificativa como tipo 384 con RECT:TIPO y RECT:MODALIDAD (L2.A y
//     L2.B), por diferencias y en negativo, igual que su registro R1 "I" en
//     Verifactu y su Facturae;
//   - la fecha efectiva de pago (BT-ES-2) cuando la factura quedó pagada al
//     expedirse: así el destinatario no tiene que comunicar el pago (Orden,
//     art. 7.4).
//
// Lo que el anexo no fija y la AEAT no publicó (calificadores de L7/L8/L10,
// retenciones en cac:CollectionInvoiceLine) está en PENDIENTES_AEAT: el
// calificador se omite y una factura con retención falla cerrado. El XML se
// valida contra el XSD oficial de UBL 2.5 en `scripts/spfe-check.mjs`; el
// schematron de la AEAT todavía no existe.

import type { FiscalParty } from '../index';
import { ES_PROVINCES, spainTaxTerritory } from '../../countries';
import { checkTaxId } from '../../../../packages/elements/src/fiscal/tax-id';
import { EXEMPTION_INFO } from '../exemption';
import { assessEInvoice, calendarDay, isoDayIn, type EInvoiceProblem, type En16931Invoice, type EnLine, type VatCategory } from '../einvoice/model';
import type { FacturaeSource } from '../einvoice/facturae';
import { amount, decimal, el, group, percent } from '../einvoice/xml';
import {
    SPFE_CATEGORIAS, SPFE_DOC_QR, SPFE_DOC_RECT_MODALIDAD, SPFE_DOC_RECT_TIPO, SPFE_ESPECIFICACION, SPFE_PROCESO,
    SPFE_PROPIEDAD_REGIMEN, SPFE_PROVINCIAS_FORALES, SPFE_TIPOS_RECTIFICATIVA,
    type SpfeImpuesto, type SpfeTipoRectificativa,
} from './normativa';

export const NS_INVOICE = 'urn:oasis:names:specification:ubl:schema:xsd:Invoice-2';
export const NS_CAC = 'urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2';
export const NS_CBC = 'urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2';

export interface SpfeSource extends FacturaeSource {
    /** URL del QR de VERI*FACTU de la factura (`provider_data.verifactu.qrUrl`), si tiene registro. */
    qrUrl?: string | null;
    /** Tipo con que Verifactu registró la rectificativa (`provider_data.verifactu.tipoFactura`). */
    tipoRectificativa?: string | null;
    /** aaaa-mm-dd del pago que dejó la factura pagada, si ya lo estaba al expedirse (BT-ES-2). */
    pagadaEl?: string | null;
}

/** Código único de la factura (Orden, art. 6; RD 238/2026, art. 7.5). */
export interface SpfeCodigo {
    /** NIF del emisor, sin prefijo de país. */
    nifEmisor: string;
    /** Serie y número (BT-1). */
    numero: string;
    /** Fecha de expedición, aaaa-mm-dd (BT-2). */
    fecha: string;
}

/**
 * Llave interna del código único. El anexo define los TRES campos pero no una
 * cadena concatenada con separadores: esta llave es de Cord (idempotencia y
 * emparejamiento de respuestas), no un valor que viaje a la AEAT.
 */
export function claveCodigo(c: SpfeCodigo): string {
    return `${c.nifEmisor}|${c.numero}|${c.fecha}`;
}

export interface SpfeResumen {
    tipoFactura: '380' | '384';
    nombreEmisor: string;
    total: number;
    moneda: string;
    vencimiento: string | null;
    /** La factura declara su propio pago (BT-ES-2): el cobro no se comunica aparte. */
    pagadaEl: string | null;
}

export interface SpfeAssessment {
    xml: string | null;
    problems: EInvoiceProblem[];
    codigo: SpfeCodigo | null;
    resumen: SpfeResumen | null;
}

const p = (code: string, es: string, en: string, fix?: EInvoiceProblem['fix']): EInvoiceProblem => ({ code, es, en, ...(fix ? { fix } : {}) });
const clean = (v: unknown) => String(v ?? '').trim();
const cents = (n: number) => Math.round((Number(n) + Number.EPSILON) * 100);

/**
 * Problemas que dicen "esta factura no va por la SPFE", no "falta algo": no se
 * muestran como pendientes. Las tres primeras son de `assessEInvoice`.
 */
export const SPFE_NO_APLICA = new Set([
    'not_issued', 'void', 'test_document', 'proforma', 'document_type',
    'spfe_emisor_es', 'spfe_fuera_de_ambito', 'spfe_simplificada',
]);

/** Provincia: nombre a partir del código INE guardado (35, 28…) o el texto tal cual. */
export function provinciaDe(region: unknown): string {
    const raw = clean(region);
    const code = /^\d{1,2}$/.test(raw) ? raw.padStart(2, '0') : '';
    return (code ? ES_PROVINCES.find((x) => x.code === code)?.name : undefined) ?? raw;
}

function codigoProvincia(region: unknown): string {
    const raw = clean(region);
    if (/^\d{1,2}$/.test(raw)) return raw.padStart(2, '0');
    const name = raw.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    const found = ES_PROVINCES.find((x) => x.name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase() === name);
    return found?.code ?? '';
}

/** Domicilio en España con lo que el Anexo I exige (BT-35/50, municipio, código postal y provincia). */
function direccionCompleta(party: FiscalParty | undefined): boolean {
    const a = party?.address;
    return !!clean(a?.line1) && !!clean(a?.city) && /^\d{5}$/.test(clean(a?.postalCode)) && !!provinciaDe(a?.region);
}

const IMPUESTO: Record<'iva' | 'igic' | 'ipsi', SpfeImpuesto> = { iva: 'IVA', igic: 'IGIC', ipsi: 'IPSI' };

/**
 * Clave de régimen de una línea (L3A/L3B/L3C). Régimen general (01) salvo la
 * exportación del IVA (02), con el mismo criterio que el registro de Verifactu
 * (`verifactu/desglose.ts`: E2 y E3 van con la clave 02). Cord no lleva los
 * regímenes especiales (bienes usados, agencias de viajes, criterio de caja…).
 */
function claveRegimen(line: { exemptionReason?: string }, impuesto: SpfeImpuesto): string {
    const causa = clean(line.exemptionReason).toUpperCase();
    return impuesto === 'IVA' && (causa === 'E2' || causa === 'E3') ? '02' : '01';
}

const DESCRIPCION_RECT: Record<SpfeTipoRectificativa, string> = {
    R1: 'Factura rectificativa (error fundado en derecho y art. 80 Uno, Dos y Seis LIVA)',
    R2: 'Factura rectificativa (art. 80.3 LIVA)',
    R3: 'Factura rectificativa (art. 80.4 LIVA)',
    R4: 'Factura rectificativa (resto)',
};

/**
 * Arma la factura de la SPFE y dice qué falta. Puro: sin red, sin base de
 * datos, sin reloj (salvo el formato de fechas).
 */
export function assessSpfe(src: SpfeSource): SpfeAssessment {
    const problems: EInvoiceProblem[] = [];
    const issuerCountry = clean(src.issuer?.address?.countryCode || src.countryCode).toUpperCase();
    const buyerCountry = clean(src.recipient?.address?.countryCode).toUpperCase();

    // ── Ámbito (RD 238/2026, arts. 3 y 4; Orden, Anexo I) ──
    if (issuerCountry !== 'ES') {
        problems.push(p('spfe_emisor_es', 'La factura electrónica de la AEAT es para negocios establecidos en España.', 'The AEAT e-invoice is for businesses established in Spain.'));
    }
    if (SPFE_PROVINCIAS_FORALES.has(codigoProvincia(src.issuer?.address?.region))) {
        problems.push(p('spfe_foral', 'En el País Vasco y Navarra la solución pública depende de los acuerdos con las Haciendas Forales, que todavía no se han publicado.', 'In the Basque Country and Navarre the public solution depends on agreements with the regional tax authorities, which have not been published yet.', 'fiscal'));
    }
    const sellerCheck = checkTaxId('ES', clean(src.issuer?.taxId));
    if (issuerCountry === 'ES' && !sellerCheck.ok) {
        problems.push(p('spfe_nif_emisor', 'Falta el NIF de tu negocio o no es válido. Corrígelo en Ajustes › Perfil fiscal.', "Your business NIF is missing or not valid. Fix it in Settings › Tax profile.", 'fiscal'));
    }
    // La obligación y la SPFE son para clientes establecidos en España (art. 3),
    // y la SPFE solo admite la factura con el NIF del destinatario bien
    // informado (art. 11.3). Fuera de España no aplica; en España sin NIF es un
    // dato por completar.
    const buyerCheck = buyerCountry === 'ES' ? checkTaxId('ES', clean(src.recipient?.taxId)) : null;
    if (buyerCountry && buyerCountry !== 'ES') {
        problems.push(p('spfe_fuera_de_ambito', 'El cliente no está establecido en España: esta factura no va por la solución pública de la AEAT.', 'The client is not established in Spain: this invoice does not go through the AEAT public solution.'));
    } else if (!buyerCheck?.ok) {
        problems.push(p('spfe_nif_cliente', 'Falta el NIF del cliente o no es válido. La AEAT solo admite la factura con el NIF de las dos partes.', "The client's NIF is missing or not valid. The AEAT only accepts the invoice with both parties' NIF.", 'cliente'));
    }
    if (issuerCountry === 'ES' && !direccionCompleta(src.issuer)) {
        problems.push(p('spfe_direccion_emisor', 'Completa el domicilio fiscal de tu negocio: calle y número, municipio, código postal de cinco dígitos y provincia.', "Complete your business address: street and number, town, five-digit postal code and province.", 'fiscal'));
    }
    if (buyerCountry === 'ES' && !direccionCompleta(src.recipient)) {
        problems.push(p('spfe_direccion_cliente', 'Completa el domicilio del cliente: calle y número, municipio, código postal de cinco dígitos y provincia.', "Complete the client's address: street and number, town, five-digit postal code and province.", 'cliente'));
    }

    // ── El modelo EN 16931 de la misma factura ──
    const assessment = assessEInvoice(src);
    for (const prob of assessment.problems) {
        if (prob.code === 'issuer_not_eu') continue;
        if (prob.code === 'withholding') {
            // PENDIENTES_AEAT 'retenciones': el anexo define el grupo RETENCIONES
            // pero no su correspondencia completa en UBL 2.5.
            problems.push(p('spfe_retenciones', 'La AEAT todavía no publicó cómo se declaran las retenciones (IRPF) en su formato, así que esta factura no se puede enviar por la solución pública. Descárgala como Facturae, que sí las declara.', 'The AEAT has not yet published how withholdings (IRPF) are declared in its format, so this invoice cannot be sent through the public solution. Download it as Facturae, which does declare them.'));
            continue;
        }
        if (!problems.some((x) => x.code === prob.code)) problems.push(prob);
    }
    const inv = assessment.invoice;

    // ── Tipo de documento ──
    const isCredit = !!src.creditNoteOf || inv?.typeCode === '381';
    let tipoRect: SpfeTipoRectificativa | null = null;
    if (isCredit) {
        const declarado = clean(src.tipoRectificativa).toUpperCase();
        if (declarado === 'R5') {
            problems.push(p('spfe_simplificada', 'Rectifica una factura simplificada, que no entra en la factura electrónica entre empresas.', 'It corrects a simplified invoice, which is outside mandatory e-invoicing between businesses.'));
        } else {
            // Mismo tipo que su registro de Verifactu; sin registro, R1 (el que
            // Cord usa para toda nota de crédito, art. 80 Uno y Dos LIVA).
            tipoRect = (SPFE_TIPOS_RECTIFICATIVA as readonly string[]).includes(declarado) ? declarado as SpfeTipoRectificativa : 'R1';
        }
        if (!src.creditNoteOf?.number || !src.creditNoteOf.issuedAt) {
            problems.push(p('spfe_rectificada', 'La nota de crédito no identifica la factura que rectifica (número y fecha).', 'The credit note does not identify the invoice it corrects (number and date).'));
        }
    }

    // ── Categorías admitidas (L4) ──
    if (inv && inv.lines.some((l) => !(SPFE_CATEGORIAS as readonly string[]).includes(l.category))) {
        problems.push(p('spfe_categoria', 'Un concepto es una entrega intracomunitaria, que no va por la solución pública de la AEAT (es para clientes establecidos en España).', 'A line is an intra-EU supply, which does not go through the AEAT public solution (it is for clients established in Spain).', 'impuestos'));
    }

    // ── Divisa: con otra divisa, la cuota en euros (BT-6 y BT-111) ──
    const moneda = clean(src.currency).toUpperCase();
    if (inv && moneda !== 'EUR' && (inv.taxCurrency !== 'EUR' || inv.totals.taxInAccounting === undefined)) {
        problems.push(p('spfe_divisa', 'En otra divisa, la AEAT pide la cuota del IVA también en euros: la factura necesita el euro como divisa contable y su tipo de cambio.', 'In another currency the AEAT also requires the VAT amount in euros: the invoice needs the euro as its accounting currency and its exchange rate.', 'factura'));
    }

    if (problems.length || !inv || !sellerCheck.ok || !buyerCheck?.ok) {
        return { xml: null, problems, codigo: null, resumen: null };
    }

    const territory = spainTaxTerritory(src.issuer?.address?.region);
    const impuesto = IMPUESTO[territory];
    const nifEmisor = sellerCheck.normalized;
    const nifCliente = buyerCheck.normalized;
    const issueDate = inv.issueDate;

    // ── Fecha efectiva de pago (BT-ES-2; Orden, art. 7.4) ──
    // Solo si el pago fue anterior o igual a la expedición y no anterior a la
    // operación ("necesariamente coincidente o posterior a la fecha de
    // realización de las operaciones"). Una nota de crédito no la lleva.
    const serviceStart = calendarDay(src.serviceDate);
    const serviceEnd = calendarDay(src.serviceDateEnd);
    const operacion = serviceEnd ?? serviceStart ?? issueDate;
    const pagadaEl = !isCredit && src.pagadaEl && /^\d{4}-\d{2}-\d{2}$/.test(src.pagadaEl)
        && src.pagadaEl <= issueDate && src.pagadaEl >= operacion ? src.pagadaEl : null;

    const xml = serializeSpfe(inv, {
        isCredit, tipoRect, impuesto, nifEmisor, nifCliente, territory, pagadaEl,
        qrUrl: clean(src.qrUrl) || null,
        taxPointDate: serviceStart && !serviceEnd && serviceStart !== issueDate ? serviceStart : null,
        lineCausas: (Array.isArray(src.lines) ? src.lines : []).map((l) => clean(l.exemptionReason).toUpperCase()),
        sellerPhone: clean(src.issuer?.phone), sellerEmail: clean(src.issuer?.email),
        buyerPhone: clean(src.recipient?.phone), buyerEmail: clean(src.recipient?.email),
        sellerRegion: src.issuer?.address?.region, buyerRegion: src.recipient?.address?.region,
    });
    return {
        xml,
        problems,
        codigo: { nifEmisor, numero: inv.number, fecha: issueDate },
        resumen: {
            tipoFactura: isCredit ? '384' : '380',
            nombreEmisor: inv.seller.name,
            total: (isCredit ? -1 : 1) * cents(src.total) / 100,
            moneda,
            vencimiento: inv.dueDate ?? null,
            pagadaEl,
        },
    };
}

interface SerializeOptions {
    isCredit: boolean;
    tipoRect: SpfeTipoRectificativa | null;
    impuesto: SpfeImpuesto;
    territory: 'iva' | 'igic' | 'ipsi';
    nifEmisor: string;
    nifCliente: string;
    pagadaEl: string | null;
    qrUrl: string | null;
    taxPointDate: string | null;
    lineCausas: string[];
    sellerPhone: string;
    sellerEmail: string;
    buyerPhone: string;
    buyerEmail: string;
    sellerRegion: unknown;
    buyerRegion: unknown;
}

/** NIF como identificador fiscal: TaxScheme LOC y schemeID FC (Anexo I, BT-32 y BT-47). */
const nifLocal = (nif: string) => group('cac:PartyTaxScheme', [
    el('cbc:CompanyID', nif, { schemeID: 'FC' }),
    group('cac:TaxScheme', [el('cbc:ID', 'LOC')]),
]);

function address(a: En16931Invoice['seller']['address'], region: unknown): string {
    return group('cac:PostalAddress', [
        el('cbc:StreetName', a.line1),
        el('cbc:AdditionalStreetName', a.line2),
        el('cbc:CityName', a.city),
        el('cbc:PostalZone', a.postalCode),
        el('cbc:CountrySubentity', a.country === 'ES' ? provinciaDe(region) : a.region),
        group('cac:Country', [el('cbc:IdentificationCode', a.country)]),
    ]);
}

function taxCategory(tag: string, category: VatCategory, rate: number, opts: { breakdown?: boolean; code?: string; text?: string } = {}): string {
    return group(tag, [
        el('cbc:ID', category),
        // BT-119 es obligatorio en cada grupo del desglose (1..1), también en
        // 0; en la línea (BT-152, 0..1) la categoría O no lleva tipo (BR-O-05).
        category === 'O' && !opts.breakdown ? '' : el('cbc:Percent', percent(rate / 100)),
        el('cbc:TaxExemptionReasonCode', opts.code),
        el('cbc:TaxExemptionReason', opts.text),
        group('cac:TaxScheme', [el('cbc:ID', 'VAT')]),
    ]);
}

/**
 * UBL 2.5 Invoice, en el orden de la <xs:sequence> de UBL-Invoice-2.5.xsd.
 * Una rectificativa por diferencias va en negativo: cantidades e importes con
 * signo, precios en positivo (BR-27: el precio no puede ser negativo).
 */
export function serializeSpfe(inv: En16931Invoice, o: SerializeOptions): string {
    const sign = o.isCredit ? -1 : 1;
    const cur = inv.currency;
    const m = (tag: string, n: number, currency = cur) => el(tag, amount(n), { currencyID: currency });
    const s = (n: number) => sign * n;

    const pagada = !!o.pagadaEl;
    const docRefs: string[] = [];
    if (o.qrUrl) {
        docRefs.push(group('cac:AdditionalDocumentReference', [
            el('cbc:ID', SPFE_DOC_QR),
            el('cbc:UUID', o.qrUrl),
            el('cbc:DocumentDescription', 'VERIFACTU'),
        ]));
    }
    if (o.isCredit && o.tipoRect) {
        docRefs.push(group('cac:AdditionalDocumentReference', [
            el('cbc:ID', SPFE_DOC_RECT_TIPO),
            el('cbc:DocumentTypeCode', o.tipoRect),
            el('cbc:DocumentDescription', DESCRIPCION_RECT[o.tipoRect]),
        ]));
        docRefs.push(group('cac:AdditionalDocumentReference', [
            el('cbc:ID', SPFE_DOC_RECT_MODALIDAD),
            el('cbc:DocumentTypeCode', 'I'),
            el('cbc:DocumentDescription', 'Rectificativa por diferencias'),
        ]));
    }

    const seller = inv.seller;
    const buyer = inv.buyer;
    const head = [
        el('cbc:CustomizationID', SPFE_ESPECIFICACION),
        el('cbc:ProfileID', SPFE_PROCESO),
        el('cbc:ID', inv.number),
        // BT-ES-1: original. Cord no remite copias fieles: usa la SPFE como
        // medio de interconexión (Orden, arts. 3.4 y 5.2).
        el('cbc:CopyIndicator', 'false'),
        el('cbc:IssueDate', inv.issueDate),
        o.isCredit ? '' : el('cbc:DueDate', inv.dueDate),
        el('cbc:InvoiceTypeCode', o.isCredit ? '384' : '380'),
        ...inv.notes.map((n) => el('cbc:Note', n.text)),
        el('cbc:TaxPointDate', o.taxPointDate),
        el('cbc:DocumentCurrencyCode', cur),
        el('cbc:TaxCurrencyCode', inv.taxCurrency),
        el('cbc:BuyerReference', inv.buyerReference),
        inv.period ? group('cac:InvoicePeriod', [el('cbc:StartDate', inv.period.start), el('cbc:EndDate', inv.period.end)]) : '',
        inv.purchaseOrder ? group('cac:OrderReference', [el('cbc:ID', inv.purchaseOrder)]) : '',
        inv.preceding ? group('cac:BillingReference', [group('cac:InvoiceDocumentReference', [
            el('cbc:ID', inv.preceding.number),
            el('cbc:IssueDate', inv.preceding.issueDate),
        ])]) : '',
        ...docRefs,
        group('cac:AccountingSupplierParty', [group('cac:Party', [
            address(seller.address, o.sellerRegion),
            // BT-31 (NIF-IVA con prefijo ES) solo en el territorio del IVA:
            // Canarias, Ceuta y Melilla están fuera (Directiva 2006/112/CE,
            // art. 6). BT-32 (el NIF) siempre, con BT-30, que el anexo exige
            // cuando BT-32 va informado.
            o.territory === 'iva' ? group('cac:PartyTaxScheme', [el('cbc:CompanyID', `ES${o.nifEmisor}`), group('cac:TaxScheme', [el('cbc:ID', 'VAT')])]) : '',
            nifLocal(o.nifEmisor),
            group('cac:PartyLegalEntity', [el('cbc:RegistrationName', seller.name), el('cbc:CompanyID', o.nifEmisor)]),
            group('cac:Contact', [el('cbc:Telephone', o.sellerPhone), el('cbc:ElectronicMail', o.sellerEmail)]),
        ])]),
        group('cac:AccountingCustomerParty', [group('cac:Party', [
            address(buyer.address, o.buyerRegion),
            nifLocal(o.nifCliente),
            group('cac:PartyLegalEntity', [el('cbc:RegistrationName', buyer.name)]),
            group('cac:Contact', [el('cbc:Telephone', o.buyerPhone), el('cbc:ElectronicMail', o.buyerEmail)]),
        ])]),
        // BG-16: solo con la transferencia (BT-81 y BT-84 son lo que pide el
        // anexo). Una rectificativa no lleva instrucciones de pago.
        !o.isCredit && inv.paymentMeans?.iban ? group('cac:PaymentMeans', [
            el('cbc:PaymentMeansCode', inv.paymentMeans.code),
            group('cac:PayeeFinancialAccount', [el('cbc:ID', inv.paymentMeans.iban)]),
        ]) : '',
        !o.isCredit && inv.paymentTerms ? group('cac:PaymentTerms', [el('cbc:Note', inv.paymentTerms)]) : '',
        pagada ? group('cac:PrepaidPayment', [el('cbc:PaidDate', o.pagadaEl)]) : '',
        ...inv.allowances.map((a) => group('cac:AllowanceCharge', [
            el('cbc:ChargeIndicator', 'false'),
            el('cbc:AllowanceChargeReason', a.reason),
            m('cbc:Amount', s(a.amount)),
            taxCategory('cac:TaxCategory', a.category, a.rate),
        ])),
        group('cac:TaxTotal', [
            m('cbc:TaxAmount', s(inv.totals.tax)),
            ...inv.vat.map((v) => group('cac:TaxSubtotal', [
                m('cbc:TaxableAmount', s(v.taxable)),
                m('cbc:TaxAmount', s(v.tax)),
                taxCategory('cac:TaxCategory', v.category, v.rate, { breakdown: true, code: v.exemptionCode, text: v.exemptionText }),
            ])),
        ]),
        // BT-111: con otra divisa, la cuota en euros en un TaxTotal sin desglose.
        inv.taxCurrency && inv.totals.taxInAccounting !== undefined
            ? group('cac:TaxTotal', [m('cbc:TaxAmount', s(inv.totals.taxInAccounting), inv.taxCurrency)]) : '',
        group('cac:LegalMonetaryTotal', [
            m('cbc:LineExtensionAmount', s(inv.totals.lineNet)),
            m('cbc:TaxExclusiveAmount', s(inv.totals.taxExclusive)),
            m('cbc:TaxInclusiveAmount', s(inv.totals.taxInclusive)),
            inv.totals.allowances > 0 ? m('cbc:AllowanceTotalAmount', s(inv.totals.allowances)) : '',
            // BT-113 y BT-115: pagada al expedirse, el total a pagar es cero
            // ("El importe es cero en el caso de una factura pagada en su totalidad").
            pagada ? m('cbc:PrepaidAmount', inv.totals.taxInclusive) : '',
            m('cbc:PayableAmount', pagada ? 0 : s(inv.totals.payable)),
        ]),
    ];

    const lines = inv.lines.map((l: EnLine, i: number) => group('cac:InvoiceLine', [
        el('cbc:ID', l.id),
        el('cbc:InvoicedQuantity', decimal(s(l.quantity), 6), { unitCode: l.unitCode }),
        m('cbc:LineExtensionAmount', s(l.netAmount)),
        group('cac:Item', [
            el('cbc:Name', l.name),
            taxCategory('cac:ClassifiedTaxCategory', l.category, l.rate),
            // BG-32 CLAVE DE RÉGIMEN (1..2): BT-160 = REGI (L8), BT-161 = la clave
            // (L3A/L3B/L3C) y BT-ES-24 = el impuesto en cbc:ValueQualifier.
            group('cac:AdditionalItemProperty', [
                el('cbc:Name', SPFE_PROPIEDAD_REGIMEN),
                el('cbc:Value', claveRegimen({ exemptionReason: o.lineCausas[i] }, o.impuesto)),
                el('cbc:ValueQualifier', o.impuesto),
            ]),
        ]),
        group('cac:Price', [el('cbc:PriceAmount', decimal(l.netPrice, 10), { currencyID: cur })]),
    ]));

    return '<?xml version="1.0" encoding="UTF-8"?>\n'
        + `<Invoice xmlns="${NS_INVOICE}" xmlns:cac="${NS_CAC}" xmlns:cbc="${NS_CBC}">`
        + head.join('') + lines.join('')
        + '</Invoice>\n';
}

/** Texto de la exención que la factura imprime para una causa de Verifactu (para pruebas y la vista). */
export function mencionExencion(causa: string): string | null {
    const c = clean(causa).toUpperCase() as keyof typeof EXEMPTION_INFO;
    return EXEMPTION_INFO[c]?.mencion ?? null;
}

/** Fecha de expedición en la zona del emisor (la del PDF y la del registro). */
export function fechaExpedicion(issuedAt: string | Date, timeZone?: string | null): string {
    return isoDayIn(issuedAt, timeZone);
}

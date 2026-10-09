// Facturae 3.2.2: la factura electrónica española.
//
// Es el formato de la factura a la Administración (FACe, Ley 25/2013) y una de
// las cuatro sintaxis que admite la factura electrónica entre empresas (Real
// Decreto 238/2026, art. 7.1). A diferencia de EN 16931, Facturae SÍ tiene
// dónde declarar una retención: `TaxesWithheld`, con el IRPF como TaxTypeCode
// 04, restado del total (`InvoiceTotal = TotalGrossAmountBeforeTaxes +
// TotalTaxOutputs − TotalTaxesWithheld`). También declara IGIC (03) e IPSI (02)
// con sus propios códigos.
//
// Igual que el resto de la factura electrónica, se arma SOLO con lo congelado
// al emitir y los totales se comprueban al céntimo contra el documento: no se
// recalcula ni se "arregla" nada.
//
// Fuentes primarias (oct 2026): el XSD oficial Facturaev3_2_2.xml y la
// "Descripción de los campos del formato 3.2.2" (facturae.gob.es, 06/06/2017).
//
// El XML sale ya en forma canónica (C14N 1.0 inclusiva: sin declaraciones
// redundantes, sin elementos vacíos autocerrados, texto escapado como lo
// escribe la canonicalización). Así la huella del documento que firma XAdES
// (`xades.ts`) se calcula sobre estos mismos bytes sin reinterpretarlos.

import type { FiscalLineItem, FiscalParty, FiscalRetencion } from '../index';
import { ES_PROVINCES, isEuCountry, spainTaxTerritory, toAlpha3 } from '../../countries';
import { checkTaxId } from '../../../../packages/elements/src/fiscal/tax-id';
import { nifIvaUE } from '../verifactu/validacion';
import { EXEMPTION_INFO, isExemptionReason, type ExemptionReason } from '../exemption';
import { ibanValido } from '../../payout-fields';
import { calendarDay, isoDayIn, unitPrice, type EInvoiceProblem, type EInvoiceSource } from './model';
import { amount, decimal } from './xml';
import { normalizeBic } from './codes';

export const FACTURAE_NS = 'http://www.facturae.gob.es/formato/Versiones/Facturaev3_2_2.xml';
export const DS_NS = 'http://www.w3.org/2000/09/xmldsig#';

/** Etiqueta raíz con sus dos espacios de nombres, en el orden de C14N (ds < fe). */
export const FACTURAE_ROOT_OPEN = `<fe:Facturae xmlns:ds="${DS_NS}" xmlns:fe="${FACTURAE_NS}">`;
export const FACTURAE_ROOT_CLOSE = '</fe:Facturae>';

const p = (code: string, es: string, en: string, fix?: EInvoiceProblem['fix']): EInvoiceProblem => ({ code, es, en, ...(fix ? { fix } : {}) });
const cents = (n: number) => Math.round((Number(n) + Number.EPSILON) * 100);
const clean = (v: unknown) => String(v ?? '').trim();

// ── XML canónico ─────────────────────────────────────────────────────────────

const XML_INVALID = /[^\u0009\u000A\u000D -퟿-�\u{10000}-\u{10FFFF}]/gu;

/** Texto con el escape de C14N: &, < y > (las comillas van tal cual). */
function text(value: unknown, max?: number): string {
    let v = String(value ?? '').replace(XML_INVALID, '').replace(/\r\n?/g, '\n').trim();
    if (max) v = Array.from(v).slice(0, max).join('');
    return v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function e(name: string, value: unknown, max?: number): string {
    if (value === undefined || value === null) return '';
    const t = text(value, max);
    return t ? `<${name}>${t}</${name}>` : '';
}

function g(name: string, children: Array<string | false | null | undefined>): string {
    const body = children.filter(Boolean).join('');
    return body ? `<${name}>${body}</${name}>` : '';
}

const money = (n: number) => amount(n);
const amountType = (name: string, n: number) => g(name, [e('TotalAmount', money(n))]);
/** Tipo impositivo con dos decimales: válido en 3.2 ("siempre con 2") y en 3.2.x ("hasta 8"). */
const rate = (pct: number) => money(pct);

// ── Partes ───────────────────────────────────────────────────────────────────

interface FacturaeParty {
    personType: 'F' | 'J';
    residence: 'R' | 'U' | 'E';
    taxNumber: string;
    name: string;
    address: string;
    contact?: { phone?: string; email?: string; person?: string };
}

/** Provincia: el código INE guardado (35, 38…) o el texto tal cual, hasta 20 caracteres. */
function provinceName(region: unknown, fallback: string): string {
    const raw = clean(region);
    const code = /^\d{1,2}$/.test(raw) ? raw.padStart(2, '0') : '';
    const byCode = code ? ES_PROVINCES.find((x) => x.code === code)?.name : undefined;
    const name = byCode ?? (raw || fallback);
    // "Santa Cruz de Tenerife" no cabe en TextMax20.
    return name === 'Santa Cruz de Tenerife' ? 'S.C. de Tenerife' : name;
}

function addressXml(party: FiscalParty): string | null {
    const a = party.address;
    const cc = clean(a?.countryCode).toUpperCase();
    const street = [clean(a?.line1), clean(a?.line2)].filter(Boolean).join(', ');
    const city = clean(a?.city);
    if (!street || !city) return null;
    if (cc === 'ES') {
        const cp = clean(a?.postalCode);
        if (!/^\d{5}$/.test(cp)) return null;
        return g('AddressInSpain', [
            e('Address', street, 80), e('PostCode', cp), e('Town', city, 50),
            e('Province', provinceName(a?.region, city), 20), e('CountryCode', 'ESP'),
        ]);
    }
    const alpha3 = toAlpha3(cc);
    if (!alpha3) return null;
    return g('OverseasAddress', [
        e('Address', street, 80),
        e('PostCodeAndTown', [clean(a?.postalCode), city].filter(Boolean).join(' '), 50),
        e('Province', clean(a?.region) || city, 20),
        e('CountryCode', alpha3),
    ]);
}

/**
 * Persona física: Facturae pide nombre y primer apellido por separado y Cord
 * guarda el nombre completo. Se reparte en el primer espacio: la concatenación
 * reproduce el nombre exacto, que es lo que la factura identifica.
 */
function individualName(full: string): { name: string; surname: string } {
    const parts = full.split(/\s+/).filter(Boolean);
    if (parts.length < 2) return { name: full, surname: full };
    return { name: parts[0], surname: parts.slice(1).join(' ') };
}

function partyXml(tag: 'SellerParty' | 'BuyerParty', party: FacturaeParty, address: string): string {
    const contact = party.contact && (party.contact.phone || party.contact.email || party.contact.person)
        ? g('ContactDetails', [
            e('Telephone', party.contact.phone?.replace(/[^\d+]/g, ''), 15),
            e('ElectronicMail', party.contact.email, 60),
            e('ContactPersons', party.contact.person, 40),
        ])
        : '';
    const id = g('TaxIdentification', [
        e('PersonTypeCode', party.personType), e('ResidenceTypeCode', party.residence), e('TaxIdentificationNumber', party.taxNumber, 30),
    ]);
    if (party.personType === 'F') {
        const n = individualName(party.name);
        return g(tag, [id, g('Individual', [e('Name', n.name, 40), e('FirstSurname', n.surname, 40), address, contact])]);
    }
    return g(tag, [id, g('LegalEntity', [e('CorporateName', party.name, 80), address, contact])]);
}

// ── Impuestos de cada concepto ───────────────────────────────────────────────

/** TaxTypeCode: 01 IVA, 02 IPSI, 03 IGIC (lista TaxTypeCodeType del XSD). */
type TaxCode = '01' | '02' | '03';

interface LineTax {
    code: TaxCode;
    /** Porcentaje. */
    pct: number;
    /** 01 sujeta y exenta, 02 no sujeta (SpecialTaxableEventCodeType). */
    special?: { code: '01' | '02'; reason: string };
    reverseCharge?: boolean;
}

/**
 * Calificación de un concepto al 0 %, con el mismo criterio que Verifactu
 * (`verifactu/desglose.ts`): la causa explícita manda; sin ella, cliente de
 * otro Estado miembro con NIF-IVA o fuera de la UE → no sujeta por reglas de
 * localización (N2); en España → exenta (E6). El motivo va precedido del
 * código del impuesto, como pide la descripción de SpecialTaxableEventReason.
 */
function zeroRatedIva(cause: ExemptionReason | null, ctx: { buyerCountry: string; buyerVat: boolean }): LineTax {
    const c: ExemptionReason = cause
        ?? (ctx.buyerCountry !== 'ES' && (!isEuCountry(ctx.buyerCountry) || ctx.buyerVat) ? 'N2' : 'E6');
    if (c === 'S2') return { code: '01', pct: 0, reverseCharge: true };
    const intraEu = isEuCountry(ctx.buyerCountry) && ctx.buyerCountry !== 'ES' && ctx.buyerVat;
    const reason = `01 ${EXEMPTION_INFO[c].mencion}`;
    return {
        code: '01',
        pct: 0,
        special: { code: c === 'N1' || c === 'N2' ? '02' : '01', reason },
        // Servicio a un empresario de otro Estado miembro: además de no sujeto,
        // la factura dice "Inversión del sujeto pasivo" (RD 1619/2012, art. 6.1.m).
        reverseCharge: (c === 'N2' || c === 'E5') && intraEu,
    };
}

// ── Ensamble ─────────────────────────────────────────────────────────────────

const CREDIT_TYPES = new Set(['commercial_credit_note', 'verifactu_credit_note', 'credit_note']);
const INVOICE_TYPES = new Set(['commercial_invoice', 'verifactu_invoice']);

/** Unidades de UN/ECE Rec. 20 → UnitOfMeasureType de Facturae. Lo demás, "05 Otros". */
const UNIT_CODES: Record<string, string> = {
    C62: '01', H87: '01', EA: '01', E48: '01', XUN: '01',
    HUR: '02', KGM: '03', LTR: '04', BX: '06', XBX: '06', BG: '10', XBG: '10', CLT: '15', CMT: '16',
    DZN: '18', GRM: '21', KMT: '22', MTR: '25', MMT: '26', PK: '28', XPK: '28', MTQ: '33', SEC: '34', WTT: '35', KWH: '36',
};

export interface FacturaeSource extends EInvoiceSource {
    /** `retenciones_snapshot` del documento: IRPF y similares. */
    retenciones?: FiscalRetencion[] | null;
}

export interface FacturaeAssessment {
    /** XML sin firmar (forma canónica), o null si no se puede generar. */
    xml: string | null;
    problems: EInvoiceProblem[];
}

/**
 * Retención → TaxTypeCode. España: el IRPF (04). Una retención que no lo sea
 * no se adivina: Facturae tiene códigos para IRNR (28) o Sociedades (29), y
 * Cord no sabe cuál es.
 */
function withheldCode(r: FiscalRetencion): '04' | null {
    const name = clean(r.nombre).toUpperCase();
    return r.tipo === 'ret_isr' || /IRPF/.test(name) ? '04' : null;
}

export function assessFacturae(src: FacturaeSource): FacturaeAssessment {
    const problems: EInvoiceProblem[] = [];
    const issuerCountry = clean(src.issuer?.address?.countryCode || src.countryCode).toUpperCase();
    const buyerCountry = clean(src.recipient?.address?.countryCode).toUpperCase();
    const isCredit = !!src.creditNoteOf || CREDIT_TYPES.has(src.documentType);
    const sign = isCredit ? -1 : 1;

    if (src.status && src.status !== 'issued') problems.push(p('not_issued', 'La factura todavía no está emitida.', 'The invoice has not been issued yet.', 'factura'));
    if (src.lifecycle === 'void') problems.push(p('void', 'Una factura anulada no genera factura electrónica.', 'A voided invoice does not produce an e-invoice.'));
    if (src.simulated) problems.push(p('test_document', 'Un documento de prueba no genera factura electrónica.', 'A test document does not produce an e-invoice.'));
    if (!INVOICE_TYPES.has(src.documentType) && !CREDIT_TYPES.has(src.documentType)) {
        problems.push(src.documentType === 'proforma'
            ? p('proforma', 'Una proforma no es una factura y no tiene versión electrónica.', 'A pro forma is not an invoice and has no e-invoice version.')
            : p('document_type', 'Este tipo de documento no tiene versión Facturae.', 'This document type has no Facturae version.'));
    }
    if (issuerCountry !== 'ES') problems.push(p('facturae_es_only', 'Facturae es el formato de factura electrónica de España: solo para emisores establecidos ahí.', 'Facturae is the Spanish e-invoice format: only for issuers established in Spain.'));
    if (clean(src.currency).toUpperCase() !== 'EUR') {
        problems.push(p('facturae_currency', 'Cord genera Facturae en euros. Esta factura está en otra divisa.', 'Cord generates Facturae in euros. This invoice is in another currency.'));
    }
    const number = clean(src.invoiceNumber);
    if (!number) problems.push(p('no_number', 'La factura no tiene folio.', 'The invoice has no number.'));
    else if (number.length > 20) problems.push(p('facturae_number', 'Facturae admite folios de hasta 20 caracteres.', 'Facturae accepts invoice numbers of up to 20 characters.', 'fiscal'));
    if (!src.issuedAt) problems.push(p('no_date', 'La factura no tiene fecha de emisión.', 'The invoice has no issue date.'));
    const lines: FiscalLineItem[] = Array.isArray(src.lines) ? src.lines : [];
    if (!lines.length) problems.push(p('no_lines', 'La factura no tiene conceptos.', 'The invoice has no lines.'));

    const territory = issuerCountry === 'ES' ? spainTaxTerritory(src.issuer?.address?.region) : 'iva';
    const territoryCode: TaxCode = territory === 'igic' ? '03' : territory === 'ipsi' ? '02' : '01';

    // ── Partes ──
    const sellerCheck = checkTaxId('ES', clean(src.issuer?.taxId));
    if (!sellerCheck.ok) problems.push(p('seller_vat', 'Falta el NIF del emisor o no es válido. Corrígelo en Ajustes › Perfil fiscal.', 'The issuer NIF is missing or not valid. Fix it in Settings › Tax profile.', 'fiscal'));
    const buyerRaw = clean(src.recipient?.taxId);
    const buyerIsEs = buyerCountry === 'ES';
    const buyerCheck = buyerIsEs ? checkTaxId('ES', buyerRaw) : null;
    const buyerEuVat = !buyerIsEs && isEuCountry(buyerCountry) ? nifIvaUE(buyerCountry, buyerRaw) : null;
    // Operación intracomunitaria: los dos NIF con el prefijo de su país
    // (descripción de TaxIdentificationNumber).
    const intraEu = !buyerIsEs && isEuCountry(buyerCountry) && !!buyerEuVat && territory === 'iva';
    let buyerNumber = '';
    if (buyerIsEs) {
        if (!buyerCheck?.ok) problems.push(p('facturae_buyer_id', 'Facturae exige el NIF del cliente. Agrégalo en el cliente.', "Facturae requires the client's tax ID. Add it on the client.", 'cliente'));
        else buyerNumber = buyerCheck.normalized;
    } else if (intraEu) {
        buyerNumber = buyerEuVat!;
    } else if (buyerRaw.replace(/\s+/g, '').length >= 3) {
        buyerNumber = buyerRaw.replace(/\s+/g, '').toUpperCase();
    } else {
        problems.push(p('facturae_buyer_id', 'Facturae exige el identificador fiscal del cliente. Agrégalo en el cliente.', "Facturae requires the client's tax identifier. Add it on the client.", 'cliente'));
    }
    const sellerAddress = addressXml(src.issuer || ({} as FiscalParty));
    if (!sellerAddress) problems.push(p('seller_address', 'Completa el domicilio fiscal del emisor (calle, ciudad y código postal de cinco dígitos).', "Complete the issuer's address (street, city and five-digit postal code).", 'fiscal'));
    const buyerAddress = addressXml(src.recipient || ({} as FiscalParty));
    if (!buyerAddress) problems.push(p('facturae_buyer_address', 'Facturae exige el domicilio completo del cliente (calle, ciudad, código postal y país).', "Facturae requires the client's full address (street, city, postal code and country).", 'cliente'));
    if (!clean(src.issuer?.legalName)) problems.push(p('seller_name', 'Falta la razón social del emisor.', 'The issuer legal name is missing.', 'fiscal'));
    if (!clean(src.recipient?.legalName)) problems.push(p('buyer_name', 'Falta el nombre del cliente.', 'The client name is missing.', 'cliente'));

    // ── Conceptos ──
    let linesOk = true;
    let territoryExemption = false;
    let reverseCharge = false;
    const lineXml: string[] = [];
    const outputs = new Map<string, { code: TaxCode; pct: number; base: number; tax: number }>();
    let sumBase = 0;
    let sumTax = 0;
    for (const line of lines) {
        const quantity = Number(line.quantity);
        const base = Number(line.subtotal);
        const discount = Math.max(0, Number(line.discount) || 0);
        const tax = Number(line.taxAmount);
        const fraction = Number(line.taxRate) || 0;
        if (!(quantity > 0) || !Number.isFinite(base) || base < 0 || !Number.isFinite(tax)) { linesOk = false; continue; }
        const cause = clean(line.exemptionReason).toUpperCase();
        let lt: LineTax;
        if (territory !== 'iva') {
            if (cause) territoryExemption = true;
            lt = { code: territoryCode, pct: Math.round(fraction * 1e8) / 1e6 };
        } else if (fraction > 0) {
            lt = { code: '01', pct: Math.round(fraction * 1e8) / 1e6 };
        } else {
            lt = zeroRatedIva(isExemptionReason(cause) ? cause : null, { buyerCountry, buyerVat: !!buyerEuVat || (buyerIsEs && !!buyerCheck?.ok) });
        }
        if (lt.pct === 0 && cents(tax) !== 0) linesOk = false;
        if (lt.reverseCharge) reverseCharge = true;
        const gross = Math.round((base + discount) * 100) / 100;
        sumBase += cents(base);
        sumTax += cents(tax);
        const key = `${lt.code}:${lt.pct}`;
        const o = outputs.get(key) ?? { code: lt.code, pct: lt.pct, base: 0, tax: 0 };
        o.base += cents(base);
        o.tax += cents(tax);
        outputs.set(key, o);
        lineXml.push(g('InvoiceLine', [
            e('ItemDescription', clean(line.description) || '—', 2500),
            e('Quantity', decimal(quantity, 6)),
            e('UnitOfMeasure', UNIT_CODES[clean(line.unitKey).toUpperCase()] ?? (clean(line.unitKey) ? '05' : '01')),
            e('UnitPriceWithoutTax', decimal(sign * unitPrice(gross, quantity), 8)),
            e('TotalCost', money(sign * gross)),
            discount > 0 ? g('DiscountsAndRebates', [g('Discount', [e('DiscountReason', 'Descuento'), e('DiscountAmount', money(sign * discount))])]) : '',
            e('GrossAmount', money(sign * base)),
            g('TaxesOutputs', [g('Tax', [
                e('TaxTypeCode', lt.code), e('TaxRate', rate(lt.pct)),
                amountType('TaxableBase', sign * base), amountType('TaxAmount', sign * tax),
            ])]),
            lt.special ? g('SpecialTaxableEvent', [e('SpecialTaxableEventCode', lt.special.code), e('SpecialTaxableEventReason', lt.special.reason, 2500)]) : '',
        ]));
    }
    if (territoryExemption) {
        problems.push(p('facturae_territory_exemption', 'Un concepto lleva una causa de exención del IVA, pero tu negocio tributa por IGIC o IPSI. Quita la causa del perfil exento: el concepto se declara con su tipo (también el 0 %).', 'A line carries a VAT exemption reason, but your business is under IGIC or IPSI. Remove the reason from the exempt profile: the line is declared with its rate (0% included).', 'impuestos'));
    }
    if (!linesOk) problems.push(p('lines_inconsistent', 'Los importes de los conceptos no cuadran entre sí; esta factura no puede representarse como factura electrónica.', 'The line amounts do not reconcile; this invoice cannot be represented as an e-invoice.'));

    // ── Retenciones (TaxesWithheld) ──
    const retenciones = Array.isArray(src.retenciones) ? src.retenciones.filter((r) => Number(r.monto) > 0) : [];
    const withheld: string[] = [];
    let sumWithheld = 0;
    for (const r of retenciones) {
        const code = withheldCode(r);
        if (!code) {
            problems.push(p('facturae_withholding_type', `La retención "${clean(r.nombre)}" no es de IRPF y Cord no sabe con qué código de Facturae declararla.`, `The withholding "${clean(r.nombre)}" is not IRPF and Cord does not know which Facturae code declares it.`, 'impuestos'));
            continue;
        }
        sumWithheld += cents(Number(r.monto));
        withheld.push(g('Tax', [
            e('TaxTypeCode', code), e('TaxRate', rate(Math.round(Number(r.tasa) * 1e8) / 1e6)),
            amountType('TaxableBase', sign * Number(r.base)), amountType('TaxAmount', sign * Number(r.monto)),
        ]));
    }

    // ── Totales: los del documento, comprobados al céntimo ──
    const retencionTotal = Number(src.retencionTotal) > 0 ? cents(Number(src.retencionTotal)) : 0;
    if (linesOk && lines.length && (sumBase !== cents(src.subtotal) || sumTax !== cents(src.taxTotal)
        || sumWithheld !== retencionTotal || cents(src.subtotal) + cents(src.taxTotal) - retencionTotal !== cents(src.total))) {
        problems.push(p('totals_mismatch', 'Los totales de esta factura no son la suma exacta de sus conceptos y retenciones. No se puede generar su factura electrónica sin cambiar importes.', 'The totals of this invoice are not the exact sum of its lines and withholdings. Its e-invoice cannot be generated without changing amounts.'));
    }

    // ── Rectificativa ──
    const original = src.creditNoteOf;
    if (isCredit && (!original?.number || !original.issuedAt)) {
        problems.push(p('facturae_credit_original', 'La nota de crédito no identifica la factura que rectifica.', 'The credit note does not identify the invoice it corrects.'));
    } else if (isCredit && original!.number.length > 20) {
        problems.push(p('facturae_number', 'Facturae admite folios de hasta 20 caracteres.', 'Facturae accepts invoice numbers of up to 20 characters.', 'fiscal'));
    }

    if (problems.length) return { xml: null, problems };

    // ── Documento ──
    const issueDate = isoDayIn(src.issuedAt!, src.timeZone);
    const total = sign * cents(src.total) / 100;
    const sellerNumber = sellerCheck.ok ? (intraEu ? `ES${sellerCheck.normalized}` : sellerCheck.normalized) : '';
    const seller: FacturaeParty = {
        personType: sellerCheck.ok && sellerCheck.kind === 'cif' ? 'J' : 'F',
        residence: 'R',
        taxNumber: sellerNumber,
        name: clean(src.issuer.legalName),
        address: sellerAddress!,
        contact: { phone: clean(src.issuer.phone), email: clean(src.issuer.email), person: clean(src.issuer.contactName) },
    };
    const buyer: FacturaeParty = {
        personType: buyerIsEs && buyerCheck?.ok && buyerCheck.kind !== 'cif' ? 'F' : 'J',
        residence: buyerIsEs ? 'R' : isEuCountry(buyerCountry) ? 'U' : 'E',
        taxNumber: buyerNumber,
        name: clean(src.recipient.legalName),
        address: buyerAddress!,
        contact: { email: clean(src.recipient.email), person: clean(src.recipient.contactName) },
    };

    const serviceStart = calendarDay(src.serviceDate);
    const serviceEnd = calendarDay(src.serviceDateEnd);
    const period = serviceStart && serviceEnd ? { start: serviceStart, end: serviceEnd } : null;
    const operationDate = !period && serviceStart && serviceStart !== issueDate ? serviceStart : null;
    const po = clean(src.purchaseOrder);
    const buyerRef = clean(src.buyerReference);
    const extraRefs = [
        po && po.length > 20 ? `Orden de compra: ${po}` : '',
        buyerRef && buyerRef.length > 20 ? `Referencia del comprador: ${buyerRef}` : '',
    ].filter(Boolean);

    let corrective = '';
    if (isCredit) {
        const origDay = isoDayIn(original!.issuedAt!, src.timeZone);
        const [y, m] = origDay.split('-').map(Number);
        const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
        corrective = g('Corrective', [
            e('InvoiceNumber', original!.number),
            // 16 "Base imponible": la nota de crédito de Cord reduce la base de
            // la factura original (por error o por las causas del art. 80 LIVA).
            e('ReasonCode', '16'), e('ReasonDescription', 'Base imponible'),
            g('TaxPeriod', [e('StartDate', `${origDay.slice(0, 7)}-01`), e('EndDate', `${origDay.slice(0, 7)}-${String(last).padStart(2, '0')}`)]),
            // 02 por diferencias: los importes de la rectificativa son la diferencia,
            // en negativo, igual que el registro R1 "I" de Verifactu.
            e('CorrectionMethod', '02'), e('CorrectionMethodDescription', 'Rectificación por diferencias'),
            e('AdditionalReasonDescription', src.notes, 2500),
            e('InvoiceIssueDate', origDay),
        ]);
    }

    const taxesOutputs = [...outputs.values()]
        .sort((a, b) => (a.code === b.code ? a.pct - b.pct : a.code < b.code ? -1 : 1))
        .map((o) => g('Tax', [
            e('TaxTypeCode', o.code), e('TaxRate', rate(o.pct)),
            amountType('TaxableBase', sign * o.base / 100), amountType('TaxAmount', sign * o.tax / 100),
        ]));

    const iban = clean(src.iban).replace(/\s+/g, '').toUpperCase();
    const bic = normalizeBic(src.bic);
    const payment = !isCredit && iban && ibanValido(iban)
        ? g('PaymentDetails', [g('Installment', [
            e('InstallmentDueDate', calendarDay(src.dueDate) ?? issueDate),
            e('InstallmentAmount', money(total)),
            e('PaymentMeans', '04'),
            g('AccountToBeCredited', [e('IBAN', iban), bic ? e('BIC', bic.length === 8 ? `${bic}XXX` : bic) : '']),
        ])])
        : '';

    const literals = reverseCharge ? g('LegalLiterals', [e('LegalReference', 'Inversión del sujeto pasivo', 250)]) : '';
    const additional = [clean(src.notes) && !isCredit ? clean(src.notes) : '', ...extraRefs].filter(Boolean).join('\n');

    const xml = FACTURAE_ROOT_OPEN
        + g('FileHeader', [
            e('SchemaVersion', '3.2.2'), e('Modality', 'I'), e('InvoiceIssuerType', 'EM'),
            g('Batch', [
                e('BatchIdentifier', `${sellerNumber}${number}`, 70), e('InvoicesCount', '1'),
                amountType('TotalInvoicesAmount', total), amountType('TotalOutstandingAmount', total), amountType('TotalExecutableAmount', total),
                e('InvoiceCurrencyCode', 'EUR'),
            ]),
        ])
        + g('Parties', [partyXml('SellerParty', seller, seller.address), partyXml('BuyerParty', buyer, buyer.address)])
        + g('Invoices', [g('Invoice', [
            g('InvoiceHeader', [e('InvoiceNumber', number), e('InvoiceDocumentType', 'FC'), e('InvoiceClass', isCredit ? 'OR' : 'OO'), corrective]),
            g('InvoiceIssueData', [
                e('IssueDate', issueDate), e('OperationDate', operationDate),
                period ? g('InvoicingPeriod', [e('StartDate', period.start), e('EndDate', period.end)]) : '',
                e('InvoiceCurrencyCode', 'EUR'), e('TaxCurrencyCode', 'EUR'), e('LanguageName', 'es'),
                e('ReceiverTransactionReference', po && po.length <= 20 ? po : null),
                e('ReceiverContractReference', buyerRef && buyerRef.length <= 20 ? buyerRef : null),
            ]),
            g('TaxesOutputs', taxesOutputs),
            withheld.length ? g('TaxesWithheld', withheld) : '',
            g('InvoiceTotals', [
                // Σ GrossAmount de los conceptos: ya descontado el descuento de
                // documento repartido a cada uno, que va como descuento de línea.
                e('TotalGrossAmount', money(sign * sumBase / 100)),
                e('TotalGrossAmountBeforeTaxes', money(sign * sumBase / 100)),
                e('TotalTaxOutputs', money(sign * sumTax / 100)),
                e('TotalTaxesWithheld', money(sign * sumWithheld / 100)),
                e('InvoiceTotal', money(total)),
                e('TotalOutstandingAmount', money(total)),
                e('TotalExecutableAmount', money(total)),
            ]),
            g('Items', lineXml),
            payment,
            literals,
            additional ? g('AdditionalData', [e('InvoiceAdditionalInformation', additional, 2500)]) : '',
        ])])
        + FACTURAE_ROOT_CLOSE;
    return { xml, problems };
}

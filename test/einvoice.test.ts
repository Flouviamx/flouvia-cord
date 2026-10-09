// Factura electrónica europea (EN 16931): modelo, serializadores y Factur-X.
//
// Esto es lo rápido y sin red. La validación contra los artefactos oficiales
// (KoSIT/XRechnung, schematron CEN, Peppol, Factur-X, veraPDF) la hace
// `npm run security:einvoice` sobre las MISMAS muestras de
// `helpers/einvoice-samples.ts`.

import { describe, expect, it } from 'vitest';
import { generateKeyPairSync, createHash, verify as verifySignature } from 'node:crypto';
import forge from 'node-forge';
import { EINVOICE_SAMPLES, FACTURAE_SAMPLES, CANARIAS_SELLER, CEUTA_SELLER, DE_SELLER, FR_SELLER, sampleLine, samplePdfInput } from './helpers/einvoice-samples';
import {
    assessEInvoice, calendarDay, formatProblems, frCtcProblems, frVatFromSiren, isEInvoiceFormat, isoDayIn, lineVat, partyIds, unitPrice,
    RATED_CATEGORIES, type EInvoiceSource,
} from '../src/lib/fiscal/einvoice/model';
import { cadreDe, decimales, entregaDistinta, fluxFr, sirenDe, tasaFrancesa } from '../src/lib/fiscal/einvoice/fr-ctc';
import { serializeUbl, UBL_CUSTOMIZATION, UBL_PROFILE_ID } from '../src/lib/fiscal/einvoice/ubl';
import { serializeCii, CII_GUIDELINE } from '../src/lib/fiscal/einvoice/cii';
import { buildFacturX, FACTURX_FILENAME } from '../src/lib/fiscal/einvoice/facturx';
import {
    checkLeitwegId, einvoiceAddressLeitwegProblem, einvoiceEmailMode, leitwegCheckDigits, leitwegProblem, normalizeBic,
    normalizeEInvoiceAddress, splitEInvoiceAddress,
} from '../src/lib/fiscal/einvoice/codes';
import { assessFacturae, FACTURAE_ROOT_OPEN, type FacturaeSource } from '../src/lib/fiscal/einvoice/facturae';
import { FACTURAE_POLICY_SHA1, FACTURAE_POLICY_URL, issuerNameRfc2253, signFacturae } from '../src/lib/fiscal/einvoice/xades';
import { exemptionChoicesFor, exemptionReasonFor } from '../src/lib/fiscal/exemption';
import { loadArchivalFonts } from '../src/lib/pdf/pdfa';
import { measureText, winAnsiCodePoint, type FontKey } from '../src/lib/pdf/writer';
import { createInvoicePdf } from '../src/lib/fiscal/invoice-pdf';

const cents = (n: number) => Math.round(n * 100);
const sum = (xs: number[]) => xs.reduce((s, x) => s + cents(x), 0);
const byId = (id: string) => EINVOICE_SAMPLES.find((s) => s.id === id)!;
const clone = (src: EInvoiceSource): EInvoiceSource => structuredClone(src);

describe('muestras: modelo EN 16931 y reglas de cuadre', () => {
    for (const s of EINVOICE_SAMPLES) {
        it(`${s.id}: genera sus formatos y cuadra al céntimo con el total de Cord`, () => {
            const a = assessEInvoice(s.source);
            expect(a.problems).toEqual([]);
            const inv = a.invoice!;
            for (const f of s.formats) expect(formatProblems(f, a).map((p) => p.code), f).toEqual([]);
            expect(inv.vat.map((v) => v.category)).toEqual(s.categories);

            // BR-CO-10, -13, -14, -15 y BT-115: contra los importes del documento.
            expect(cents(inv.totals.lineNet)).toBe(sum(inv.lines.map((l) => l.netAmount)));
            expect(cents(inv.totals.taxExclusive)).toBe(cents(inv.totals.lineNet) - cents(inv.totals.allowances));
            expect(cents(inv.totals.taxExclusive)).toBe(cents(s.source.subtotal));
            expect(cents(inv.totals.tax)).toBe(cents(s.source.taxTotal));
            expect(cents(inv.totals.taxInclusive)).toBe(cents(s.source.total));
            expect(cents(inv.totals.payable)).toBe(cents(s.source.total));
            // BG-23: el desglose suma la base y el impuesto del documento.
            expect(sum(inv.vat.map((v) => v.taxable))).toBe(cents(inv.totals.taxExclusive));
            expect(sum(inv.vat.map((v) => v.tax))).toBe(cents(inv.totals.tax));
            for (const v of inv.vat) {
                const lines = inv.lines.filter((l) => l.category === v.category && (!RATED_CATEGORIES.has(v.category) || l.rate === v.rate));
                const allowance = inv.allowances.filter((x) => x.category === v.category && x.rate === v.rate);
                // BR-S-08 y hermanas: base del grupo = Σ BT-131 − Σ BT-92 del grupo.
                expect(cents(v.taxable)).toBe(sum(lines.map((l) => l.netAmount)) - sum(allowance.map((x) => x.amount)));
                // BR-CO-17, BR-AF-09, BR-AG-09 (tolerancia de una unidad del schematron CEN 1.3.16).
                if (RATED_CATEGORIES.has(v.category)) expect(Math.abs(v.tax - (v.taxable * v.rate) / 100)).toBeLessThan(1);
                else expect(v.tax).toBe(0);
            }
            // PEPPOL-EN16931-R120: cantidad × precio ≈ importe de la línea.
            for (const l of inv.lines) expect(Math.abs(l.quantity * l.netPrice - l.netAmount)).toBeLessThanOrEqual(0.02);
        });
    }

    it('el descuento de documento va como BG-20 por categoría y suma lo que bajó cada línea', () => {
        for (const id of ['discount', 'discount-ttc']) {
            const s = byId(id);
            const inv = assessEInvoice(s.source).invoice!;
            const discounts = s.source.lines.reduce((t, l) => t + cents(Number(l.discount) || 0), 0);
            expect(discounts).toBeGreaterThan(0);
            expect(cents(inv.totals.allowances)).toBe(discounts);
            expect(sum(inv.allowances.map((x) => x.amount))).toBe(discounts);
            expect(inv.allowances.every((x) => x.reasonCode === '95')).toBe(true);
            // La línea lleva el importe BRUTO, como la tabla del PDF.
            for (const [i, l] of inv.lines.entries()) {
                expect(cents(l.netAmount)).toBe(cents(s.source.lines[i].subtotal) + cents(Number(s.source.lines[i].discount) || 0));
            }
        }
        // Cupón de 50 sobre precios con IVA: el cliente paga exactamente 50 menos.
        const ttc = byId('discount-ttc');
        const sinCupon = 3 * 89.99 + 2 * 34.9 + 1.5 * 76.5 + 25;
        expect(cents(ttc.source.total)).toBe(cents(sinCupon) - 5000);
    });

    it('Francia entre profesionales: las menciones PMD, PMT y AAB como notas con su código', () => {
        const inv = assessEInvoice(byId('fr-b2b').source).invoice!;
        expect(inv.notes.map((n) => n.subject).filter(Boolean)).toEqual(['PMD', 'PMT', 'AAB']);
        expect(assessEInvoice(byId('de-leitweg').source).invoice!.notes.some((n) => n.subject)).toBe(false);
    });

    it('la fecha de expedición es el día del emisor, no el de UTC', () => {
        // 22:30 UTC del 8 de octubre ya es el 9 en Berlín.
        expect(assessEInvoice(byId('de-leitweg').source).invoice!.issueDate).toBe('2026-10-09');
        expect(isoDayIn('2026-10-08T22:30:00Z', 'Europe/Berlin')).toBe('2026-10-09');
        expect(calendarDay('2026-11-07')).toBe('2026-11-07');
    });

    it('nota de crédito: 381, factura de origen y pago "1" sin fingir una transferencia', () => {
        const inv = assessEInvoice(byId('credit-note').source).invoice!;
        expect(inv.typeCode).toBe('381');
        expect(inv.preceding).toEqual({ number: 'RE2026-000045', issueDate: '2026-10-09' });
        expect(inv.paymentMeans).toEqual({ code: '1' });
        expect(inv.dueDate).toBeUndefined();
        const ubl = serializeUbl(inv, 'xrechnung');
        expect(ubl).toContain('<CreditNote ');
        expect(ubl).toContain('<cbc:CreditNoteTypeCode>381</cbc:CreditNoteTypeCode>');
        expect(ubl).not.toContain('<cac:PayeeFinancialAccount>');
        expect(serializeCii(inv, 'xrechnung')).toContain('<ram:TypeCode>381</ram:TypeCode>');
    });

    it('entrega intracomunitaria: fecha y dirección completa de destino (BR-IC-11/12, BR-DE-10/11)', () => {
        const inv = assessEInvoice(byId('intra-eu-k').source).invoice!;
        expect(inv.delivery).toEqual({ date: '2026-10-08', address: { line1: 'Ring 1', city: 'Köln', postalCode: '50667', country: 'DE' } });
        expect(serializeCii(inv, 'xrechnung')).toContain('<ram:ShipToTradeParty><ram:PostalTradeAddress><ram:PostcodeCode>50667</ram:PostcodeCode>');
    });
});

describe('falla cerrado: lo que no se puede representar no se genera', () => {
    const base = () => clone(byId('fr-b2b').source);
    const codes = (src: EInvoiceSource) => assessEInvoice(src).problems.map((p) => p.code);

    it('retenciones, proforma, emisor fuera de la UE, borrador, anulada y prueba', () => {
        expect(codes({ ...base(), retencionTotal: 15, total: base().total - 15 })).toContain('withholding');
        expect(codes({ ...base(), documentType: 'proforma' })).toContain('proforma');
        expect(codes({ ...base(), issuer: { ...FR_SELLER, address: { ...FR_SELLER.address, countryCode: 'MX' } } })).toContain('issuer_not_eu');
        expect(codes({ ...base(), status: 'pending' })).toContain('not_issued');
        expect(codes({ ...base(), lifecycle: 'void' })).toContain('void');
        expect(codes({ ...base(), simulated: true })).toContain('test_document');
        expect(assessEInvoice({ ...base(), retencionTotal: 15 }).invoice).toBeNull();
    });

    it('totales que no son la suma de sus líneas no se "arreglan"', () => {
        expect(codes({ ...base(), total: base().total + 0.01 })).toContain('totals_mismatch');
        const src = base();
        src.lines[0] = { ...src.lines[0], taxAmount: src.lines[0].taxAmount + 0.01 };
        expect(codes(src)).toContain('totals_mismatch');
    });

    it('una línea exenta con impuesto o una operación no sujeta mezclada', () => {
        const src = base();
        src.lines[2] = { ...src.lines[2], taxRate: 0, exemptionReason: 'VATEX-EU-132' };
        expect(codes(src)).toContain('lines_inconsistent');
        const mixed = clone(byId('mixed-rates').source);
        mixed.lines[2] = { ...mixed.lines[2], exemptionReason: 'VATEX-EU-O' };
        expect(codes(mixed)).toContain('o_mixed');
    });

    it('lo que cada formato pide aparte se dice, con dónde corregirlo', () => {
        const fp = (src: EInvoiceSource, f: Parameters<typeof formatProblems>[0]) => formatProblems(f, assessEInvoice(src)).map((p) => p.code);
        expect(fp({ ...base(), buyerReference: null }, 'xrechnung')).toContain('buyer_reference');
        expect(fp({ ...base(), iban: null }, 'xrechnung')).toContain('iban');
        expect(fp({ ...base(), issuer: { ...FR_SELLER, phone: '' } }, 'xrechnung')).toContain('seller_contact');
        expect(fp({ ...base(), buyerReference: null, purchaseOrder: null }, 'peppol')).toContain('peppol_reference');
        expect(fp({ ...base(), recipient: { ...base().recipient, electronicAddress: undefined } }, 'peppol')).toContain('buyer_endpoint');
        // DE-R-001: entre empresas alemanas Peppol exige instrucciones de pago.
        expect(fp({ ...clone(byId('mixed-rates').source), iban: null }, 'peppol')).toContain('iban');
        expect(fp({ ...clone(byId('intra-eu-ae').source), iban: null }, 'peppol')).not.toContain('iban');
        expect(fp({ ...base(), buyerReference: null }, 'facturx')).toEqual([]);
        const problem = formatProblems('xrechnung', assessEInvoice({ ...base(), iban: null })).find((p) => p.code === 'iban')!;
        expect(problem.fix).toBe('cobros');
        expect(problem.es).not.toMatch(/IBAN_|ENV|_KEY/);
    });
});

describe('categoría de IVA por línea (UNTDID 5305) e identificadores', () => {
    const ctx = { issuerCountry: 'DE', buyerCountry: 'DE', sellerVat: 'DE136695976', buyerVat: 'DE811569869', smallBusiness: false, lang: 'de' as const };
    const zero = (extra: object = {}) => ({ ...sampleLine('x', 1, 10, 0), ...extra });

    it('derivada del contexto cuando la línea no trae causa', () => {
        expect(lineVat(sampleLine('x', 1, 10, 0.19), ctx).category).toBe('S');
        expect(lineVat(zero(), { ...ctx, buyerCountry: 'FR', buyerVat: 'FR83404833048' })).toMatchObject({ category: 'AE', code: 'VATEX-EU-AE' });
        expect(lineVat(zero(), { ...ctx, buyerCountry: 'US', buyerVat: undefined })).toMatchObject({ category: 'G', code: 'VATEX-EU-G' });
        expect(lineVat(zero(), ctx).category).toBe('E');
        expect(lineVat(zero(), { ...ctx, issuerCountry: 'FR', smallBusiness: true })).toMatchObject({ category: 'E', code: 'VATEX-FR-FRANCHISE' });
        expect(lineVat(zero(), { ...ctx, smallBusiness: true }).text).toContain('§ 19 UStG');
    });

    it('la causa explícita manda: VATEX en la UE, Verifactu traducida en España', () => {
        expect(lineVat(zero({ exemptionReason: 'VATEX-EU-IC' }), ctx)).toMatchObject({ category: 'K', code: 'VATEX-EU-IC' });
        expect(lineVat(zero({ exemptionReason: 'Z' }), ctx)).toEqual({ category: 'Z' });
        const es = { ...ctx, issuerCountry: 'ES', lang: 'es' as const };
        expect(lineVat(zero({ exemptionReason: 'E2' }), es)).toMatchObject({ category: 'G', code: 'VATEX-EU-G' });
        expect(lineVat(zero({ exemptionReason: 'E5' }), es)).toMatchObject({ category: 'K', code: 'VATEX-EU-IC' });
        expect(lineVat(zero({ exemptionReason: 'S2' }), es)).toMatchObject({ category: 'AE' });
        expect(lineVat(zero({ exemptionReason: 'N1' }), es)).toMatchObject({ category: 'O' });
        expect(lineVat(zero({ exemptionReason: 'N2' }), { ...es, buyerCountry: 'FR' })).toMatchObject({ category: 'AE' });
        expect(lineVat(zero({ exemptionReason: 'N2' }), { ...es, buyerCountry: 'US', buyerVat: undefined })).toMatchObject({ category: 'O' });
        expect(lineVat(zero({ exemptionReason: 'E1' }), es).category).toBe('E');
    });

    it('cada identificador en su casilla (BT-31, BT-32, BT-30)', () => {
        expect(frVatFromSiren('303265045')).toBe('FR40303265045');
        expect(partyIds({ ...FR_SELLER, taxId: '303265045' }, 'seller')).toMatchObject({ vatId: 'FR40303265045', legalId: { id: '303265045', scheme: '0002' } });
        expect(partyIds({ ...FR_SELLER, taxId: '303265045' }, 'seller', true)).toEqual({ taxRegistrationId: '303265045', legalId: { id: '303265045', scheme: '0002' } });
        expect(partyIds(DE_SELLER, 'seller')).toMatchObject({ vatId: 'DE136695976', legalId: { id: 'HRB 123456 B' } });
        expect(partyIds({ ...DE_SELLER, taxId: '2181508150', legalRegistrationId: undefined }, 'seller').vatId).toBeUndefined();
    });

    it('precio unitario que reproduce el importe (PEPPOL-EN16931-R120)', () => {
        for (const [amount, qty] of [[100, 3], [0.01, 7], [271.93, 1.25], [1.25, 1000], [999999.99, 0.003]] as const) {
            expect(Math.abs(unitPrice(amount, qty) * qty - amount)).toBeLessThanOrEqual(0.005);
        }
    });
});

describe('serializadores UBL y CII', () => {
    const inv = assessEInvoice(byId('fr-b2b').source).invoice!;

    it('identificadores de especificación de cada perfil', () => {
        expect(serializeUbl(inv, 'peppol')).toContain(`<cbc:CustomizationID>${UBL_CUSTOMIZATION.peppol}</cbc:CustomizationID><cbc:ProfileID>${UBL_PROFILE_ID}</cbc:ProfileID>`);
        expect(UBL_CUSTOMIZATION.xrechnung).toBe('urn:cen.eu:en16931:2017#compliant#urn:xeinkauf.de:kosit:xrechnung_3.0');
        expect(UBL_CUSTOMIZATION.peppol).toBe('urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0');
        expect(CII_GUIDELINE['facturx-en16931']).toBe('urn:cen.eu:en16931:2017');
        expect(serializeCii(inv, 'xrechnung')).toContain(`<ram:ID>${CII_GUIDELINE.xrechnung}</ram:ID>`);
        expect(serializeCii(inv, 'facturx-en16931')).not.toContain('BusinessProcessSpecifiedDocumentContextParameter');
    });

    it('sin huecos ni valores sin formato, y con el texto escapado', () => {
        for (const s of EINVOICE_SAMPLES) {
            const i = assessEInvoice(s.source).invoice!;
            for (const xml of [serializeUbl(i, 'peppol'), serializeUbl(i, 'xrechnung'), serializeCii(i, 'xrechnung'), serializeCii(i, 'facturx-en16931')]) {
                expect(xml).not.toMatch(/undefined|NaN|null|\[object/);
                // Todo importe con dos decimales exactos (BR-DEC-*). Los precios
                // unitarios (BT-146: PriceAmount, ChargeAmount) admiten más.
                for (const m of xml.matchAll(/<((?:cbc|ram):\w+Amount)\b[^>]*>([^<]*)</g)) {
                    if (/PriceAmount|ChargeAmount/.test(m[1])) expect(m[2]).toMatch(/^\d+(\.\d+)?$/);
                    else expect(m[2], m[1]).toMatch(/^-?\d+\.\d{2}$/);
                }
            }
        }
        const escaped = assessEInvoice({ ...clone(byId('fr-b2b').source), notes: 'A & B <test> "q"' }).invoice!;
        expect(serializeCii(escaped, 'facturx-en16931')).toContain('A &amp; B &lt;test&gt;');
    });

    it('la categoría O no lleva tasa en línea ni descuento, pero sí 0 en el desglose (BR-O-05/06, BR-DE-14)', () => {
        const src = clone(byId('export-g').source);
        src.lines = [sampleLine('Hors champ', 1, 100, 0, { exemptionReason: 'VATEX-EU-O' })];
        src.subtotal = 100; src.taxTotal = 0; src.total = 100;
        src.issuer = { ...FR_SELLER, legalRegistrationId: { id: '303265045' } };
        const i = assessEInvoice(src).invoice!;
        expect(i.seller.vatId).toBeUndefined();
        const ubl = serializeUbl(i, 'xrechnung');
        expect(ubl).toContain('<cac:ClassifiedTaxCategory><cbc:ID>O</cbc:ID><cac:TaxScheme>');
        expect(ubl).toMatch(/<cac:TaxSubtotal>.*<cbc:ID>O<\/cbc:ID><cbc:Percent>0<\/cbc:Percent>/s);
    });
});

describe('Factur-X (PDF/A-3b) y el PDF de siempre', () => {
    it('PDF/A-3 con el XML incrustado como alternativa y fuentes incrustadas', { timeout: 20_000 }, async () => {
        const fonts = await loadArchivalFonts();
        const s = byId('fr-b2b');
        const inv = assessEInvoice(s.source).invoice!;
        const { pdf, xml } = buildFacturX(samplePdfInput(s.source), inv, fonts);
        const text = pdf.toString('latin1');
        expect(text.startsWith('%PDF-1.7')).toBe(true);
        expect(xml).toBe(serializeCii(inv, 'facturx-en16931'));
        expect(text).toContain(`(${FACTURX_FILENAME})`);
        expect(text).toContain('/AFRelationship /Alternative');
        expect(text).toContain('/Subtype /text#2Fxml');
        expect(text).toContain('<pdfaid:part>3</pdfaid:part><pdfaid:conformance>B</pdfaid:conformance>');
        expect(text).toContain('<fx:ConformanceLevel>EN 16931</fx:ConformanceLevel>');
        expect(text).toContain('/OutputIntents');
        expect(text).toContain('/FontFile2');
        // PDF/A no admite fuentes sin incrustar: nada de las 14 estándar.
        expect(text).not.toMatch(/\/BaseFont \/(Helvetica|Times)/);
        // Determinista: la fecha de los metadatos es la de expedición.
        expect(buildFacturX(samplePdfInput(s.source), inv, fonts).pdf.equals(pdf)).toBe(true);
    });

    it('sin `assemble` sale el PDF de siempre, byte a byte', () => {
        for (const s of EINVOICE_SAMPLES.slice(0, 4)) {
            const input = samplePdfInput(s.source);
            const plain = createInvoicePdf(structuredClone(input));
            expect(createInvoicePdf({ ...structuredClone(input), assemble: (doc) => doc.build() }).equals(plain)).toBe(true);
            expect(createInvoicePdf(structuredClone(input)).equals(plain)).toBe(true);
        }
    });

    it('Liberation reproduce las métricas con que el PDF calcula el layout', { timeout: 20_000 }, async () => {
        const fonts = await loadArchivalFonts();
        // Liberation es métricamente compatible con Helvetica y Times en todo
        // WinAnsi salvo cinco símbolos (¯ ± µ · ÷), donde copia los anchos de
        // Arial y Times New Roman. Ahí el PDF de siempre se dibuja con la fuente
        // estándar del visor, así que mandan las métricas AFM de Adobe.
        const AFM_DIFIERE = '¯±µ·÷';
        const winAnsi = Array.from({ length: 224 }, (_, i) => winAnsiCodePoint(i + 32))
            .filter((cp): cp is number => cp != null && cp !== 0x7f)
            .map((cp) => String.fromCodePoint(cp));
        expect(winAnsi.length).toBeGreaterThan(200);
        for (const family of ['sans', 'serif'] as const) {
            for (const weight of ['regular', 'bold'] as const) {
                const font = fonts[family][weight];
                for (const ch of winAnsi) {
                    if (AFM_DIFIERE.includes(ch)) continue;
                    const cp = ch.codePointAt(0)!;
                    const lib = (font.advance(font.glyphFor(cp)) * 1000) / font.unitsPerEm;
                    expect(Math.abs(measureText(ch, 1000, weight as FontKey, family) - lib), `${family} ${weight} ${ch}`).toBeLessThanOrEqual(1);
                }
            }
        }
        expect(winAnsiCodePoint(0x80)).toBe(0x20ac);
    });
});

describe('códigos y ajustes', () => {
    it('dirección electrónica con esquema EAS válido', () => {
        expect(normalizeEInvoiceAddress(' 0204 : 04011000-1234512345-06 ')).toBe('0204:04011000-1234512345-06');
        expect(normalizeEInvoiceAddress('em:facturas@example.com')).toBe('EM:facturas@example.com');
        expect(normalizeEInvoiceAddress('9999:123')).toBeNull();
        expect(normalizeEInvoiceAddress('0088')).toBeNull();
        expect(splitEInvoiceAddress('0088:4000001000002')).toEqual({ scheme: '0088', id: '4000001000002' });
    });

    it('BIC', () => {
        expect(normalizeBic(' cobadeffxxx ')).toBe('COBADEFFXXX');
        expect(normalizeBic('AGRIFRPP')).toBe('AGRIFRPP');
        expect(normalizeBic('AGRI-FR')).toBeNull();
    });

    it('qué se adjunta al correo: Factur-X en Francia, XRechnung en Alemania, nada en el resto', () => {
        expect(einvoiceEmailMode('FR', undefined)).toBe('facturx');
        expect(einvoiceEmailMode('DE', null)).toBe('xrechnung');
        expect(einvoiceEmailMode('ES', undefined)).toBe('off');
        expect(einvoiceEmailMode('FR', 'off')).toBe('off');
        expect(einvoiceEmailMode('DE', 'facturx')).toBe('facturx');
        expect(einvoiceEmailMode('FR', 'pdf-raro')).toBe('facturx');
        // Facturae solo si el negocio la elige: nunca es el valor por defecto.
        expect(einvoiceEmailMode('ES', 'facturae')).toBe('facturae');
        expect(isEInvoiceFormat('peppol')).toBe(true);
        expect(isEInvoiceFormat('facturae')).toBe(true);
        expect(isEInvoiceFormat('xml')).toBe(false);
    });

    it('causas de exención: VATEX solo en la UE fuera de España y solo al 0 %', () => {
        expect(exemptionReasonFor('FR', 'vatex-eu-ic', 0)).toBe('VATEX-EU-IC');
        expect(exemptionReasonFor('FR', 'VATEX-EU-IC', 0.2)).toBeNull();
        expect(exemptionReasonFor('DE', 'VATEX-FR-FRANCHISE', 0)).toBeNull();
        expect(exemptionReasonFor('FR', 'VATEX-FR-FRANCHISE', 0)).toBe('VATEX-FR-FRANCHISE');
        expect(exemptionReasonFor('ES', 'E1', 0)).toBe('E1');
        expect(exemptionReasonFor('ES', 'VATEX-EU-IC', 0)).toBeNull();
        expect(exemptionReasonFor('MX', 'VATEX-EU-IC', 0)).toBeNull();
        expect(exemptionChoicesFor('FR', 'es').map((c) => c.code)).toContain('VATEX-FR-FRANCHISE');
        expect(exemptionChoicesFor('DE', 'en').map((c) => c.code)).not.toContain('VATEX-FR-FRANCHISE');
        expect(exemptionChoicesFor('MX', 'es')).toEqual([]);
        expect(exemptionChoicesFor('ES', 'es')[0].code).toBe('E1');
    });
});

describe('IGIC e IPSI: categorías L y M de EN 16931', () => {
    const igic = () => clone(byId('igic').source);
    const fp = (src: EInvoiceSource, f: Parameters<typeof formatProblems>[0]) => formatProblems(f, assessEInvoice(src)).map((p) => p.code);

    it('el territorio del emisor decide la categoría, a cualquier tipo (también el 0 %)', () => {
        const ctx = { issuerCountry: 'ES', buyerCountry: 'ES', smallBusiness: false, lang: 'es' as const };
        expect(lineVat(sampleLine('x', 1, 10, 0.07), { ...ctx, territory: 'igic' }).category).toBe('L');
        expect(lineVat(sampleLine('x', 1, 10, 0), { ...ctx, territory: 'igic' }).category).toBe('L');
        expect(lineVat(sampleLine('x', 1, 10, 0.04), { ...ctx, territory: 'ipsi' }).category).toBe('M');
        expect(lineVat(sampleLine('x', 1, 10, 0.21), { ...ctx, territory: 'iva' }).category).toBe('S');
    });

    it('un grupo por tipo (BR-AF-08, BR-AG-08) con su impuesto', () => {
        const groups = (src: EInvoiceSource) => assessEInvoice(src).invoice!.vat.map((v) => `${v.category} ${v.rate}`).sort();
        expect(groups(igic())).toEqual(['L 3', 'L 7']);
        expect(groups(clone(byId('ipsi').source))).toEqual(['M 0', 'M 10', 'M 4']);
        const inv = assessEInvoice(igic()).invoice!;
        expect(inv.vat.find((v) => v.rate === 7)!.tax).toBe(71.4);
        expect(inv.vat.find((v) => v.rate === 3)!.tax).toBe(5.4);
    });

    it('fuera del territorio del IVA de la UE el NIF no es NIF-IVA: va como registro fiscal (BT-32)', () => {
        const inv = assessEInvoice(igic()).invoice!;
        expect(inv.seller.vatId).toBeUndefined();
        expect(inv.seller.taxRegistrationId).toBe(CANARIAS_SELLER.taxId);
        expect(inv.buyer.vatId).toBeUndefined();
        const ubl = serializeUbl(inv, 'peppol');
        expect(ubl).toContain('<cac:TaxCategory><cbc:ID>L</cbc:ID><cbc:Percent>7</cbc:Percent>');
        expect(ubl).toContain('<cac:PartyTaxScheme><cbc:CompanyID>B35001239</cbc:CompanyID><cac:TaxScheme><cbc:ID>FC</cbc:ID>');
        expect(ubl).not.toContain('ESB35001239');
        expect(serializeCii(inv, 'xrechnung')).toContain('<ram:CategoryCode>L</ram:CategoryCode>');
        const ceuta = assessEInvoice(clone(byId('ipsi').source)).invoice!;
        expect(ceuta.seller.taxRegistrationId).toBe(CEUTA_SELLER.taxId);
    });

    it('una causa de exención no cabe en L ni en M (BR-AF-10, BR-AG-10)', () => {
        const src = igic();
        src.lines[1] = { ...src.lines[1], exemptionReason: 'E1' };
        expect(assessEInvoice(src).problems.map((p) => p.code)).toContain('igic_exemption');
        const ipsi = clone(byId('ipsi').source);
        ipsi.lines[2] = { ...ipsi.lines[2], exemptionReason: 'E1' };
        expect(assessEInvoice(ipsi).problems.map((p) => p.code)).toContain('ipsi_exemption');
    });

    it('IGIC al 0 %: UBL sí, CII no (BR-AF-05 de CEN 1.3.16 exige > 0 en CII)', () => {
        const zero = clone(byId('igic-zero').source);
        expect(fp(zero, 'xrechnung')).toEqual([]);
        expect(fp(zero, 'peppol')).toEqual([]);
        expect(fp(zero, 'facturx')).toContain('igic_zero_cii');
        expect(fp(zero, 'xrechnung-cii')).toContain('igic_zero_cii');
        // El IPSI al 0 % sí pasa en CII (BR-AG-05 admite >= 0).
        expect(fp(clone(byId('ipsi').source), 'facturx')).toEqual([]);
    });
});

describe('Leitweg-ID (Formatspezifikation v2.0.2, KoSIT)', () => {
    // Oráculo independiente: ISO/IEC 7064 MOD 97-10 con BigInt.
    const oracle = (id: string) => {
        const digits = id.toUpperCase().replace(/-/g, '').replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55));
        return BigInt(digits) % 97n === 1n;
    };

    it('el ejemplo de la especificación, paso a paso (cap. 2.4)', () => {
        // 04011000123451234500 mod 97 = 92; 98 - 92 = 06.
        expect(BigInt('04011000123451234500') % 97n).toBe(92n);
        expect(leitwegCheckDigits('04011000-1234512345')).toBe('06');
        expect(checkLeitwegId('04011000-1234512345-06')).toEqual({ ok: true, normalized: '04011000-1234512345-06' });
        expect(oracle('04011000-1234512345-06')).toBe(true);
    });

    it('letras en la Feinadressierung (A = 10 … Z = 35) y sin distinguir mayúsculas', () => {
        for (const id of ['991-33333TEST-33', '992-90009-96', '04011000-12345-03']) {
            expect(oracle(id), id).toBe(true);
            expect(checkLeitwegId(id).ok, id).toBe(true);
        }
        expect(leitwegCheckDigits('991-33333TEST')).toBe('33');
        expect(checkLeitwegId('991-33333test-33')).toEqual({ ok: true, normalized: '991-33333TEST-33' });
    });

    it('rechaza dígito de control, estado federado y forma', () => {
        expect(checkLeitwegId('04011000-12345-34')).toEqual({ ok: false, reason: 'checksum' });
        expect(checkLeitwegId('991-01234-44')).toEqual({ ok: false, reason: 'checksum' });
        expect(checkLeitwegId('17011000-12345-03')).toEqual({ ok: false, reason: 'land' });
        expect(checkLeitwegId('00011000-12345-03')).toEqual({ ok: false, reason: 'land' });
        expect(checkLeitwegId('04011000-1234512345')).toEqual({ ok: false, reason: 'shape' });
        expect(checkLeitwegId('04011000-1234512345-6')).toEqual({ ok: false, reason: 'shape' });
        expect(checkLeitwegId('0401100012345678-03')).toEqual({ ok: false, reason: 'shape' });
        expect(leitwegProblem('checksum', 'es')).not.toBe(leitwegProblem('checksum', 'en'));
    });

    it('solo la dirección 0204 es un Leitweg-ID', () => {
        expect(einvoiceAddressLeitwegProblem('0204:04011000-1234512345-06')).toBeNull();
        expect(einvoiceAddressLeitwegProblem('0204:04011000-12345-34')).toEqual({ ok: false, reason: 'checksum' });
        expect(einvoiceAddressLeitwegProblem('0088:4000001000005')).toBeNull();
    });

    it('en la factura electrónica, un Leitweg-ID inválido falla cerrado', () => {
        const de = () => clone(byId('de-leitweg').source);
        const codes = (src: EInvoiceSource) => assessEInvoice(src).problems.map((p) => p.code);
        expect(codes(de())).toEqual([]);
        expect(codes({ ...de(), buyerReference: '04011000-1234512345-07' })).toContain('buyer_reference_leitweg');
        const src = de();
        src.recipient = { ...src.recipient, electronicAddress: { scheme: '0204', id: '04011000-1234512345-07' } };
        expect(codes(src)).toContain('buyer_leitweg');
        // Sin dirección 0204 la referencia del comprador es texto libre.
        const fr = clone(byId('fr-b2b').source);
        expect(codes({ ...fr, buyerReference: 'SERVICE-ACHATS-12' })).not.toContain('buyer_reference_leitweg');
    });
});

describe('Facturae 3.2.2 (España)', () => {
    const tag = (xml: string, name: string) => [...xml.matchAll(new RegExp(`<${name}>([^<]*)</${name}>`, 'g'))].map((m) => m[1]);
    const num = (xml: string, name: string) => Number(tag(xml, name)[0]);
    const byFe = (id: string) => structuredClone(FACTURAE_SAMPLES.find((s) => s.id === id)!.source) as FacturaeSource;

    for (const s of FACTURAE_SAMPLES) {
        it(`${s.id}: se genera y cuadra al céntimo con el documento`, () => {
            const fe = assessFacturae(s.source);
            expect(fe.problems).toEqual([]);
            const xml = fe.xml!;
            expect(xml.startsWith(FACTURAE_ROOT_OPEN)).toBe(true);
            const sign = s.source.creditNoteOf ? -1 : 1;
            expect(cents(num(xml, 'TotalGrossAmountBeforeTaxes'))).toBe(cents(sign * s.source.subtotal));
            expect(cents(num(xml, 'TotalTaxOutputs'))).toBe(cents(sign * s.source.taxTotal));
            expect(cents(num(xml, 'TotalTaxesWithheld'))).toBe(cents(sign * (s.source.retencionTotal || 0)));
            // InvoiceTotal = base + impuestos repercutidos - retenciones.
            expect(cents(num(xml, 'InvoiceTotal'))).toBe(cents(num(xml, 'TotalGrossAmountBeforeTaxes')) + cents(num(xml, 'TotalTaxOutputs')) - cents(num(xml, 'TotalTaxesWithheld')));
            expect(cents(num(xml, 'InvoiceTotal'))).toBe(cents(sign * s.source.total));
            expect(tag(xml, 'TotalOutstandingAmount')[0]).toBe(tag(xml, 'InvoiceTotal')[0]);
            expect(xml).not.toMatch(/undefined|NaN|null/);
        });
    }

    it('el IRPF va en TaxesWithheld con su código (04), nunca restado de la base', () => {
        const xml = assessFacturae(byFe('fe-irpf')).xml!;
        const withheld = /<TaxesWithheld>([\s\S]*?)<\/TaxesWithheld>/.exec(xml)![1];
        expect(tag(withheld, 'TaxTypeCode')).toEqual(['04']);
        expect(tag(withheld, 'TaxRate')).toEqual(['15.00']);
        expect(num(xml, 'TotalGrossAmountBeforeTaxes')).toBe(2040);
        expect(num(xml, 'TotalTaxesWithheld')).toBe(306);
        expect(num(xml, 'InvoiceTotal')).toBe(2162.4);
    });

    it('cada impuesto con su código: IVA 01, IGIC 03, IPSI 02', () => {
        expect(new Set(tag(assessFacturae(byFe('fe-mixto')).xml!, 'TaxTypeCode'))).toEqual(new Set(['01']));
        expect(new Set(tag(assessFacturae(byFe('fe-igic-irpf')).xml!, 'TaxTypeCode'))).toEqual(new Set(['03', '04']));
        expect(new Set(tag(assessFacturae(byFe('fe-ipsi')).xml!, 'TaxTypeCode'))).toEqual(new Set(['02']));
    });

    it('exenta, no sujeta e inversión del sujeto pasivo', () => {
        const mixto = assessFacturae(byFe('fe-mixto')).xml!;
        expect(tag(mixto, 'SpecialTaxableEventCode')).toEqual(['01']);
        expect(tag(mixto, 'SpecialTaxableEventReason')[0]).toMatch(/^01 .*art\. 20/);
        const intra = assessFacturae(byFe('fe-intra-ue')).xml!;
        expect(tag(intra, 'SpecialTaxableEventCode')).toEqual(['02']);
        expect(tag(intra, 'LegalReference')).toContain('Inversión del sujeto pasivo');
        // Operación intracomunitaria: los dos NIF con el prefijo de su país.
        expect(tag(intra, 'TaxIdentificationNumber')).toEqual(['ESB28003218', 'FR83404833048']);
        expect(tag(intra, 'ResidenceTypeCode')).toEqual(['R', 'U']);
    });

    it('rectificativa por diferencias: OR, importes negativos y la factura que corrige', () => {
        const xml = assessFacturae(byFe('fe-rectificativa')).xml!;
        expect(tag(xml, 'InvoiceClass')).toEqual(['OR']);
        expect(tag(xml, 'InvoiceSeriesCode').concat(tag(xml, 'InvoiceNumber'))).toContain('LP-2026-0017');
        expect(tag(xml, 'CorrectionMethod')).toEqual(['02']);
        expect(num(xml, 'InvoiceTotal')).toBeLessThan(0);
        expect(num(xml, 'TotalTaxesWithheld')).toBeLessThan(0);
    });

    it('falla cerrado con el motivo', () => {
        const codes = (src: FacturaeSource) => assessFacturae(src).problems.map((p) => p.code);
        expect(codes({ ...byFe('fe-irpf'), currency: 'USD' })).toContain('facturae_currency');
        expect(codes({ ...byFe('fe-irpf'), issuer: { ...FR_SELLER } })).toContain('facturae_es_only');
        expect(codes({ ...byFe('fe-irpf'), total: byFe('fe-irpf').total + 0.01 })).toContain('totals_mismatch');
        const otra = byFe('fe-irpf');
        otra.retenciones = otra.retenciones!.map((r) => ({ ...r, nombre: 'Retención por arrendamiento', tipo: 'otra' }));
        expect(codes(otra)).toContain('facturae_withholding_type');
        expect(codes({ ...byFe('fe-rectificativa'), creditNoteOf: null })).toContain('facturae_credit_original');
        expect(codes({ ...byFe('fe-irpf'), invoiceNumber: 'X'.repeat(21) })).toContain('facturae_number');
        expect(codes({ ...byFe('fe-irpf'), status: 'pending' })).toContain('not_issued');
        expect(assessFacturae({ ...byFe('fe-irpf'), currency: 'USD' }).xml).toBeNull();
    });
});

describe('firma XAdES-EPES de la Facturae (política v3.1)', () => {
    const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
    const cert = forge.pki.createCertificate();
    cert.publicKey = forge.pki.publicKeyFromPem(publicKey.export({ type: 'spki', format: 'pem' }).toString());
    cert.serialNumber = '01a2b3c4d5';
    cert.validity.notBefore = new Date('2026-01-01T00:00:00Z');
    cert.validity.notAfter = new Date('2036-01-01T00:00:00Z');
    const attrs = [{ name: 'countryName', value: 'ES' }, { name: 'organizationName', value: 'Prueba, S.L.' }, { name: 'commonName', value: 'Firma de prueba' }];
    cert.setSubject(attrs);
    cert.setIssuer(attrs);
    cert.sign(forge.pki.privateKeyFromPem(privateKeyPem), forge.md.sha256.create());
    const certDer = Buffer.from(forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes(), 'binary');
    const signer = { privateKeyPem, certDer };
    const xml = assessFacturae(FACTURAE_SAMPLES[0].source).xml!;
    const opts = { signingTime: new Date('2026-10-09T10:00:00Z'), id: 'prueba' };
    const signed = signFacturae(xml, signer, opts);
    const DS = 'xmlns:ds="http://www.w3.org/2000/09/xmldsig#"';
    const FE = 'xmlns:fe="http://www.facturae.gob.es/formato/Versiones/Facturaev3_2_2.xml"';

    it('determinista: mismo documento, mismo certificado y misma hora, mismos bytes', () => {
        expect(signFacturae(xml, signer, opts)).toBe(signed);
        expect(signed.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    });

    it('tres referencias, política de Facturae y rol de emisor', () => {
        expect(signed.match(/<ds:Reference /g)).toHaveLength(3);
        expect(signed).toContain('URI=""');
        expect(signed).toContain('Type="http://uri.etsi.org/01903#SignedProperties" URI="#SignedProperties-prueba"');
        expect(signed).toContain('<ds:Reference URI="#KeyInfo-prueba">');
        expect(signed).toContain(`<xades:Identifier>${FACTURAE_POLICY_URL}</xades:Identifier>`);
        expect(signed).toContain(`<ds:DigestValue>${FACTURAE_POLICY_SHA1}</ds:DigestValue>`);
        expect(signed).toContain('<xades:ClaimedRole>emisor</xades:ClaimedRole>');
        expect(signed).toContain(`<ds:X509Certificate>${certDer.toString('base64')}</ds:X509Certificate>`);
        expect(signed).toContain('<xades:SigningTime>2026-10-09T10:00:00Z</xades:SigningTime>');
        expect(signed).toContain(`<ds:DigestValue>${createHash('sha256').update(certDer).digest('base64')}</ds:DigestValue>`);
    });

    it('la referencia del documento es la huella de la Facturae sin la firma (enveloped)', () => {
        const ref = /<ds:Reference Id="Reference-prueba" URI="">[\s\S]*?<ds:DigestValue>([^<]+)<\/ds:DigestValue>/.exec(signed)![1];
        expect(ref).toBe(createHash('sha256').update(xml, 'utf8').digest('base64'));
    });

    it('la firma RSA verifica sobre la forma canónica de SignedInfo', () => {
        const signedInfo = /<ds:SignedInfo[\s\S]*?<\/ds:SignedInfo>/.exec(signed)![0].replace('<ds:SignedInfo ', `<ds:SignedInfo ${DS} ${FE} `);
        const value = Buffer.from(/<ds:SignatureValue[^>]*>([^<]+)<\/ds:SignatureValue>/.exec(signed)![1], 'base64');
        expect(verifySignature('RSA-SHA256', Buffer.from(signedInfo, 'utf8'), publicKey, value)).toBe(true);
        const tampered = signedInfo.replace(/<ds:DigestValue>[^<]+/, '<ds:DigestValue>AAAA');
        expect(verifySignature('RSA-SHA256', Buffer.from(tampered, 'utf8'), publicKey, value)).toBe(false);
    });

    it('el emisor del certificado en RFC 2253, con las comas escapadas', () => {
        expect(issuerNameRfc2253(certDer)).toBe('CN=Firma de prueba,O=Prueba\\, S.L.,C=ES');
    });
});

describe('Francia: menciones de la reforma (CTC) en el Factur-X', () => {
    const fr = (id: string) => byId(id);
    const cii = (src: EInvoiceSource) => serializeCii(assessEInvoice(src).invoice!, 'facturx-en16931');
    const ubl = (src: EInvoiceSource) => serializeUbl(assessEInvoice(src).invoice!, 'peppol');
    const codes = (src: EInvoiceSource) => frCtcProblems(src, assessEInvoice(src)).map((x) => x.code);

    it('las muestras francesas se pueden transmitir tal cual', () => {
        const ctc = EINVOICE_SAMPLES.filter((x) => x.frCtc);
        expect(ctc.map((x) => x.id)).toEqual(['fr-ctc-services', 'fr-ctc-mixte', 'fr-ctc-biens-usd', 'fr-ctc-avoir']);
        for (const x of ctc) expect(codes(x.source), x.id).toEqual([]);
    });

    it('categoría de la operación (BT-23) desde la naturaleza de cada línea: S1, M1, B1', () => {
        expect(assessEInvoice(fr('fr-ctc-services').source).invoice?.businessProcess).toBe('S1');
        expect(assessEInvoice(fr('fr-ctc-mixte').source).invoice?.businessProcess).toBe('M1');
        expect(assessEInvoice(fr('fr-ctc-biens-usd').source).invoice?.businessProcess).toBe('B1');
        expect(cii(fr('fr-ctc-mixte').source)).toContain('<ram:BusinessProcessSpecifiedDocumentContextParameter><ram:ID>M1</ram:ID>');
        // XRechnung conserva su propio proceso en BT-23.
        expect(serializeCii(assessEInvoice(fr('fr-ctc-mixte').source).invoice!, 'xrechnung')).not.toContain('<ram:ID>M1</ram:ID>');
        expect(cadreDe([])).toBeNull();
        expect(cadreDe([{ nature: 'goods' }, {}])).toBeNull();
    });

    it('sin naturaleza declarada el documento se escribe como antes de la reforma', () => {
        const xml = cii(fr('fr-b2b').source);
        expect(xml).not.toContain('BusinessProcessSpecifiedDocumentContextParameter');
        expect(xml).not.toContain('<ram:SubjectCode>BAR</ram:SubjectCode>');
        expect(xml).not.toContain('GrossPriceProductTradePrice');
        expect(codes(fr('fr-b2b').source)).toContain('fr_operation_category');
    });

    it('opción por los débitos (BT-8): código 5 en CII y 3 en UBL, solo con servicios', () => {
        expect(cii(fr('fr-ctc-services').source)).toContain('<ram:DueDateTypeCode>5</ram:DueDateTypeCode>');
        expect(ubl(fr('fr-ctc-services').source)).toContain('<cac:InvoicePeriod><cbc:DescriptionCode>3</cbc:DescriptionCode></cac:InvoicePeriod>');
        // Una venta de bienes devenga la TVA con la entrega, con o sin opción.
        expect(cii(fr('fr-ctc-biens-usd').source)).not.toContain('DueDateTypeCode');
        const sinOpcion = clone(fr('fr-ctc-services').source);
        sinOpcion.issuer = { ...sinOpcion.issuer!, vatOnDebits: false };
        expect(cii(sinOpcion)).not.toContain('DueDateTypeCode');
    });

    it('nota BAR "B2B" (BR-FR-20), fuera de la nota única de Peppol', () => {
        expect(cii(fr('fr-ctc-services').source)).toContain('<ram:IncludedNote><ram:Content>B2B</ram:Content><ram:SubjectCode>BAR</ram:SubjectCode></ram:IncludedNote>');
        expect(ubl(fr('fr-ctc-services').source)).not.toContain('B2B');
    });

    it('cliente por SIRET: SIREN como registro legal (0002) y SIRET como identificador (0009)', () => {
        const buyer = fr('fr-ctc-mixte').source.recipient!;
        expect(partyIds(buyer, 'buyer')).toMatchObject({ legalId: { id: '552100554', scheme: '0002' }, identifiers: [{ id: '55210055400013', scheme: '0009' }] });
        const xml = cii(fr('fr-ctc-mixte').source);
        expect(xml).toContain('<ram:BuyerTradeParty><ram:GlobalID schemeID="0009">55210055400013</ram:GlobalID>');
        // Su dirección electrónica, la de su SIREN en el annuaire (BR-FR-12/21).
        expect(assessEInvoice(fr('fr-ctc-mixte').source).invoice?.buyer.electronicAddress).toEqual({ scheme: '0225', id: '552100554' });
        expect(sirenDe(buyer)).toEqual({ siren: '552100554', siret: '55210055400013' });
    });

    it('una dirección del cliente fuera del annuaire se sustituye por la de su SIREN', () => {
        const src = clone(fr('fr-ctc-services').source);
        src.recipient = { ...src.recipient!, electronicAddress: { scheme: 'EM', id: 'achats@dupont.fr' } };
        expect(assessEInvoice(src).invoice?.buyer.electronicAddress).toEqual({ scheme: '0225', id: '404833048' });
    });

    it('dirección de entrega: solo si difiere del cliente y nunca en una prestación de servicios', () => {
        expect(cii(fr('fr-ctc-mixte').source)).toContain('<ram:LineOne>ZA des Trois Moulins, lot 7</ram:LineOne>');
        const servicios = clone(fr('fr-ctc-services').source);
        servicios.deliveryAddress = { line1: '1 rue Neuve', city: 'Lyon', postalCode: '69001', countryCode: 'FR' };
        expect(cii(servicios)).not.toContain('1 rue Neuve');
        const misma = clone(fr('fr-ctc-mixte').source);
        misma.deliveryAddress = { ...misma.recipient!.address! };
        expect(cii(misma)).not.toContain('ShipToTradeParty');
        const incompleta = clone(fr('fr-ctc-mixte').source);
        incompleta.deliveryAddress = { line1: 'Entrepôt', countryCode: 'FR' };
        expect(assessEInvoice(incompleta).problems.map((x) => x.code)).toContain('delivery_address');
        expect(entregaDistinta(null, misma.recipient!.address)).toBe(false);
    });

    it('precio bruto (BT-148) y neto con seis decimales como máximo (BR-FR-DEC-03)', () => {
        const xml = cii(fr('fr-ctc-mixte').source);
        expect(xml).toContain('<ram:GrossPriceProductTradePrice><ram:ChargeAmount>245.5</ram:ChargeAmount></ram:GrossPriceProductTradePrice><ram:NetPriceProductTradePrice><ram:ChargeAmount>245.5</ram:ChargeAmount>');
        for (const m of xml.matchAll(/<ram:ChargeAmount>([^<]+)</g)) expect(decimales(Number(m[1]))).toBeLessThanOrEqual(6);
    });

    it('qué operación va por la plataforma: B2B entre empresas francesas, el resto se reporta', () => {
        const seller = fr('fr-ctc-services').source.issuer!;
        expect(fluxFr(seller, fr('fr-ctc-services').source.recipient)).toBe('B2B');
        expect(fluxFr(seller, { legalName: 'Mme Durand', address: { countryCode: 'FR' } })).toBe('B2C');
        expect(fluxFr(seller, { legalName: 'Acme GmbH', taxId: 'DE136695976', address: { countryCode: 'DE' } })).toBe('B2BINT');
        expect(fluxFr(seller, { legalName: 'John Doe', address: { countryCode: 'US' } })).toBe('B2C');
        expect(fluxFr({ legalName: 'X', address: { countryCode: 'ES' } }, seller)).toBeNull();
        const b2c = clone(fr('fr-ctc-services').source);
        b2c.recipient = { legalName: 'Mme Durand', address: { line1: '2 rue Basse', city: 'Lyon', postalCode: '69002', countryCode: 'FR' } };
        expect(codes(b2c)).toContain('fr_not_b2b');
    });

    it('falla cerrado con el motivo: naturaleza, SIREN, número, tasa, cantidad, divisa', () => {
        const base = fr('fr-ctc-services').source;
        const sinNaturaleza = clone(base);
        sinNaturaleza.lines = sinNaturaleza.lines.map(({ nature: _n, ...l }) => l);
        expect(codes(sinNaturaleza)).toContain('fr_operation_category');

        const numero = clone(base);
        numero.invoiceNumber = 'F 2026 #201';
        expect(codes(numero)).toContain('fr_invoice_number');

        const tasa = clone(base);
        tasa.lines = tasa.lines.map((l) => ({ ...l, taxRate: 0.19, taxAmount: Math.round(l.subtotal * 19) / 100, total: l.subtotal + Math.round(l.subtotal * 19) / 100 }));
        expect(codes(tasa)).toContain('fr_vat_rate');
        expect(tasaFrancesa(0.055)).toBe(true);
        expect(tasaFrancesa(0.021)).toBe(true);
        expect(tasaFrancesa(0.19)).toBe(false);

        const cantidad = clone(base);
        cantidad.lines = [{ ...cantidad.lines[0], quantity: 1.23456 }, ...cantidad.lines.slice(1)];
        expect(codes(cantidad)).toContain('fr_quantity');
        expect(decimales(1.2345)).toBe(4);
        expect(decimales(1e-7)).toBe(7);

        const usd = clone(fr('fr-ctc-biens-usd').source);
        usd.ledgerCurrency = 'USD';
        usd.fxRate = null;
        expect(codes(usd)).toContain('fr_tax_currency');

        const sinSiren = clone(base);
        sinSiren.issuer = { ...sinSiren.issuer!, taxId: undefined, legalRegistrationId: undefined };
        expect(codes(sinSiren)).toContain('fr_seller_siren');
    });
});

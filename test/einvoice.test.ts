// Factura electrónica europea (EN 16931): modelo, serializadores y Factur-X.
//
// Esto es lo rápido y sin red. La validación contra los artefactos oficiales
// (KoSIT/XRechnung, schematron CEN, Peppol, Factur-X, veraPDF) la hace
// `npm run security:einvoice` sobre las MISMAS muestras de
// `helpers/einvoice-samples.ts`.

import { describe, expect, it } from 'vitest';
import { EINVOICE_SAMPLES, DE_SELLER, FR_SELLER, sampleLine, samplePdfInput } from './helpers/einvoice-samples';
import {
    assessEInvoice, calendarDay, formatProblems, frVatFromSiren, isEInvoiceFormat, isoDayIn, lineVat, partyIds, unitPrice,
    type EInvoiceSource,
} from '../src/lib/fiscal/einvoice/model';
import { serializeUbl, UBL_CUSTOMIZATION, UBL_PROFILE_ID } from '../src/lib/fiscal/einvoice/ubl';
import { serializeCii, CII_GUIDELINE } from '../src/lib/fiscal/einvoice/cii';
import { buildFacturX, FACTURX_FILENAME } from '../src/lib/fiscal/einvoice/facturx';
import { einvoiceEmailMode, normalizeBic, normalizeEInvoiceAddress, splitEInvoiceAddress } from '../src/lib/fiscal/einvoice/codes';
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
                const lines = inv.lines.filter((l) => l.category === v.category && (v.category !== 'S' || l.rate === v.rate));
                const allowance = inv.allowances.filter((x) => x.category === v.category && x.rate === v.rate);
                // BR-S-08 y hermanas: base del grupo = Σ BT-131 − Σ BT-92 del grupo.
                expect(cents(v.taxable)).toBe(sum(lines.map((l) => l.netAmount)) - sum(allowance.map((x) => x.amount)));
                // BR-CO-17 (tolerancia de una unidad del schematron CEN 1.3.16).
                if (v.category === 'S') expect(Math.abs(v.tax - (v.taxable * v.rate) / 100)).toBeLessThan(1);
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
        expect(isEInvoiceFormat('peppol')).toBe(true);
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

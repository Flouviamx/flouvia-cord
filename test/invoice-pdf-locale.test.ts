import { describe, expect, it } from 'vitest';
import { inflateSync } from 'node:zlib';
import { createInvoicePdf, docLangFor, reverseChargeNotice, type InvoicePdfInput } from '../src/lib/fiscal/invoice-pdf';

// El texto de las páginas va comprimido; se descomprime para buscar en él.
function pdfText(pdf: Buffer): string {
    const raw = pdf.toString('latin1');
    return [...raw.matchAll(/stream\n([\s\S]*?)\nendstream/g)]
        .map((m) => { try { return inflateSync(Buffer.from(m[1], 'latin1')).toString('latin1'); } catch { return ''; } })
        .join('\n');
}

const base = (over: Partial<InvoicePdfInput>): InvoicePdfInput => ({
    invoiceNumber: 'F-2026-0001',
    countryCode: 'FR',
    currency: 'EUR',
    issuedAt: new Date('2026-10-07T12:00:00Z'),
    issuer: { legalName: 'Atelier Lumière SAS', taxId: 'FR40303265045', address: { countryCode: 'FR', city: 'Paris' } },
    recipient: { legalName: 'Kunde GmbH', taxId: 'DE136695976', address: { countryCode: 'DE', city: 'Berlin' } },
    lines: [{ description: 'Conseil', quantity: 1, unitPrice: 1000, taxRate: 0, subtotal: 1000, taxAmount: 0, total: 1000 }],
    subtotal: 1000,
    taxTotal: 0,
    total: 1000,
    ...over,
});

describe('idioma y menciones legales del PDF de factura', () => {
    it('elige la lengua del país emisor, no solo español o inglés', () => {
        expect(docLangFor('fr-FR')).toBe('fr');
        expect(docLangFor('de-DE')).toBe('de');
        expect(docLangFor('pt-BR')).toBe('pt');
        expect(docLangFor('es-MX')).toBe('es');
        expect(docLangFor('en-GB')).toBe('en');
        expect(docLangFor('en-CA')).toBe('en');
    });

    it('una factura francesa sale en francés con autoliquidación y las menciones B2B', () => {
        const text = pdfText(createInvoicePdf(base({ paymentTerms: 'net30' })));
        expect(text).toContain('FACTURE');
        expect(text).toContain('Total HT');
        expect(text).toContain('30 jours');
        expect(text).toContain('Autoliquidation');
        expect(text).toContain('L441-10');
        expect(text).not.toContain('Ley 37/1992');
        expect(text).not.toContain('INVOICE');
    });

    it('una factura alemana usa la mención de § 13b y nunca cita la ley española', () => {
        const text = pdfText(createInvoicePdf(base({
            countryCode: 'DE',
            issuer: { legalName: 'Beispiel GmbH', taxId: 'DE136695976', address: { countryCode: 'DE' } },
            recipient: { legalName: 'Client SARL', taxId: 'FR40303265045', address: { countryCode: 'FR' } },
        })));
        expect(text).toContain('RECHNUNG');
        expect(text).toContain('Steuerschuldnerschaft des Leistungsempf');
        expect(text).not.toContain('Ley 37/1992');
        expect(reverseChargeNotice('IT', 'en')).toContain('Directive 2006/112/EC');
    });

    it('la mención B2B francesa no aparece en una venta a un consumidor', () => {
        const text = pdfText(createInvoicePdf(base({
            recipient: { legalName: 'Jean Dupont', address: { countryCode: 'FR' } },
            lines: [{ description: 'Conseil', quantity: 1, unitPrice: 1000, taxRate: 0.2, subtotal: 1000, taxAmount: 200, total: 1200 }],
            taxTotal: 200, total: 1200,
        })));
        expect(text).not.toContain('L441-10');
        expect(text).toContain('TVA');
    });

    it('fecha la expedición en la zona del emisor y no corre el vencimiento', () => {
        // 01:30 UTC del 8 de octubre = 19:30 del 7 de octubre en Ciudad de México.
        const text = pdfText(createInvoicePdf(base({
            countryCode: 'MX',
            currency: 'MXN',
            issuer: { legalName: 'Taller Norte', address: { countryCode: 'MX' } },
            recipient: { legalName: 'Cliente', address: { countryCode: 'MX' } },
            issuedAt: new Date('2026-10-08T01:30:00Z'),
            timeZone: 'America/Mexico_City',
            dueDate: '2026-11-07',
            paymentTerms: 'contado',
        })));
        expect(text).toContain('7 de octubre de 2026');
        expect(text).not.toContain('8 de octubre de 2026');
        expect(text).toContain('7 nov 2026');
        expect(text).toContain('Contado');
    });

    it('traduce las condiciones en inglés en vez de imprimir "Contado"', () => {
        const text = pdfText(createInvoicePdf(base({
            countryCode: 'US',
            currency: 'USD',
            issuer: { legalName: 'Sample Studio', address: { countryCode: 'US' } },
            recipient: { legalName: 'Buyer', address: { countryCode: 'US' } },
            paymentTerms: 'contado',
        })));
        expect(text).toContain('Due on receipt');
        expect(text).not.toContain('Contado');
    });

    it('la franquicia imprime su mención solo si el documento no cobra impuesto', () => {
        const fr = { legalName: 'Atelier Lumière', taxId: '303265045', vatRegime: 'small_business' as const, address: { countryCode: 'FR' } };
        const domestic = { legalName: 'Client SARL', address: { countryCode: 'FR' } };
        const exempt = pdfText(createInvoicePdf(base({ issuer: fr, recipient: domestic })));
        expect(exempt).toContain('293 B du CGI');
        const taxed = pdfText(createInvoicePdf(base({
            issuer: fr, recipient: domestic, taxTotal: 200, total: 1200,
            lines: [{ description: 'Conseil', quantity: 1, unitPrice: 1000, taxRate: 0.2, subtotal: 1000, taxAmount: 200, total: 1200 }],
        })));
        expect(taxed).not.toContain('293 B du CGI');
        const de = pdfText(createInvoicePdf(base({
            countryCode: 'DE',
            issuer: { legalName: 'Studio Berg', vatRegime: 'small_business', address: { countryCode: 'DE' } },
            recipient: { legalName: 'Kunde', address: { countryCode: 'DE' } },
        })));
        expect(de).toContain('19 UStG');
    });

    it('imprime las notas del documento y, en una nota de crédito, como motivo', () => {
        const invoice = pdfText(createInvoicePdf(base({ documentNotes: 'Pedido 4471', notes: 'Paiement par virement' })));
        expect(invoice).toContain('Pedido 4471');
        expect(invoice).toContain('CONDITIONS G');
        const credit = pdfText(createInvoicePdf(base({ creditNoteOfNumber: 'F-2026-0001', documentNotes: 'Remise commerciale' })));
        expect(credit).toContain('MOTIF');
        expect(credit).toContain('Remise commerciale');
    });

    it('en divisa extranjera declara también el impuesto en la moneda nacional (UE)', () => {
        const text = pdfText(createInvoicePdf(base({
            currency: 'USD', ledgerCurrency: 'EUR', fxRate: 0.9, ledgerTotal: 1080,
            recipient: { legalName: 'Client SARL', address: { countryCode: 'FR' } },
            taxTotal: 200, total: 1200,
            lines: [{ description: 'Conseil', quantity: 1, unitPrice: 1000, taxRate: 0.2, subtotal: 1000, taxAmount: 200, total: 1200 }],
        })));
        expect(text).toMatch(/TVA EUR: 180,00/);
    });

    it('factura española con Verifactu: QR tributario arriba y total de factura separado del total a pagar', () => {
        const text = pdfText(createInvoicePdf(base({
            countryCode: 'ES', invoiceNumber: 'F2026-000001',
            issuer: { legalName: 'Estudio Sol SL', taxId: 'B12345674', address: { countryCode: 'ES' } },
            recipient: { legalName: 'Cliente SA', taxId: 'A58818501', address: { countryCode: 'ES' } },
            lines: [{ description: 'Diseño', quantity: 1, unitPrice: 1000, taxRate: 0.21, subtotal: 1000, taxAmount: 210, total: 1210 }],
            subtotal: 1000, taxTotal: 210, total: 1060,
            retenciones: [{ nombre: 'IRPF 15%', tipo: 'ret_isr', tasa: 0.15, base: 1000, monto: 150 }],
            verifactu: { qrUrl: 'https://prewww2.aeat.es/wlpl/TIKE-CONT/ValidarQR?nif=B12345674&numserie=F2026-000001&fecha=07-10-2026&importe=1210.00',
                huella: 'A'.repeat(64), leyenda: 'Factura verificable en la sede electrónica de la AEAT', leyendaCorta: 'VERI*FACTU' },
        })));
        expect(text).toContain('QR tributario:');
        expect(text).toContain('Factura verificable en la sede');
        expect(text).toContain('Importe total factura');
        expect(text).toContain('TOTAL A PAGAR');
        // El QR va antes que las partes (el emisor ya sale en la cabecera).
        expect(text.indexOf('QR tributario:')).toBeLessThan(text.indexOf('Cliente SA'));
    });
});

import { describe, expect, it } from 'vitest';
import { inflateSync } from 'node:zlib';
import { exemptionReasonFor, EXEMPTION_INFO, EXEMPTION_REASONS } from '../src/lib/fiscal/exemption';
import { taxOptionIndex } from '../src/lib/tax-components';
import { parseInvoiceItems } from '../src/lib/fiscal/invoices';
import { createInvoicePdf } from '../src/lib/fiscal/invoice-pdf';
import { buildDesglose } from '../src/lib/fiscal/verifactu/desglose';
import { taxPresetsFor } from '../src/lib/countries';

function pdfText(pdf: Buffer): string {
    const raw = pdf.toString('latin1');
    return [...raw.matchAll(/stream\n([\s\S]*?)\nendstream/g)]
        .map((m) => { try { return inflateSync(Buffer.from(m[1], 'latin1')).toString('latin1'); } catch { return ''; } })
        .join('\n');
}

describe('causa de exención por concepto', () => {
    it('solo se conserva en España, en una línea al 0 % y con un código válido', () => {
        expect(exemptionReasonFor('ES', 'e2', 0)).toBe('E2');
        expect(exemptionReasonFor('ES', 'E2', 0.21)).toBeNull();
        expect(exemptionReasonFor('ES', 'E7', 0)).toBeNull();
        expect(exemptionReasonFor('FR', 'E2', 0)).toBeNull();
        expect(exemptionReasonFor('ES', '', 0)).toBeNull();
    });

    it('cada código tiene su mención legal y coincide con lo que acepta el registro', () => {
        for (const c of EXEMPTION_REASONS) expect(EXEMPTION_INFO[c].mencion).toMatch(/Ley 37\/1992/);
    });

    it('el catálogo de España siembra las causas habituales en perfiles exentos', () => {
        const causas = taxPresetsFor('ES').filter((p) => p.exemptionReason).map((p) => [p.kind, p.exemptionReason]);
        expect(causas).toEqual([['exento', 'E2'], ['exento', 'E5'], ['exento', 'E1'], ['exento', 'S2']]);
    });

    it('el selector distingue dos opciones al 0 % por su causa', () => {
        const opciones = [
            { rate: 0, exemptionReason: null }, { rate: 0, exemptionReason: 'E2' }, { rate: 0.21, exemptionReason: null },
        ];
        expect(taxOptionIndex(opciones, 0, 'E2')).toBe(1);
        expect(taxOptionIndex(opciones, 0, null)).toBe(0);
        // Una causa que ya no está en el catálogo cae a la primera de su tasa.
        expect(taxOptionIndex(opciones, 0, 'E5')).toBe(0);
        expect(taxOptionIndex(opciones, 0.1, null)).toBe(-1);
    });

    it('la API recibe la causa con cada concepto', () => {
        const [linea] = parseInvoiceItems([{ descripcion: 'Maquinaria', cantidad: 1, precio_unitario: 100, tax_rate: 0, exemption_reason: 'E2' }]);
        expect(linea.exemptionReason).toBe('E2');
    });

    it('el registro Verifactu declara la causa elegida y la factura cita su artículo', () => {
        const lines = [{ description: 'Maquinaria', quantity: 1, unitPrice: 1000, taxRate: 0, subtotal: 1000, taxAmount: 0, total: 1000, exemptionReason: 'E2' }];
        const recipient = { legalName: 'Acme Inc.', taxId: '12-3456789', address: { countryCode: 'US' } };
        const { desglose } = buildDesglose(lines as any, {
            destinatario: { xml: null, clase: 'extranjero', pais: 'US' }, fechaExpedicion: '07-10-2026', signo: 1, aEur: 1,
        });
        expect(desglose[0]).toMatchObject({ claveRegimen: '02', operacionExenta: 'E2' });

        const text = pdfText(createInvoicePdf({
            invoiceNumber: 'F2026-000001', countryCode: 'ES', currency: 'EUR', issuedAt: new Date('2026-10-07T12:00:00Z'),
            issuer: { legalName: 'Talleres Norte SL', taxId: 'B12345674', address: { countryCode: 'ES' } },
            recipient, lines, subtotal: 1000, taxTotal: 0, total: 1000,
        }));
        expect(text).toContain('art. 21 Ley 37/1992');
    });
});

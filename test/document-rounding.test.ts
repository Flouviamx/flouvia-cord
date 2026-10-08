import { describe, expect, it } from 'vitest';
import { calculateDocumentTotals } from '../packages/elements/src/engine';
import { roundDocumentTotals, roundTo } from '../src/lib/document-rounding';
import { mexicoItems } from '../src/lib/fiscal/providers/mexico-items';
import type { FiscalDocumentRequest } from '../src/lib/fiscal';

const linea = (precio: number, tasa = 0.16, cantidad = 1) => ({
    descripcion: 'Concepto', cantidad, precio_unitario: precio, precio_negociado: null, tax_rate: tasa,
});

function cfdi(doc: ReturnType<typeof roundDocumentTotals>): FiscalDocumentRequest {
    return {
        documentId: 'doc-a', invoiceNumber: 'F-1', idempotencyKey: 'k', orgId: 'org-a', quoteId: 'doc-a', countryCode: 'MX',
        issuer: { legalName: 'Emisor' }, recipient: { legalName: 'Receptor', taxId: 'AAA010101AAA' },
        lines: doc.lines,
        totals: {
            subtotal: doc.subtotal, taxes: doc.taxes, total: doc.total, currency: 'MXN',
            ...(doc.retencionTotal > 0 ? { retenciones: doc.retenciones, retencionTotal: doc.retencionTotal } : {}),
        },
        issuedAt: '2026-10-08',
    };
}

const suma = (xs: number[]) => roundTo(xs.reduce((s, x) => s + x, 0));

describe('documento = suma de líneas redondeadas', () => {
    it('10 conceptos de 10.01 al 16% cuadran y pasan el validador del CFDI', () => {
        const crudos = calculateDocumentTotals(Array.from({ length: 10 }, () => linea(10.01)));
        // El caso que originó el arreglo: el total crudo daba IVA 16.02.
        expect(roundTo(crudos.impuestos)).toBe(16.02);
        const doc = roundDocumentTotals(crudos);
        expect(doc.taxes).toBe(suma(doc.lines.map((l) => l.taxAmount)));
        expect(doc.taxes).toBe(16);
        expect(doc.total).toBe(116.1);
        expect(() => mexicoItems(cfdi(doc))).not.toThrow();
    });

    it('precios con IVA incluido: la base del documento es la suma de bases', () => {
        const crudos = calculateDocumentTotals(Array.from({ length: 5 }, () => linea(100)), { ivaIncluido: true });
        const doc = roundDocumentTotals(crudos);
        expect(doc.subtotal).toBe(suma(doc.lines.map((l) => l.subtotal)));
        expect(doc.subtotal).toBe(431.05);
        expect(() => mexicoItems(cfdi(doc))).not.toThrow();
    });

    it('tasas mezcladas y retenciones siguen cuadrando', () => {
        const crudos = calculateDocumentTotals(
            [linea(33.33, 0.16, 3), linea(19.99, 0.08, 7), linea(12.5, 0, 2), linea(0.07, 0.16, 13)],
            { retenciones: [{ nombre: 'Ret IVA', tasa: 0.10667, tipo: 'ret_iva' }, { nombre: 'Ret ISR', tasa: 0.0125, tipo: 'ret_isr' }] },
        );
        const doc = roundDocumentTotals(crudos);
        expect(doc.total).toBe(roundTo(doc.subtotal + doc.taxes - doc.retencionTotal));
        expect(suma(doc.byRate.map((t) => t.impuesto))).toBe(doc.taxes);
        expect(() => mexicoItems(cfdi(doc))).not.toThrow();
    });

    it('divisas sin decimales no inventan centavos', () => {
        const doc = roundDocumentTotals(calculateDocumentTotals([linea(999, 0.19)]), 0);
        expect(doc.taxes).toBe(190);
        expect(doc.total).toBe(1189);
        expect(Number.isInteger(doc.total)).toBe(true);
    });
});

describe('reintento de una emisión que falló con certeza', async () => {
    const { isRetryableIssuanceError } = await import('../src/lib/fiscal/invoices');
    const base = { lifecycle: 'draft', status: 'error', cotizacion_id: null, provider_data: {}, provider_document_id: null };

    it('un rechazo local o del PAC se puede corregir', () => {
        expect(isRetryableIssuanceError({ ...base, provider_document_id: 'err_local_doc-a', provider_data: { delivery_uncertain: false } })).toBe(true);
        expect(isRetryableIssuanceError({ ...base, provider_document_id: 'err_mx_doc-a' })).toBe(true);
    });

    it('una entrega incierta, una factura de cotización o una emitida no', () => {
        expect(isRetryableIssuanceError({ ...base, provider_document_id: 'err_mx_doc-a', provider_data: { delivery_uncertain: true } })).toBe(false);
        expect(isRetryableIssuanceError({ ...base, cotizacion_id: 'q-1' })).toBe(false);
        expect(isRetryableIssuanceError({ ...base, status: 'issued' })).toBe(false);
        expect(isRetryableIssuanceError({ ...base, provider_document_id: 'doc-a' })).toBe(false);
    });
});

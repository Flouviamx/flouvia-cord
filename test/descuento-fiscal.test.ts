// Descuento de documento en los rieles fiscales. Las líneas se arman con el
// MISMO motor que usan invoices.ts y emit.ts (buildLines replica su forma), y se
// verifica lo que cada riel recibe:
//   - CFDI (Facturapi): ValorUnitario bruto, `items[].discount` por concepto y
//     la base del impuesto = Importe − Descuento (Anexo 20 de CFDI 4.0);
//   - Verifactu: el desglose usa la base NETA y cuadra con subtotal + cuota;
//   - nota de crédito: el descuento se prorratea con la misma proporción;
//   - PDF: importe bruto por concepto y un renglón de descuento en los totales.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { inflateSync } from 'node:zlib';
import { calculateDocumentTotals, type DescuentoInput, type RetencionInput } from '../packages/elements/src/engine';
import type { FiscalDocumentRequest, FiscalLineItem } from '../src/lib/fiscal';
import { mexicoItems } from '../src/lib/fiscal/providers/mexico-items';
import { creditNoteBreakdown } from '../src/lib/fiscal/credit-note';
import { construirAlta } from '../src/lib/fiscal/verifactu/registro';

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Lo mismo que buildLines de invoices.ts: motor con roundLines y el contrato FiscalLineItem. */
function documento(
    lineas: { descripcion: string; cantidad: number; precio: number; tasa: number }[],
    descuento: DescuentoInput | null,
    opts: { ivaIncluido?: boolean; retenciones?: RetencionInput[] } = {},
) {
    const t = calculateDocumentTotals(lineas.map((l) => ({ descripcion: l.descripcion, cantidad: l.cantidad, precio_unitario: l.precio, tax_rate: l.tasa })), {
        roundLines: 2, descuento, ivaIncluido: opts.ivaIncluido, retenciones: opts.retenciones,
    });
    const lines: FiscalLineItem[] = t.lineas.map((l) => ({
        description: l.descripcion, quantity: l.cantidad,
        unitPrice: Math.round((l.cantidad ? l.base / l.cantidad : l.base) * 1e6) / 1e6,
        taxRate: l.tax_rate, subtotal: r2(l.base), taxAmount: r2(l.impuesto), total: r2(l.total),
        ...(l.descuento > 0 ? { discount: r2(l.descuento) } : {}),
    }));
    return {
        lines,
        totals: {
            subtotal: t.subtotal, taxes: t.impuestos, total: t.total, currency: 'MXN',
            ...(t.retencionTotal > 0 ? { retenciones: t.retenciones, retencionTotal: t.retencionTotal } : {}),
            ...(t.descuentoTotal > 0 ? { discountTotal: t.descuentoTotal } : {}),
        },
        descuentoTotal: t.descuentoTotal,
    };
}

const request = (doc: ReturnType<typeof documento>): FiscalDocumentRequest => ({
    documentId: 'doc-a', invoiceNumber: 'F-1', idempotencyKey: 'invoice:doc-a:v1', orgId: 'org-a', quoteId: 'doc-a', countryCode: 'MX',
    issuer: { legalName: 'Emisor' }, recipient: { legalName: 'Receptor', taxId: 'AAA010101AAA' },
    lines: doc.lines, totals: doc.totals, issuedAt: '2026-10-08', providerApiKey: 'sk_test_org_fixture',
});

describe('CFDI: descuento por concepto', () => {
    it('ValorUnitario bruto, descuento por concepto y base neta que cuadra con el impuesto', () => {
        const doc = documento([
            { descripcion: 'Consultoría', cantidad: 3, precio: 1000, tasa: 0.16 },
            { descripcion: 'Licencia', cantidad: 1, precio: 333.33, tasa: 0.16 },
            { descripcion: 'Libro', cantidad: 2, precio: 150, tasa: 0 },
        ], { tipo: 'porcentaje', valor: 12.5 });
        const items = mexicoItems(request(doc));
        expect(items.map((i: any) => i.discount)).toEqual(doc.lines.map((l) => l.discount));
        items.forEach((item: any, i) => {
            const importe = r2(item.quantity * item.product.price);
            // Importe (bruto) − Descuento = base neta del snapshot.
            expect(r2(importe - item.discount)).toBe(doc.lines[i].subtotal);
            expect(r2(doc.lines[i].subtotal * doc.lines[i].taxRate)).toBe(doc.lines[i].taxAmount);
        });
        // Comprobante@Descuento = Σ Concepto@Descuento = el descuento del documento.
        expect(r2(items.reduce((s: number, i: any) => s + i.discount, 0))).toBe(doc.descuentoTotal);
    });

    it('con impuesto incluido y retenciones sobre lo gravado, la retención usa la base neta', () => {
        const doc = documento([
            { descripcion: 'Servicio', cantidad: 1, precio: 11600, tasa: 0.16 },
            { descripcion: 'Exento', cantidad: 1, precio: 500, tasa: 0 },
        ], { tipo: 'monto', valor: 1000 }, {
            ivaIncluido: true,
            retenciones: [{ nombre: 'Retención IVA', tasa: 0.106667, tipo: 'ret_iva', base: 'gravado' }],
        });
        const items = mexicoItems(request(doc));
        expect(items[0].product.taxes[1]).toMatchObject({ type: 'IVA', withholding: true });
        expect(items[1].product.taxes).toHaveLength(1);
        expect(r2(items.reduce((s: number, i: any) => s + (i.discount || 0), 0))).toBe(doc.descuentoTotal);
    });

    it('un concepto que el descuento deja en cero no se manda al SAT', () => {
        const doc = documento([{ descripcion: 'Regalo', cantidad: 1, precio: 100, tasa: 0.16 }], { tipo: 'porcentaje', valor: 100 });
        expect(() => mexicoItems(request(doc))).toThrow(/base cero/);
    });

    it('rechaza un descuento negativo en el snapshot', () => {
        const doc = documento([{ descripcion: 'X', cantidad: 1, precio: 100, tasa: 0.16 }], null);
        doc.lines[0] = { ...doc.lines[0], discount: -5 };
        expect(() => mexicoItems(request(doc))).toThrow(/descuento/);
    });
});

describe('CFDI: lo que recibe el PAC', () => {
    let fetchMock: ReturnType<typeof vi.fn>;
    beforeEach(() => {
        vi.resetModules(); vi.stubEnv('FACTURAPI_KEY', ''); vi.stubEnv('FACTURAPI_API_KEY', '');
        fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: 'inv', uuid: '39c85a3f-275b-4341-b259-e8971d9f8a94', status: 'valid' })));
        vi.stubGlobal('fetch', fetchMock);
    });
    afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

    it('cada concepto lleva `discount` y precio sin impuesto', async () => {
        const doc = documento([{ descripcion: 'Servicio', cantidad: 2, precio: 500, tasa: 0.16 }], { tipo: 'monto', valor: 100 });
        const { MexicoSatProvider } = await import('../src/lib/fiscal/providers/MexicoSatProvider');
        expect((await new MexicoSatProvider().issueDocument(request(doc))).success).toBe(true);
        const body = JSON.parse(fetchMock.mock.calls[0][1].body);
        expect(body.items[0]).toMatchObject({ quantity: 2, discount: 100, product: { price: 500, tax_included: false } });
    });
});

describe('nota de crédito', () => {
    it('prorratea el descuento de cada concepto con la misma proporción', () => {
        const doc = documento([
            { descripcion: 'A', cantidad: 1, precio: 1000, tasa: 0.16 },
            { descripcion: 'B', cantidad: 1, precio: 1000, tasa: 0.16 },
        ], { tipo: 'porcentaje', valor: 10 });
        const original = { total: doc.totals.total, subtotal: doc.totals.subtotal, tax_total: doc.totals.taxes, retencion_total: 0,
            currency: 'MXN', line_items_snapshot: doc.lines, retenciones_snapshot: [] };
        const mitad = creditNoteBreakdown(original, doc.totals.total / 2);
        expect(mitad.lines.map((l) => l.discount)).toEqual([50, 50]);
        expect(mitad.lines.map((l) => l.subtotal)).toEqual([450, 450]);
        // La nota sigue siendo timbrable: bruto − descuento = base.
        expect(() => mexicoItems({ ...request(doc), documentType: 'cfdi_egreso', lines: mitad.lines,
            totals: { subtotal: mitad.subtotal, taxes: mitad.taxes, total: doc.totals.total / 2, currency: 'MXN' } })).not.toThrow();
        // Una nota total conserva el snapshot tal cual.
        expect(creditNoteBreakdown(original, doc.totals.total).lines).toEqual(doc.lines);
    });

    it('una línea sin descuento no gana un `discount: 0`', () => {
        const doc = documento([{ descripcion: 'A', cantidad: 1, precio: 100, tasa: 0.16 }], null);
        const nota = creditNoteBreakdown({ total: 116, subtotal: 100, tax_total: 16, retencion_total: 0, currency: 'MXN',
            line_items_snapshot: doc.lines, retenciones_snapshot: [] }, 58);
        expect('discount' in nota.lines[0]).toBe(false);
    });
});

describe('Verifactu con descuento', () => {
    it('el desglose declara la base neta y el ImporteTotal cuadra con subtotal + cuota', () => {
        const doc = documento([
            { descripcion: 'Consultoría', cantidad: 1, precio: 1000, tasa: 0.21 },
            { descripcion: 'Formación', cantidad: 1, precio: 500, tasa: 0.1 },
        ], { tipo: 'monto', valor: 150 });
        const alta = construirAlta({
            emisor: { legalName: 'ACME SL', taxId: 'B12345674' },
            receptor: { legalName: 'Cliente SA', taxId: 'A58818501', address: { countryCode: 'ES' } },
            numSerie: 'F2026-000001', fechaExpedicion: '08-10-2026',
            lines: doc.lines, totals: { ...doc.totals, currency: 'EUR' }, entorno: 'pruebas',
        });
        expect(doc.descuentoTotal).toBe(150);
        const bases = alta.desglose.map((d: any) => Number(d.baseImponibleOimporteNoSujeto)).sort((a, b) => a - b);
        expect(bases).toEqual([450, 900]);
        expect(Number(alta.importeTotal)).toBe(r2(doc.totals.subtotal + doc.totals.taxes));
        expect(Number(alta.cuotaTotal)).toBe(doc.totals.taxes);
    });
});

describe('PDF de la factura', () => {
    it('dibuja el importe bruto, el renglón de descuento y no se sale de la página', async () => {
        const { createInvoicePdf } = await import('../src/lib/fiscal/invoice-pdf');
        const doc = documento([
            { descripcion: 'Consultoría', cantidad: 3, precio: 1000, tasa: 0.16 },
            { descripcion: 'Licencia', cantidad: 1, precio: 250, tasa: 0.16 },
        ], { tipo: 'porcentaje', valor: 10 });
        const pdf = createInvoicePdf({
            invoiceNumber: 'F-000001', countryCode: 'MX', currency: 'MXN',
            subtotal: doc.totals.subtotal, taxTotal: doc.totals.taxes, total: doc.totals.total,
            issuedAt: '2026-10-08', issuer: { legalName: 'Emisor SA' }, recipient: { legalName: 'Cliente SA' },
            lines: doc.lines, discountCode: 'BIENVENIDA10',
        });
        // El texto de las páginas va comprimido; se descomprime para buscar en él.
        const text = [...pdf.toString('latin1').matchAll(/stream\n([\s\S]*?)\nendstream/g)]
            .map((m) => { try { return inflateSync(Buffer.from(m[1], 'latin1')).toString('latin1'); } catch { return ''; } })
            .join('\n');
        // Los paréntesis van escapados dentro de una cadena PDF.
        expect(text).toContain('Descuento \\(BIENVENIDA10\\)');
        expect(text).toContain('IVA 16% \\267 base 2,925.00');
        // Subtotal bruto 3,250.00, descuento −325.00, importe bruto de la línea 3,000.00.
        expect(text).toContain('3,250.00');
        expect(text).toContain('325.00');
        expect(text).toContain('3,000.00');
    });
});

// IVA redondeado por DOCUMENTO (Chile) con el motor único: el modo del motor,
// la fuente única por país, el DTE del SII y los documentos ya emitidos.
//
// Fuente primaria (SII, Formato DTE v2.2 del 2019-07-10): campo 107 MntNeto
// "Suma de valores total de ítems afectos - descuentos globales + recargos
// globales"; campo 112 IVA "Valor num.= a Monto neto *tasa IVA"; MontoType es
// nonNegativeInteger. Con IVA redondeado por línea, una factura de varias
// líneas en CLP descuadraba seguido y el riel no la enviaba.
import { describe, expect, it } from 'vitest';
import { calculateDocumentTotals, calculateInvoiceTotals, type DocumentTotals, type TaxRounding } from '../packages/elements/src/engine';
import { getCountryProfile, taxRoundingFor, taxRoundingGuardado } from '../src/lib/countries';
import { armarBorrador, type EntradaDte } from '../src/lib/fiscal/latam/sii/dte';
import { RailDatosError } from '../src/lib/fiscal/latam/errores';
import { creditNoteBreakdown } from '../src/lib/fiscal/credit-note';
import { invoicePdfInput } from '../src/lib/fiscal/invoice-download';
import { quoteIva, quoteTotal, type Quote } from '../src/lib/quote';

const linea = (precio: number, tax_rate = 0.19, cantidad = 1) => ({ descripcion: 'Servicio', cantidad, precio_unitario: precio, tax_rate });
const unidades = (n: number) => Math.round(n);

/** Lo que `buildLines` (fiscal/invoices.ts) guarda en la factura a partir del motor. */
function factura(t: DocumentTotals) {
    return {
        lines: t.lineas.map((l) => ({
            description: l.descripcion, quantity: l.cantidad, unitPrice: l.base / l.cantidad, taxRate: l.tax_rate,
            subtotal: l.base, taxAmount: l.impuesto, total: l.total, ...(l.descuento > 0 ? { discount: l.descuento } : {}),
        })),
        totals: { subtotal: t.subtotal, taxes: t.impuestos, total: t.total, currency: 'CLP', discountTotal: t.descuentoTotal },
    };
}

const emisor = { rut: '76123456-0', razonSocial: 'Empresa de Prueba SpA', giro: 'Consultoría', acteco: [620200], direccion: 'Av. Providencia 1234', comuna: 'Providencia' };
const receptor = { rut: '77777777-7', razonSocial: 'Cliente Ltda.', giro: 'Comercio', direccion: 'San Diego 2222', comuna: 'La Florida', pais: 'CL' };
const dte = (f: ReturnType<typeof factura>, extra: Partial<EntradaDte> = {}) => armarBorrador({
    emisor, receptor, fechaEmision: '2026-10-09', lineas: f.lines as any, totales: f.totals as any, ...extra,
});
const totales = (items: ReturnType<typeof linea>[], taxRounding: TaxRounding, extra: Record<string, unknown> = {}) =>
    calculateDocumentTotals(items, { roundLines: 0, taxRounding, ...extra });

/** Generador determinista (LCG) para recorrer muchas facturas sin azar entre corridas. */
function* facturasDePrueba(n: number) {
    let x = 20261009;
    const rnd = () => (x = (x * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
    for (let k = 0; k < n; k++) {
        const lineas = 2 + Math.floor(rnd() * 4);
        yield Array.from({ length: lineas }, () => linea(500 + Math.floor(rnd() * 200_000), rnd() < 0.15 ? 0 : 0.19, 1 + Math.floor(rnd() * 3)));
    }
}

describe('motor: taxRounding', () => {
    it("'document' redondea una vez por tasa y reparte entre las líneas sin perder un peso", () => {
        const linea3 = [linea(1003), linea(1003), linea(1003)];
        const porLinea = totales(linea3, 'line');
        const porDocumento = totales(linea3, 'document');
        expect([porLinea.impuestos, porDocumento.impuestos]).toEqual([573, 572]);
        expect(porDocumento.impuestos).toBe(unidades(3009 * 0.19));
        expect(porDocumento.lineas.map((l) => l.impuesto)).toEqual([191, 191, 190]);
        expect(porDocumento.lineas.reduce((s, l) => s + l.impuesto, 0)).toBe(porDocumento.impuestos);
        expect(porDocumento.lineas.every((l) => l.total === l.base + l.impuesto)).toBe(true);
        expect(porDocumento.porTasa).toEqual([{ tasa: 0.19, base: 3009, impuesto: 572 }]);
        expect(porDocumento.total).toBe(3581);
    });

    it('cada tasa se redondea por separado; lo exento no lleva impuesto', () => {
        const t = totales([linea(1003), linea(1003), linea(5000, 0)], 'document');
        expect(t.porTasa).toEqual([{ tasa: 0, base: 5000, impuesto: 0 }, { tasa: 0.19, base: 2006, impuesto: 381 }]);
        expect(t.impuestos).toBe(381);
    });

    it('con descuento de documento el IVA sale de las bases ya descontadas', () => {
        const t = totales([linea(1003), linea(2007), linea(3011)], 'document', { descuento: { tipo: 'porcentaje', valor: 7 } });
        expect(t.subtotal).toBe(5600);
        expect(t.impuestos).toBe(unidades(5600 * 0.19));
        expect(t.descuentoTotal).toBe(421);
        expect(t.lineas.reduce((s, l) => s + l.impuesto, 0)).toBe(t.impuestos);
    });

    it('con precios con IVA incluido la base de la tasa se desagrega una sola vez', () => {
        const t = totales([linea(1190), linea(1195), linea(2000)], 'document', { ivaIncluido: true });
        expect(t.subtotal).toBe(unidades(4385 / 1.19));
        expect(t.impuestos).toBe(unidades(t.subtotal * 0.19));
        expect(t.lineas.reduce((s, l) => s + l.base, 0)).toBe(t.subtotal);
    });

    it("'line' sigue siendo el default y sin roundLines los dos modos coinciden", () => {
        const items = [linea(33.33, 0.16, 1.5), linea(10.07, 0.16), linea(99.99, 0.08)];
        expect(calculateDocumentTotals(items, { roundLines: 2 })).toEqual(calculateDocumentTotals(items, { roundLines: 2, taxRounding: 'line' }));
        expect(calculateDocumentTotals(items, { taxRounding: 'document' })).toEqual(calculateDocumentTotals(items));
        expect(() => calculateInvoiceTotals(items, { roundLines: 2, taxRounding: 'otro' as TaxRounding })).toThrow(RangeError);
    });
});

describe('una sola fuente por país', () => {
    it('Chile redondea por documento; los demás por línea', () => {
        expect(taxRoundingFor('CL')).toBe('document');
        expect(taxRoundingFor('cl')).toBe('document');
        expect(getCountryProfile('CL').taxRounding).toBe('document');
        for (const pais of ['MX', 'ES', 'US', 'AR', 'BR', 'CO', 'PE', 'DE', 'FR', 'GB', 'CA']) expect(taxRoundingFor(pais), pais).toBe('line');
        expect(taxRoundingFor('')).toBe('line');
        expect(taxRoundingFor('ZZ')).toBe('line');
    });

    it('la regla guardada con un documento: nulo es por línea (todo lo anterior)', () => {
        expect(taxRoundingGuardado(null)).toBe('line');
        expect(taxRoundingGuardado('line')).toBe('line');
        expect(taxRoundingGuardado('document')).toBe('document');
        expect(taxRoundingGuardado('otro')).toBe('line');
    });
});

describe('DTE: el IVA del documento', () => {
    it('las facturas que descuadraban con IVA por línea ahora pasan, y el DTE lleva el IVA del motor', () => {
        let descuadraban = 0;
        let total = 0;
        for (const items of facturasDePrueba(600)) {
            if (!items.some((l) => l.tax_rate > 0)) continue;
            total++;
            try { dte(factura(totales(items, 'line'))); } catch (e) {
                expect(e).toBeInstanceOf(RailDatosError);
                descuadraban++;
            }
            const doc = totales(items, taxRoundingFor('CL'));
            const b = dte(factura(doc));
            expect(b.iva).toBe(doc.impuestos);
            expect(b.total).toBe(doc.total);
        }
        // Con IVA por línea, una parte importante no se podía enviar.
        expect(descuadraban / total).toBeGreaterThan(0.2);
    });

    it('varias líneas en CLP con IVA', () => {
        const doc = totales([linea(1003), linea(1003), linea(1003)], 'document');
        expect(() => dte(factura(totales([linea(1003), linea(1003), linea(1003)], 'line')))).toThrow(/otra regla de redondeo/);
        expect(dte(factura(doc))).toMatchObject({ tipo: 33, neto: 3009, iva: 572, total: 3581 });
    });

    it('con descuento de documento', () => {
        const items = [linea(1003, 0.19, 3), linea(2007), linea(4999, 0)];
        const descuento = { tipo: 'monto' as const, valor: 1234 };
        const doc = totales(items, 'document', { descuento });
        const b = dte(factura(doc));
        expect(b).toMatchObject({ neto: doc.porTasa.find((p) => p.tasa === 0.19)!.base, iva: doc.impuestos, descuento: 1234 });
        expect(b.lineas.reduce((s, l) => s + l.descuento, 0)).toBe(1234);
    });

    it('nota de crédito parcial de una factura chilena', () => {
        const items = [linea(1003), linea(2017), linea(3011), linea(4999, 0)];
        const doc = totales(items, 'document');
        const f = factura(doc);
        const original = {
            country_code: 'CL', currency: 'CLP', total: doc.total, subtotal: doc.subtotal, tax_total: doc.impuestos,
            retencion_total: 0, retenciones_snapshot: [], line_items_snapshot: f.lines,
        };
        // Un importe parcial que conserva el desglose al redondear.
        let nota: ReturnType<typeof creditNoteBreakdown> | null = null;
        for (let monto = Math.floor(doc.total / 3); !nota && monto < doc.total; monto++) {
            try { nota = creditNoteBreakdown(original, monto); } catch { /* el siguiente */ }
        }
        expect(nota).not.toBeNull();
        const afectas = nota!.lines.filter((l) => l.taxRate > 0);
        expect(nota!.taxes).toBe(unidades(afectas.reduce((s, l) => s + l.subtotal, 0) * 0.19));
        const b = armarBorrador({
            emisor, receptor: {}, fechaEmision: '2026-10-10', lineas: nota!.lines as any,
            totales: { subtotal: nota!.subtotal, taxes: nota!.taxes, total: nota!.subtotal + nota!.taxes, currency: 'CLP' },
            notaCreditoDe: { tipo: 33, folio: 7, fechaEmision: '2026-10-09', total: doc.total, receptor: { ...receptor } },
        });
        expect(b).toMatchObject({ tipo: 61, iva: nota!.taxes, referencia: { codigo: 3 } });
    });
});

describe('documentos ya emitidos: el snapshot manda', () => {
    // Una factura chilena emitida ANTES del cambio, con IVA por línea (573 y no 572).
    const legado = totales([linea(1003), linea(1003), linea(1003)], 'line');
    const f = factura(legado);
    const fila = {
        id: '00000000-0000-4000-9000-000000000001', document_type: 'commercial_invoice', country_code: 'CL', currency: 'CLP',
        invoice_number: 'FA-1', subtotal: legado.subtotal, tax_total: legado.impuestos, total: legado.total, retencion_total: 0,
        retenciones_snapshot: [], line_items_snapshot: f.lines, issuer_snapshot: { legalName: 'Empresa' }, recipient_snapshot: { legalName: 'Cliente' },
        status: 'issued', lifecycle: 'open', issued_at: '2026-10-01T12:00:00Z', provider_data: {},
    };

    it('el PDF y la descarga usan los importes guardados, no un recálculo', async () => {
        const input = await invoicePdfInput('00000000-0000-4000-8000-000000000001', fila, false);
        expect([input.subtotal, input.taxTotal, input.total]).toEqual([3009, 573, 3582]);
        expect(input.lines.map((l: any) => l.taxAmount)).toEqual([191, 191, 191]);
    });

    it('una nota de crédito total reproduce la factura tal cual se emitió', () => {
        const nota = creditNoteBreakdown(fila, legado.total);
        expect(nota.lines).toEqual(f.lines);
        expect(nota.taxes).toBe(573);
    });

    it('una cotización guardada con la regla por línea se recalcula con esa regla', () => {
        const q = {
            id: 'q', folio: 'COT-1', cliente: 'C', clienteInicial: 'C', status: 'sent', terminos: '', vigencia: '', creada: '', token: 't',
            eventos: [], baseCurrency: 'CLP', iva_incluido: false,
            items: [1, 2, 3].map((i) => ({ id: String(i), descripcion: 'x', cantidad: 1, precioLista: 1003, precioNegociado: null, taxRate: 0.19 })),
        } as unknown as Quote;
        expect([quoteIva(q), quoteTotal(q)]).toEqual([573, 3582]);
        expect([quoteIva({ ...q, taxRounding: 'document' }), quoteTotal({ ...q, taxRounding: 'document' })]).toEqual([572, 3581]);
    });
});

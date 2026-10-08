import { describe, expect, it } from 'vitest';
import {
    firstInvalidLine, freeLine, lineFromProduct, linesFromKit, parseAmount, payloadItems,
    repriceForClient, setPrice, setQuantity, summarize, volumePrice, type CatalogProduct, type PricingContext,
} from '../src/lib/editor/core';

const tubo: CatalogProduct = {
    id: 'p1', nombre: 'Tubo', unidad: 'pieza', precio: 100, costo: 60,
    // Desordenados a propósito: el tramo más alto alcanzado gana.
    preciosVolumen: [{ min: 50, precio: 80 }, { min: 10, precio: 90 }],
};
const cemento: CatalogProduct = { id: 'p2', nombre: 'Cemento', unidad: 'saco', precio: 245.5, costo: 180 };
const ctx = (discountPct = 0, decimals = 2, b2b?: PricingContext['b2b']): PricingContext => ({ discountPct, decimals, b2b });

describe('precio por volumen', () => {
    it('toma el tramo más alto alcanzado y vuelve al bajar la cantidad', () => {
        const l = lineFromProduct(tubo, ctx(), 0.16);
        setQuantity(l, 60, ctx());
        expect(l.lista).toBe(80);
        setQuantity(l, 12, ctx());
        expect(l.lista).toBe(90);
        setQuantity(l, 2, ctx());
        expect(l.lista).toBe(100);
    });

    it('el descuento del cliente se aplica sobre el tramo vigente y no se pierde al cambiar cantidad', () => {
        const l = lineFromProduct(tubo, ctx(10), 0.16);
        expect(l.negociado).toBe(90);
        setQuantity(l, 10, ctx(10));
        expect(l.lista).toBe(90);
        expect(l.negociado).toBe(81);
    });

    it('volumePrice sin tramos devuelve la base', () => {
        expect(volumePrice(100, [], 999)).toEqual({ price: 100, min: 0 });
    });
});

describe('descuento y cambio de cliente', () => {
    it('respeta los decimales de la divisa', () => {
        const l = lineFromProduct({ ...cemento, precio: 999 }, ctx(15, 0), 0.19);
        expect(l.negociado).toBe(849);
    });

    it('cambiar de cliente no pisa un precio escrito a mano', () => {
        const a = lineFromProduct(tubo, ctx(10), 0.16);
        const b = lineFromProduct(cemento, ctx(10), 0.16);
        setPrice(b, 200);
        repriceForClient([a, b], ctx(0));
        expect(a.negociado).toBeNull();
        expect(b.negociado).toBe(200);
    });

    it('la lista B2B manda sobre el descuento', () => {
        const l = lineFromProduct(tubo, ctx(10, 2, (id) => (id === 'p1' ? 77 : null)), 0.16);
        expect(l.negociado).toBe(77);
        expect(l.b2b).toBe(true);
    });
});

describe('kits', () => {
    const catalogo = new Map([[tubo.id, tubo], [cemento.id, cemento]]);

    it('reparte el combo entre líneas de catálogo y lo protege del cambio de cliente', () => {
        const kit = { id: 'k', nombre: 'Kit', precioCombo: 300, items: [
            { productoId: 'p1', descripcion: 'Tubo', cantidad: 1, precio: 100, unidad: 'pieza' },
            { productoId: 'p2', descripcion: 'Cemento', cantidad: 1, precio: 245.5, unidad: 'saco' },
        ] };
        const { lines, ahorro } = linesFromKit(kit, 2, catalogo, ctx(), 0.16);
        expect(lines.map((l) => l.cantidad)).toEqual([2, 2]);
        expect(ahorro).toBeCloseTo((345.5 - 300) * 2);
        repriceForClient(lines, ctx(50));
        expect(lines.every((l) => l.negoTouched)).toBe(true);
        expect(lines[0].negociado).toBe(86.83);
    });

    it('una partida libre llega con precio pendiente, no en $0 decidido', () => {
        const kit = { id: 'k', nombre: 'Kit', precioCombo: null, items: [
            { productoId: null, descripcion: 'Flete', cantidad: 1, precio: null, unidad: null },
        ] };
        const { lines } = linesFromKit(kit, 1, catalogo, ctx(), 0.16);
        expect(firstInvalidLine(lines)?.problem).toBe('precio');
        setPrice(lines[0], 0);
        expect(firstInvalidLine(lines)).toBeNull();
    });
});

describe('validación y payload', () => {
    it('cantidades decimales valen; cero o vacías no', () => {
        const l = lineFromProduct(cemento, ctx(), 0.16);
        setQuantity(l, 1.5, ctx());
        expect(firstInvalidLine([l])).toBeNull();
        setQuantity(l, 0, ctx());
        expect(firstInvalidLine([l])?.problem).toBe('cantidad');
    });

    it('señala la línea libre sin descripción, no la primera', () => {
        const a = freeLine(0.16, { nombre: 'ok', precio: 10 });
        const b = freeLine(0.16, { precio: 10 });
        expect(firstInvalidLine([a, b])).toMatchObject({ index: 1, problem: 'descripcion' });
    });

    it('la línea libre manda su precio como lista y sin negociado', () => {
        const l = freeLine(0, { nombre: 'Servicio' });
        setPrice(l, 450);
        expect(payloadItems([l])[0]).toMatchObject({ producto_id: null, precio_unitario: 450, precio_negociado: null, tax_rate: 0 });
    });
});

describe('resumen', () => {
    it('la factura suma líneas redondeadas; la cotización usa el total crudo', () => {
        const lines = Array.from({ length: 10 }, () => freeLine(0.16, { nombre: 'x', precio: 10.01 }));
        const factura = summarize(lines, { ivaIncluido: false, retenciones: [], roundLinesTo: 2 });
        const cotizacion = summarize(lines, { ivaIncluido: false, retenciones: [], roundLinesTo: null });
        expect(factura.total).toBe(116.1);
        expect(cotizacion.total).toBeCloseTo(116.116);
        expect(factura.pieces).toBe(10);
    });

    it('cuenta lo descontado contra la lista', () => {
        const l = lineFromProduct(tubo, ctx(10), 0.16);
        setQuantity(l, 3, ctx(10));
        expect(summarize([l], { ivaIncluido: false, retenciones: [], roundLinesTo: null }).saved).toBeCloseTo(30);
    });
});

describe('parseAmount', () => {
    it.each([
        ['1,5', 1.5], ['1.5', 1.5], ['1,234.50', 1234.5], ['1.234,50', 1234.5], ['1,234', 1234], ['', null], ['abc', null], ['  12 ', 12],
    ])('%s → %s', (raw, expected) => {
        expect(parseAmount(raw as string)).toBe(expected);
    });
});

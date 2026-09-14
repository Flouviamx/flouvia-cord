import { describe, expect, it } from 'vitest';
import { quoteIva, quoteSubtotal, quoteTotal, type Quote, type QuoteItem } from '../src/lib/quote';

const item = (extra: Partial<QuoteItem> = {}): QuoteItem => ({
    descripcion: 'Servicio', cantidad: 1, unidad: 'pieza', precioLista: 1000, precioNegociado: null, ...extra,
});

const quote = (items: QuoteItem[], extra: Partial<Quote> = {}): Quote => ({
    id: 'q1', folio: 'COT-1', cliente: 'Cliente', clienteInicial: 'C', status: 'draft', terminos: 'Contado',
    vigencia: '', creada: '', token: 't', items, eventos: [], ...extra,
});

// Regla 23: la tasa es de la línea; la de la organización sólo cubre las líneas
// anteriores al impuesto por línea, y nunca hay una constante de respaldo.
describe('totales de la cotización', () => {
    it('usa la tasa de cada línea aunque la organización tenga otra', () => {
        const q = quote([item({ taxRate: 0.21 }), item({ taxRate: 0 })], { taxRateFallback: 0.16 });
        expect(quoteSubtotal(q)).toBeCloseTo(2000, 6);
        expect(quoteIva(q)).toBeCloseTo(210, 6);
        expect(quoteTotal(q)).toBeCloseTo(2210, 6);
    });

    it('las líneas sin tasa propia se calculan con la de la organización', () => {
        const q = quote([item()], { taxRateFallback: 0.08 });
        expect(quoteIva(q)).toBeCloseTo(80, 6);
    });

    it('sin tasa de línea ni de organización falla en vez de suponer 16%', () => {
        expect(() => quoteTotal(quote([item()]))).toThrow(/no tiene tasa/);
    });

    it('un listado sin líneas no necesita tasa', () => {
        expect(quoteTotal(quote([]))).toBe(0);
    });

    it('las líneas que el cliente excluyó no suman', () => {
        const q = quote([item({ taxRate: 0.16 }), item({ taxRate: 0.16, aprobado: false })]);
        expect(quoteTotal(q)).toBeCloseTo(1160, 6);
    });
});

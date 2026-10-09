// Descuento de DOCUMENTO en el motor único (calculateInvoiceTotals /
// calculateDocumentTotals): antes de impuestos, repartido en proporción al
// importe bruto de cada línea y, con redondeo, en unidades mínimas por mayor
// residuo — la suma de lo repartido es exactamente el descuento del documento.
import { describe, expect, it } from 'vitest';
import {
    calculateDocumentTotals,
    calculateInvoiceTotals,
    type DescuentoInput,
} from '../packages/elements/src/engine';

const linea = (cantidad: number, precio: number, tax_rate: number) => ({ descripcion: 'x', cantidad, precio_unitario: precio, tax_rate });
const centavos = (n: number, d = 2) => Math.round(n * 10 ** d);

describe('descuento de documento: porcentaje y monto', () => {
    it('un porcentaje se aplica antes de impuestos sobre la suma bruta', () => {
        const t = calculateInvoiceTotals([linea(1, 100, 0.16), linea(2, 50, 0.16)], {
            roundLines: 2, descuento: { tipo: 'porcentaje', valor: 10 },
        });
        expect(t.lineas.map((l) => l.descuento)).toEqual([10, 10]);
        expect(t.lineas.map((l) => l.base)).toEqual([90, 90]);
        expect(t.subtotal).toBe(180);
        expect(t.impuestos).toBe(28.8);
        expect(t.total).toBe(208.8);
        expect(t.descuentoTotal).toBe(20);
        expect(t.porTasa).toEqual([{ tasa: 0.16, base: 180, impuesto: 28.8 }]);
    });

    it('un monto se reparte por mayor residuo y suma exactamente el descuento', () => {
        const t = calculateInvoiceTotals([linea(1, 33.33, 0.16), linea(1, 33.33, 0.16), linea(1, 33.34, 0.16)], {
            roundLines: 2, descuento: { tipo: 'monto', valor: 10 },
        });
        expect(t.lineas.map((l) => l.descuento)).toEqual([3.33, 3.33, 3.34]);
        expect(t.descuentoTotal).toBe(10);
        expect(t.subtotal).toBe(90);
    });

    it('los empates se resuelven por orden de línea: el mismo documento reparte siempre igual', () => {
        const items = [linea(1, 10, 0.16), linea(1, 10, 0.16), linea(1, 10, 0.16)];
        const opts = { roundLines: 2, descuento: { tipo: 'monto', valor: 10 } as DescuentoInput };
        const a = calculateInvoiceTotals(items, opts);
        const b = calculateInvoiceTotals(items, opts);
        expect(a.lineas.map((l) => l.descuento)).toEqual([3.34, 3.33, 3.33]);
        expect(b).toEqual(a);
    });

    it('un monto mayor que el documento se topa en el bruto: nunca un total negativo', () => {
        const t = calculateDocumentTotals([linea(1, 100, 0.16), linea(1, 100, 0)], {
            roundLines: 2, descuento: { tipo: 'monto', valor: 500 },
        });
        expect(t.descuentoTotal).toBe(200);
        expect(t.lineas.map((l) => l.base)).toEqual([0, 0]);
        expect(t.total).toBe(0);
    });

    it('una línea sin importe no recibe descuento', () => {
        const t = calculateInvoiceTotals([linea(1, 0, 0.16), linea(1, 100, 0.16)], {
            roundLines: 2, descuento: { tipo: 'porcentaje', valor: 50 },
        });
        expect(t.lineas.map((l) => l.descuento)).toEqual([0, 50]);
    });

    it('sin redondeo el reparto es proporcional exacto', () => {
        const t = calculateInvoiceTotals([linea(1, 100, 0.16), linea(1, 50, 0.16)], {
            descuento: { tipo: 'porcentaje', valor: 10 },
        });
        expect(t.lineas.map((l) => l.descuento)).toEqual([10, 5]);
        expect(t.subtotal).toBeCloseTo(135, 10);
        expect(t.descuentoTotal).toBeCloseTo(15, 10);
    });
});

describe('descuento con precios que incluyen impuesto', () => {
    it('el monto rebaja lo que el cliente paga y la base se desagrega después', () => {
        const t = calculateInvoiceTotals([linea(1, 116, 0.16)], {
            ivaIncluido: true, roundLines: 2, descuento: { tipo: 'monto', valor: 11.6 },
        });
        expect(t.total).toBe(104.4);
        expect(t.subtotal).toBe(90);
        expect(t.impuestos).toBe(14.4);
        // Antes de impuestos: la base bajó de 100 a 90.
        expect(t.descuentoTotal).toBe(10);
        expect(t.lineas[0].base + t.lineas[0].descuento).toBe(100);
    });

    it('un porcentaje con impuesto incluido equivale al mismo porcentaje de la base', () => {
        const t = calculateInvoiceTotals([linea(1, 116, 0.16), linea(1, 121, 0.21)], {
            ivaIncluido: true, roundLines: 2, descuento: { tipo: 'porcentaje', valor: 10 },
        });
        expect(t.lineas.map((l) => l.base)).toEqual([90, 90]);
        expect(t.descuentoTotal).toBe(20);
        expect(t.total).toBe(213.3);
    });
});

describe('divisas sin decimales y con tres', () => {
    it('JPY: el reparto y los importes quedan en enteros', () => {
        const t = calculateDocumentTotals([linea(1, 1000, 0.1), linea(1, 999, 0.1)], {
            roundLines: 0, descuento: { tipo: 'porcentaje', valor: 10 },
        });
        expect(t.descuentoTotal).toBe(200);
        expect(t.lineas.map((l) => l.descuento)).toEqual([100, 100]);
        for (const n of [t.subtotal, t.impuestos, t.total, t.descuentoTotal, ...t.lineas.flatMap((l) => [l.base, l.impuesto, l.descuento])]) {
            expect(Number.isInteger(n)).toBe(true);
        }
        expect(t.subtotal).toBe(1799);
        expect(t.total).toBe(1979);
    });

    it('CLP: un monto con decimales se redondea a la divisa antes de repartir', () => {
        const t = calculateInvoiceTotals([linea(3, 10000, 0.19)], {
            roundLines: 0, descuento: { tipo: 'monto', valor: 1500.4 },
        });
        expect(t.descuentoTotal).toBe(1500);
        expect(t.subtotal).toBe(28500);
    });

    it('KWD: tres decimales, y la suma sigue siendo exacta', () => {
        const t = calculateInvoiceTotals([linea(3, 0.333, 0), linea(1, 1.001, 0)], {
            roundLines: 3, descuento: { tipo: 'monto', valor: 0.5 },
        });
        expect(t.lineas.map((l) => l.descuento)).toEqual([0.25, 0.25]);
        expect(centavos(t.descuentoTotal, 3)).toBe(500);
        expect(t.lineas.map((l) => l.base)).toEqual([0.749, 0.751]);
    });
});

describe('tasas mezcladas y retenciones', () => {
    it('las retenciones se calculan sobre las bases ya descontadas, incluida la base gravada', () => {
        const t = calculateDocumentTotals([linea(1, 1000, 0.16), linea(1, 1000, 0)], {
            roundLines: 2,
            descuento: { tipo: 'porcentaje', valor: 10 },
            retenciones: [
                { nombre: 'Retención IVA', tasa: 0.106667, tipo: 'ret_iva', base: 'gravado' },
                { nombre: 'Retención ISR', tasa: 0.1, tipo: 'ret_isr', base: 'subtotal' },
            ],
        });
        expect(t.lineas.map((l) => l.base)).toEqual([900, 900]);
        expect(t.porTasa).toEqual([
            { tasa: 0, base: 900, impuesto: 0 },
            { tasa: 0.16, base: 900, impuesto: 144 },
        ]);
        expect(t.retenciones.map((r) => [r.base, r.monto])).toEqual([[900, 96], [1800, 180]]);
        expect(t.total).toBe(1668);
    });
});

describe('sin descuento la aritmética no cambia', () => {
    const items = [linea(1.5, 33.33, 0.16), linea(3, 19.99, 0.08), linea(2, 7.77, 0)];
    for (const roundLines of [undefined, 2, 0]) {
        for (const ivaIncluido of [false, true]) {
            it(`roundLines=${roundLines} ivaIncluido=${ivaIncluido}`, () => {
                const sin = calculateDocumentTotals(items, { roundLines, ivaIncluido });
                for (const descuento of [null, undefined, { tipo: 'porcentaje', valor: 0 } as DescuentoInput, { tipo: 'monto', valor: 0 } as DescuentoInput]) {
                    expect(calculateDocumentTotals(items, { roundLines, ivaIncluido, descuento })).toEqual(sin);
                }
                expect(sin.descuentoTotal).toBe(0);
                expect(sin.lineas.every((l) => l.descuento === 0)).toBe(true);
            });
        }
    }
});

describe('invariantes con documentos al azar', () => {
    // Generador determinista: la prueba siempre recorre los mismos casos.
    let seed = 7;
    const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
    const rates = [0, 0.04, 0.08, 0.16, 0.21];

    it('el reparto suma el descuento exacto, ninguna línea queda negativa y bruto = neto + descuento', () => {
        for (let caso = 0; caso < 300; caso++) {
            const n = 1 + Math.floor(rnd() * 6);
            const items = Array.from({ length: n }, () => linea(1 + Math.floor(rnd() * 5), Math.round(rnd() * 100000) / 100, rates[Math.floor(rnd() * rates.length)]));
            const descuento: DescuentoInput = rnd() < 0.5
                ? { tipo: 'porcentaje', valor: Math.round(rnd() * 10000) / 100 }
                : { tipo: 'monto', valor: Math.round(rnd() * 200000) / 100 };
            const sin = calculateInvoiceTotals(items, { roundLines: 2 });
            const con = calculateInvoiceTotals(items, { roundLines: 2, descuento });
            const bruto = centavos(sin.subtotal);
            const esperado = descuento.tipo === 'porcentaje'
                ? Math.round(bruto * Number(descuento.valor) / 100)
                : Math.min(centavos(Number(descuento.valor)), bruto);
            expect(Math.abs(centavos(con.descuentoTotal) - esperado), JSON.stringify({ items, descuento })).toBeLessThanOrEqual(1);
            expect(centavos(con.lineas.reduce((s, l) => s + l.descuento, 0))).toBe(centavos(con.descuentoTotal));
            con.lineas.forEach((l, i) => {
                expect(l.base).toBeGreaterThanOrEqual(0);
                expect(l.descuento).toBeGreaterThanOrEqual(0);
                expect(centavos(l.base + l.descuento)).toBe(centavos(sin.lineas[i].base));
                expect(centavos(l.impuesto)).toBe(centavos(Math.round(l.base * l.tax_rate * 100 + Number.EPSILON) / 100));
            });
            expect(centavos(con.subtotal + con.descuentoTotal)).toBe(bruto);
        }
    });
});

describe('entradas inválidas fallan en voz alta', () => {
    const items = [linea(1, 100, 0.16)];
    it.each([
        [{ tipo: 'porcentaje', valor: 101 }],
        [{ tipo: 'porcentaje', valor: -1 }],
        [{ tipo: 'monto', valor: Number.NaN }],
        [{ tipo: 'monto', valor: 'abc' }],
        [{ tipo: 'regalo', valor: 10 }],
    ])('%j', (descuento) => {
        expect(() => calculateInvoiceTotals(items, { descuento: descuento as DescuentoInput })).toThrow(RangeError);
    });
});

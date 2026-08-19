// Impuestos por línea + retenciones — el motor único de cotizaciones y facturas.
//
// Dos bugs concretos originaron estos tests:
//
//   1. El catálogo `impuestos` existía por org y el editor de cotizaciones lo
//      ignoraba: leía la columna plana `orgs.iva_pct`. Configurar "IVA 8%
//      frontera" o "Exento" no cambiaba nada en el documento.
//   2. `orgs.retencion_iva_pct` / `retencion_isr_pct` se capturaban, se
//      guardaban, y no los leía nadie — ni los totales, ni el PDF, ni el CFDI.
//      El negocio creía estar reteniendo un dinero que nunca se restó.

import { describe, it, expect } from 'vitest';
import {
    calculateDocumentTotals,
    calculateInvoiceTotals,
} from '../packages/elements/src/engine';
import {
    TAX_PRESETS,
    getCountryProfile,
    hasTaxPreset,
    taxKindLabel,
    taxPresetsFor,
} from '../src/lib/countries';
import { defaultCountryTaxPct } from '../src/lib/impuestos';

const linea = (cantidad: number, precio: number, tax_rate: number) => ({
    descripcion: 'x', cantidad, precio_unitario: precio, tax_rate,
});

describe('impuesto por línea', () => {
    it('no aplana dos tasas distintas a un promedio', () => {
        // 1000 al 16% y 1000 exento. Aplanar daría 8% sobre 2000 = 160, que no
        // corresponde a ninguna de las dos líneas.
        const r = calculateInvoiceTotals([linea(1, 1000, 0.16), linea(1, 1000, 0)]);
        expect(r.subtotal).toBe(2000);
        expect(r.impuestos).toBe(160);
        expect(r.total).toBe(2160);
    });

    it('desglosa por tasa y el desglose suma exactamente el total', () => {
        const r = calculateInvoiceTotals([
            linea(1, 1000, 0.16), linea(2, 500, 0.16), linea(1, 300, 0),
        ]);
        expect(r.porTasa.map((t) => t.tasa)).toEqual([0, 0.16]);
        const sumaBases = r.porTasa.reduce((s, t) => s + t.base, 0);
        const sumaImp = r.porTasa.reduce((s, t) => s + t.impuesto, 0);
        expect(sumaBases).toBeCloseTo(r.subtotal, 10);
        expect(sumaImp).toBeCloseTo(r.impuestos, 10);
    });

    it('con precio impuesto-incluido desagrega cada línea con SU tasa', () => {
        // 1160 con IVA dentro al 16% → base 1000. 500 exento → base 500.
        // Desagregar ambas con una tasa promedio daría una base que no
        // corresponde a ninguna.
        const r = calculateInvoiceTotals(
            [linea(1, 1160, 0.16), linea(1, 500, 0)],
            { ivaIncluido: true },
        );
        expect(r.subtotal).toBeCloseTo(1500, 10);
        expect(r.impuestos).toBeCloseTo(160, 10);
        expect(r.total).toBeCloseTo(1660, 10);
    });

    it('lanza ante una tasa fuera de [0,1] en vez de calcular mal en silencio', () => {
        // 16 en vez de 0.16 es el error clásico. Un 500 explícito le gana a una
        // factura con 1600% de impuesto que nadie audita.
        expect(() => calculateInvoiceTotals([linea(1, 100, 16)])).toThrow(RangeError);
        expect(() => calculateInvoiceTotals([linea(1, 100, -0.1)])).toThrow(RangeError);
    });
});

describe('retenciones', () => {
    const RET_IVA = { nombre: 'Retención IVA', tipo: 'ret_iva', tasa: 0.106667 };
    const RET_ISR = { nombre: 'Retención ISR', tipo: 'ret_isr', tasa: 0.0125 };

    it('se RESTAN del total, no se suman', () => {
        const r = calculateDocumentTotals([linea(1, 1000, 0.16)], { retenciones: [RET_IVA] });
        expect(r.subtotal).toBe(1000);
        expect(r.impuestos).toBe(160);
        expect(r.retencionTotal).toBeCloseTo(106.667, 3);
        expect(r.total).toBeCloseTo(1053.333, 3);
        // El bug que se está previniendo: 1000 + 160 + 106.667 = 1266.667
        expect(r.total).toBeLessThan(r.subtotal + r.impuestos);
    });

    it('se calculan sobre el subtotal, no sobre el total con impuesto', () => {
        // En México la retención de IVA es 10.667% del valor de los actos, que
        // es exactamente 2/3 del IVA del 16%. Sobre el total daría otra cosa.
        const r = calculateDocumentTotals([linea(1, 1000, 0.16)], { retenciones: [RET_IVA] });
        expect(r.retenciones[0].base).toBe(1000);
        expect(r.retenciones[0].monto).toBeCloseTo(160 * 2 / 3, 2);
    });

    it('acumula varias retenciones y conserva el desglose', () => {
        const r = calculateDocumentTotals([linea(1, 1000, 0.16)], { retenciones: [RET_IVA, RET_ISR] });
        expect(r.retenciones).toHaveLength(2);
        expect(r.retencionTotal).toBeCloseTo(106.667 + 12.5, 3);
        expect(r.total).toBeCloseTo(1160 - 119.167, 2);
    });

    it('sin retenciones el total es idéntico al de una factura sin ellas', () => {
        const items = [linea(1, 1000, 0.16), linea(3, 250, 0)];
        const sin = calculateInvoiceTotals(items);
        const con = calculateDocumentTotals(items, { retenciones: [] });
        expect(con.total).toBe(sin.total);
        expect(con.retencionTotal).toBe(0);
        expect(con.retenciones).toEqual([]);
    });

    it('ignora una retención de tasa 0 en vez de imprimir un renglón vacío', () => {
        const r = calculateDocumentTotals([linea(1, 1000, 0.16)], {
            retenciones: [{ nombre: 'Ret. inactiva', tipo: 'ret_isr', tasa: 0 }],
        });
        expect(r.retenciones).toEqual([]);
        expect(r.total).toBe(1160);
    });

    it('lanza ante una tasa de retención fuera de [0,1]', () => {
        expect(() => calculateDocumentTotals([linea(1, 100, 0)], {
            retenciones: [{ nombre: 'mal', tasa: 10.667 }],
        })).toThrow(RangeError);
    });
});

describe('presets e identidad fiscal por país', () => {
    it('cada país con preset tiene exactamente un default de consumo', () => {
        for (const code of Object.keys(TAX_PRESETS)) {
            const presets = TAX_PRESETS[code as keyof typeof TAX_PRESETS]!;
            const defaults = presets.filter((p) => p.esDefault);
            expect(defaults, `${code} debe tener un solo default`).toHaveLength(1);
            expect(defaults[0].kind, `${code}: el default debe ser de consumo`).toBe('consumo');
        }
    });

    it('todo preset ofrece una tasa 0 — exento o zero-rated es legal en todos lados', () => {
        for (const code of Object.keys(TAX_PRESETS)) {
            const presets = TAX_PRESETS[code as keyof typeof TAX_PRESETS]!;
            expect(presets.some((p) => p.tasa === 0), `${code} sin tasa 0`).toBe(true);
        }
    });

    it('ninguna tasa de preset sale del rango 0–100', () => {
        for (const code of Object.keys(TAX_PRESETS)) {
            for (const p of TAX_PRESETS[code as keyof typeof TAX_PRESETS]!) {
                expect(p.tasa, `${code}/${p.nombre}`).toBeGreaterThanOrEqual(0);
                expect(p.tasa, `${code}/${p.nombre}`).toBeLessThanOrEqual(100);
            }
        }
    });

    it('México conserva su carril: IVA 16 default y las dos retenciones', () => {
        const mx = taxPresetsFor('MX');
        expect(mx.find((p) => p.esDefault)?.tasa).toBe(16);
        const ret = mx.filter((p) => p.kind === 'retencion');
        expect(ret.map((r) => r.tipo).sort()).toEqual(['ret_isr', 'ret_iva']);
        expect(defaultCountryTaxPct('MX')).toBe(16);
    });

    it('un país sin tasa nacional no se inventa una', () => {
        // Estados Unidos cobra sales tax por jurisdicción y Brasil combina ICMS
        // estatal con ISS municipal. Sugerir "la tasa nacional" sería inventarla.
        for (const code of ['US', 'BR']) {
            expect(hasTaxPreset(code), `${code} no debe tener preset`).toBe(false);
            expect(defaultCountryTaxPct(code)).toBe(0);
            // Aun así arranca con "Exento": no deja el catálogo sin nada usable.
            expect(taxPresetsFor(code)).toHaveLength(1);
            expect(taxPresetsFor(code)[0].tasa).toBe(0);
        }
    });

    it('el impuesto se llama como en cada país, no "IVA" en todos', () => {
        expect(taxKindLabel('consumo', 'es', 'MX')).toBe('IVA');
        expect(taxKindLabel('consumo', 'en', 'GB')).toBe('VAT');
        expect(taxKindLabel('consumo', 'en', 'AU')).toBe('GST');
        expect(taxKindLabel('consumo', 'en', 'US')).toBe('Sales tax');
        expect(taxKindLabel('consumo', 'es', 'PE')).toBe('IGV');
        expect(taxKindLabel('consumo', 'es', 'DO')).toBe('ITBIS');
    });

    it('la identidad fiscal se llama como en cada país, no "RFC" en todos', () => {
        expect(getCountryProfile('MX').taxIdLabel).toBe('RFC');
        expect(getCountryProfile('ES').taxIdLabel).toBe('NIF / CIF');
        expect(getCountryProfile('US').taxIdLabel).toBe('EIN / Tax ID');
        expect(getCountryProfile('AR').taxIdLabel).toBe('CUIT');
    });

    it('un país desconocido no explota: cae a un perfil usable', () => {
        expect(taxPresetsFor('ZZ')).toBeTruthy();
        expect(() => taxKindLabel('consumo', 'es', 'ZZ')).not.toThrow();
    });
});

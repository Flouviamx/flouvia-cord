import { describe, expect, it } from 'vitest';
import { canonicalTaxRate, splitTaxBucket, taxBreakdownRows, taxComponents, taxDisplayRows } from '../src/lib/tax-components';
import { canadaTaxPresets, caProvinceCode } from '../src/lib/countries';

describe('impuestos compuestos (Canadá)', () => {
    it('nombra cada tasa canadiense por sus impuestos', () => {
        expect(taxComponents('CA', 5)?.map((c) => c.nombre)).toEqual(['GST']);
        expect(taxComponents('CA', 13)?.map((c) => c.nombre)).toEqual(['HST']);
        expect(taxComponents('CA', 14.975000000000001)?.map((c) => c.nombre)).toEqual(['GST', 'QST']);
        expect(taxComponents('CA', 12, { region: 'BC' })?.map((c) => c.nombre)).toEqual(['GST', 'PST']);
        expect(taxComponents('CA', 12, { region: 'MB' })?.map((c) => c.nombre)).toEqual(['GST', 'RST']);
        expect(taxComponents('CA', 11)?.map((c) => c.nombre)).toEqual(['GST', 'PST']);
        expect(taxComponents('CA', 0)).toBeNull();
        expect(taxComponents('CA', 8)).toBeNull();
        expect(taxComponents('FR', 20)).toBeNull();
    });

    it('el reparto suma exactamente el impuesto ya cobrado, también en notas de crédito', () => {
        for (const [base, imp] of [[1000, 149.75], [333.33, 49.92], [-200, -29.95], [0.07, 0.01]]) {
            const partes = splitTaxBucket('CA', 14.975, base, imp, { decimals: 2 })!;
            const suma = Math.round(partes.reduce((s, p) => s + p.impuesto, 0) * 100) / 100;
            expect(suma).toBe(imp);
        }
        // Sin decimales (una divisa como JPY) el federal se redondea a enteros.
        expect(splitTaxBucket('CA', 14.975, 1000, 150, { decimals: 0 })?.[0].impuesto).toBe(50);
    });

    it('agrupa el GST de distintas tasas en un solo renglón al leer líneas', () => {
        const filas = taxDisplayRows([
            { subtotal: 100, impuesto: 5, taxRate: 0.05 },
            { subtotal: 1000, impuesto: 149.75, taxRate: 0.14975 },
            { subtotal: 50, impuesto: 0, taxRate: 0 },
        ], 'CA', { decimals: 2 })!;
        expect(filas.map((f) => `${f.nombre} ${f.impuesto}`)).toEqual(['GST 55', 'QST 99.75']);
        expect(taxDisplayRows([{ subtotal: 100, impuesto: 16 }], 'MX')).toBeNull();
    });

    it('el desglose del motor conserva la etiqueta del país fuera de Canadá', () => {
        const porTasa = [{ tasa: 0.16, base: 100, impuesto: 16 }, { tasa: 0, base: 50, impuesto: 0 }];
        expect(taxBreakdownRows(porTasa, { country: 'MX', taxLabel: 'IVA' })).toEqual([{ tasa: 0.16, label: 'IVA 16%', impuesto: 16 }]);
        // Sin etiqueta (parche en vivo) la deja vacía para que la arme el navegador.
        expect(taxBreakdownRows(porTasa, { country: 'MX' })[0].label).toBe('');
        expect(taxBreakdownRows([{ tasa: 0.14975, base: 100, impuesto: 14.98 }], { country: 'CA', taxLabel: 'GST/HST' })
            .map((r) => r.label)).toEqual(['GST 5%', 'QST 9.975%']);
    });

    it('la provincia se reconoce por código o por nombre', () => {
        expect(caProvinceCode('Québec')).toBe('QC');
        expect(caProvinceCode('british columbia')).toBe('BC');
        expect(caProvinceCode('on')).toBe('ON');
        expect(caProvinceCode('Texas')).toBeNull();
        expect(canadaTaxPresets('Quebec')?.[0].nombre).toBe('GST 5% + QST 9.975%');
        expect(canadaTaxPresets(null)).toBeNull();
    });
    it('una tasa provincial suelta de antes se lee como la combinada con GST', () => {
        expect(canonicalTaxRate('CA', 0.09975)).toBe(0.14975);
        expect(canonicalTaxRate('CA', 0.07)).toBe(0.12);
        expect(canonicalTaxRate('CA', 0.06)).toBe(0.11);
        expect(canonicalTaxRate('CA', 0.13)).toBe(0.13);
        expect(canonicalTaxRate('ES', 0.07)).toBe(0.07);
    });

    it('el mismo impuesto de dos tasas es un solo renglón, y una tasa simple conserva la etiqueta del país', () => {
        const filas = taxBreakdownRows([
            { tasa: 0.05, base: 100, impuesto: 5 },
            { tasa: 0.14975, base: 1000, impuesto: 149.75 },
        ], { country: 'CA', taxLabel: 'GST/HST' });
        expect(filas.map((f) => `${f.label}=${f.impuesto}`)).toEqual(['GST 5%=55', 'QST 9.975%=99.75']);
        expect(taxDisplayRows([{ subtotal: 100, impuesto: 8, taxRate: 0.08 }], 'CA', { taxLabel: 'GST/HST' })?.[0].nombre).toBe('GST/HST');
    });
});

// Sales tax de EE. UU. por dirección — la mitad pura: la tasa efectiva que el
// motor único reproduce al centavo, el desglose por jurisdicción y las notas de
// un 0 % legítimo.
import { describe, expect, it } from 'vitest';
import { calculateDocumentTotals } from '../packages/elements/src/engine';
import {
    desgloseFromStripe, effectiveRate, huellaTexto, jurisdictionName, lineasFromStripe, normalizeUsAddress,
    usAddressFaltante, usTaxApplies, usTaxErrorFromProvider, UsTaxError, isUsTaxCode,
} from '../src/lib/us-tax/core';
import { lineTaxPct, taxBreakdownRows, taxDisplayRows, taxJurisdictionRows, taxNotes } from '../src/lib/tax-components';

// Una línea en Los Ángeles: estado 6 %, condado 0.25 %, ciudad... tal como la
// devuelve el proveedor (`line_items.data.tax_breakdown`).
const desgloseLA = (amount: number) => [
    { amount: Math.round(amount * 0.06), jurisdiction: { country: 'US', display_name: 'California', level: 'state', state: 'CA' }, sourcing: 'destination', tax_rate_details: { display_name: 'Sales and Use Tax', percentage_decimal: '6.0', tax_type: 'sales_tax' }, taxability_reason: 'standard_rated', taxable_amount: amount },
    { amount: Math.round(amount * 0.0025), jurisdiction: { country: 'US', display_name: 'LOS ANGELES', level: 'county', state: 'CA' }, sourcing: 'destination', tax_rate_details: { display_name: 'Sales and Use Tax', percentage_decimal: '0.25', tax_type: 'sales_tax' }, taxability_reason: 'standard_rated', taxable_amount: amount },
    { amount: Math.round(amount * 0.0325), jurisdiction: { country: 'US', display_name: 'LOS ANGELES COUNTY DISTRICTS', level: 'district', state: 'CA' }, sourcing: 'destination', tax_rate_details: { display_name: 'Local Sales and Use Tax', percentage_decimal: '3.25', tax_type: 'sales_tax' }, taxability_reason: 'standard_rated', taxable_amount: amount },
];

describe('tasa efectiva: el motor único reproduce el impuesto del proveedor', () => {
    it('precio sin impuesto, con redondeo por componente distinto del redondeo de la suma', () => {
        // 9.5 % de 123.45 = 11.72775 → 11.73, pero el proveedor redondea por
        // jurisdicción: 7.41 + 0.31 + 4.01 = 11.73 (o lo que sea): la tasa
        // efectiva toma SU número y el motor lo reproduce.
        const amount = 12345;
        const tax = desgloseLA(amount).reduce((s, b) => s + b.amount, 0);
        const rate = effectiveRate(amount, tax, false);
        const t = calculateDocumentTotals([{ cantidad: 1, precio_unitario: 123.45, tax_rate: rate }], { roundLines: 2, taxRounding: 'line' });
        expect(Math.round(t.impuestos * 100)).toBe(tax);
        expect(t.total).toBeCloseTo(123.45 + tax / 100, 10);
    });

    it('precio con impuesto incluido: base = bruto − impuesto', () => {
        const bruto = 10950; // 109.50 con impuesto
        const tax = 950;
        const rate = effectiveRate(bruto, tax, true);
        const t = calculateDocumentTotals([{ cantidad: 1, precio_unitario: 109.5, tax_rate: rate }], { ivaIncluido: true, roundLines: 2, taxRounding: 'line' });
        expect(t.impuestos).toBe(9.5);
        expect(t.subtotal).toBe(100);
        expect(t.total).toBe(109.5);
    });

    it('miles de importes al azar: siempre el mismo centavo', () => {
        for (let i = 0; i < 2000; i++) {
            const amount = 1 + Math.floor(Math.random() * 5_000_000);
            const tax = Math.round(amount * (0.04 + Math.random() * 0.07));
            const rate = effectiveRate(amount, tax, false);
            const t = calculateDocumentTotals([{ cantidad: 1, precio_unitario: amount / 100, tax_rate: rate }], { roundLines: 2, taxRounding: 'line' });
            expect(Math.round(t.impuestos * 100)).toBe(tax);
        }
    });

    it('una línea sin impuesto lleva tasa 0, nunca NaN', () => {
        expect(effectiveRate(1000, 0, false)).toBe(0);
        expect(effectiveRate(0, 0, false)).toBe(0);
    });
});

describe('desglose por jurisdicción', () => {
    it('nombra cada jurisdicción como se imprime', () => {
        expect(jurisdictionName('LOS ANGELES', 'county')).toBe('Los Angeles County');
        expect(jurisdictionName('SEATTLE', 'city')).toBe('Seattle');
        expect(jurisdictionName('Washington', 'state')).toBe('Washington');
        expect(jurisdictionName('ORLEANS PARISH', 'county')).toBe('Orleans Parish');
    });

    it('convierte el desglose del proveedor y descarta lo que no gravó', () => {
        const d = desgloseFromStripe([
            ...desgloseLA(10000),
            { amount: 0, jurisdiction: { country: 'US', display_name: 'KING', level: 'county', state: 'WA' }, sourcing: 'destination', tax_rate_details: null, taxability_reason: 'not_subject_to_tax', taxable_amount: 0 },
        ], { estado: 'CA', decimals: 2 });
        expect(d.motivo).toBeNull();
        expect(d.componentes.map((c) => `${c.nombre} ${c.tasa}`)).toEqual(['California 6', 'Los Angeles County 0.25', 'Los Angeles County Districts 3.25']);
        expect(d.componentes[0].impuesto).toBe(6);
    });

    it('un estado sin registro es 0 % con su motivo, no un error', () => {
        const d = desgloseFromStripe([
            { amount: 0, jurisdiction: { country: 'US', display_name: 'Texas', level: 'state', state: 'TX' }, sourcing: 'destination', tax_rate_details: null, taxability_reason: 'not_collecting', taxable_amount: 0 },
        ], { estado: 'TX', decimals: 2 });
        expect(d).toMatchObject({ motivo: 'sin_registro', estado: 'TX', estadoNombre: 'Texas', componentes: [] });
        expect(taxNotes([{ taxBreakdown: d }], 'es')).toEqual(['Sin obligación de recaudar sales tax en Texas']);
        expect(taxNotes([{ taxBreakdown: d }], 'en')).toEqual(['No obligation to collect sales tax in Texas']);
    });

    it('un cliente exento cita su certificado', () => {
        const d = desgloseFromStripe([
            { amount: 0, jurisdiction: { country: 'US', display_name: 'California', level: 'state', state: 'CA' }, sourcing: 'destination', tax_rate_details: null, taxability_reason: 'customer_exempt', taxable_amount: 0 },
        ], { estado: 'CA', decimals: 2, certificado: 'SR-123' });
        expect(d.motivo).toBe('exento');
        expect(taxNotes([{ taxBreakdown: d }, { taxBreakdown: d }], 'es')).toEqual(['Cliente exento de sales tax (certificado de exención SR-123)']);
    });

    it('las líneas del cálculo siguen el orden del documento y saltan las de importe 0', () => {
        const stripeLines = [
            { reference: 'L0', amount: 10000, amount_tax: 950, tax_breakdown: desgloseLA(10000) },
            { reference: 'L2', amount: 5000, amount_tax: 475, tax_breakdown: desgloseLA(5000) },
        ];
        const lineas = lineasFromStripe(stripeLines, [10000, 0, 5000], { estado: 'CA', decimals: 2, incluido: false });
        expect(lineas.map((l) => [l.ref, l.impuesto])).toEqual([['L0', 950], ['L1', 0], ['L2', 475]]);
        expect(lineas[1].desglose).toBeNull();
        expect(lineas[0].tasa).toBeCloseTo(0.095, 12);
    });
});

describe('renglones del documento', () => {
    const d1 = desgloseFromStripe(desgloseLA(10000), { estado: 'CA', decimals: 2 });
    const d2 = desgloseFromStripe(desgloseLA(5000), { estado: 'CA', decimals: 2 });

    it('un renglón por jurisdicción que suma exactamente el impuesto', () => {
        const rows = taxJurisdictionRows([
            { base: 100, impuesto: 9.5, taxBreakdown: d1 },
            { base: 50, impuesto: 4.75, taxBreakdown: d2 },
        ])!;
        expect(rows.map((r) => r.label)).toEqual(['California 6%', 'Los Angeles County 0.25%', 'Los Angeles County Districts 3.25%']);
        expect(rows[0].impuesto).toBe(9);
        expect(Math.round(rows.reduce((s, r) => s + r.impuesto, 0) * 100)).toBe(1425);
    });

    it('si la línea cambió (aprobación parcial con descuento), reparte su impuesto vigente sin perder un centavo', () => {
        const rows = taxJurisdictionRows([{ base: 87.31, impuesto: 8.29, taxBreakdown: d1 }])!;
        expect(Math.round(rows.reduce((s, r) => s + r.impuesto, 0) * 100)).toBe(829);
    });

    it('sin desglose, el llamador conserva su renglón de siempre', () => {
        expect(taxJurisdictionRows([{ base: 100, impuesto: 16 }])).toBeNull();
        const porTasa = [{ tasa: 0.16, base: 100, impuesto: 16 }];
        expect(taxBreakdownRows(porTasa, { country: 'MX', taxLabel: 'IVA' })).toEqual([{ tasa: 0.16, label: 'IVA 16%', impuesto: 16 }]);
    });

    it('el link público, la factura y el PDF dicen lo mismo', () => {
        const lineas = [{ base: 100, impuesto: 9.5, taxBreakdown: d1 }];
        const porTasa = [{ tasa: 0.095, base: 100, impuesto: 9.5 }];
        const q = taxBreakdownRows(porTasa, { country: 'US', taxLabel: 'Sales tax', lineas }).map((r) => r.label);
        const i = taxDisplayRows([{ subtotal: 100, impuesto: 9.5, taxRate: 0.095, taxBreakdown: d1 }], 'US')!.map((r) => `${r.nombre} ${r.tasa}%`);
        expect(q).toEqual(i);
    });

    it('la tasa impresa de la línea es la legal combinada, no la efectiva', () => {
        expect(lineTaxPct(0.0950183, d1)).toBe(9.5);
        expect(lineTaxPct(0.16, null)).toBe(16);
    });
});

describe('aplicabilidad, direcciones y errores', () => {
    it('solo un negocio de EE. UU. con la preferencia, y un cliente en EE. UU.', () => {
        expect(usTaxApplies({ orgCountry: 'US', auto: true, clienteCountry: 'US' })).toBe(true);
        expect(usTaxApplies({ orgCountry: 'US', auto: true, clienteCountry: null })).toBe(true);
        expect(usTaxApplies({ orgCountry: 'US', auto: true, clienteCountry: 'MX' })).toBe(false);
        expect(usTaxApplies({ orgCountry: 'US', auto: false, clienteCountry: 'US' })).toBe(false);
        expect(usTaxApplies({ orgCountry: 'MX', auto: true, clienteCountry: 'US' })).toBe(false);
    });

    it('el cliente necesita estado y ZIP; el negocio, la dirección completa', () => {
        const cliente = normalizeUsAddress({ region: 'ca', cp: '90012' });
        expect(usAddressFaltante(cliente)).toBeNull();
        expect(usAddressFaltante(cliente, true)).toBe('line1');
        expect(usAddressFaltante(normalizeUsAddress({ state: 'CA', postal_code: '9001' }))).toBe('postal_code');
        expect(usAddressFaltante(normalizeUsAddress({ state: 'ZZ', postal_code: '90012' }))).toBe('state');
        expect(usAddressFaltante(normalizeUsAddress({ line1: '200 N Spring St', city: 'Los Angeles', state: 'CA', postal_code: '90012-4801' }), true)).toBeNull();
    });

    it('la huella cambia con cualquier dato que cambia el impuesto', () => {
        const base = { currency: 'USD', destino: normalizeUsAddress({ state: 'CA', postal_code: '90012' })!, exento: false, incluido: false, taxCode: 'txcd_20030000', montos: [10000] };
        const h = huellaTexto(base);
        expect(huellaTexto({ ...base })).toBe(h);
        expect(huellaTexto({ ...base, montos: [10001] })).not.toBe(h);
        expect(huellaTexto({ ...base, exento: true })).not.toBe(h);
        expect(huellaTexto({ ...base, destino: { ...base.destino, postal_code: '90013' } })).not.toBe(h);
    });

    it('un error del proveedor se traduce a un motivo de Cord, sin su mensaje', () => {
        const err = (status: number, code?: string, param?: string) => Object.assign(new Error('Stripe internal message'), { stripeStatus: status, code, param });
        expect(usTaxErrorFromProvider(err(400, 'customer_tax_location_invalid'))).toBe('direccion_invalida');
        expect(usTaxErrorFromProvider(err(500))).toBe('no_disponible');
        expect(usTaxErrorFromProvider(new TypeError('fetch failed'))).toBe('no_disponible');
        expect(usTaxErrorFromProvider(err(429))).toBe('limite');
        expect(usTaxErrorFromProvider(err(400, 'parameter_invalid'))).toBe('configuracion_pendiente');
        const e = new UsTaxError('direccion_invalida', 'en');
        expect(e.message).not.toMatch(/stripe/i);
        expect(e.status).toBe(422);
    });

    it('la clasificación de lo que se vende es una lista cerrada', () => {
        expect(isUsTaxCode('txcd_20030000')).toBe(true);
        expect(isUsTaxCode('txcd_00000000')).toBe(false);
    });
});

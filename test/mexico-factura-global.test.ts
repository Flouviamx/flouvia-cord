// Factura global (CFDI 4.0) de las ventas al público en general: reglas del
// periodo (Anexo 20, InformacionGlobal), conceptos por venta (Guía de llenado
// del CFDI global), payload a Facturapi y el candado contra facturar la misma
// venta dos veces desde la cotización.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FiscalDocumentRequest } from '../src/lib/fiscal';
import {
    MESES, PERIODICIDADES, esNombrePublicoGeneral, globalPeriodError, globalPeriodRange, isMotivoCancelacion, motivoTexto,
} from '../src/lib/fiscal/cfdi-catalogos';
import { conceptosDeVenta, formaDeMayorImporte } from '../src/lib/fiscal/factura-global';
import { calculateDocumentTotals } from '../packages/elements/src/engine';

describe('periodo de la factura global (Anexo 20)', () => {
    const base = { periodicidad: '04', meses: '09', anio: 2026, regimen: '601', anioEmision: 2026 };

    it('mapea c_Periodicidad a los valores de Facturapi y ofrece 18 claves de c_Meses', () => {
        expect(Object.fromEntries(Object.entries(PERIODICIDADES).map(([k, v]) => [k, v.facturapi]))).toEqual({
            '01': 'day', '02': 'week', '03': 'fortnight', '04': 'month', '05': 'two_months',
        });
        expect(Object.keys(MESES)).toHaveLength(18);
    });

    it('acepta un mes con periodicidad mensual, del año en curso o del anterior', () => {
        expect(globalPeriodError(base)).toBeNull();
        expect(globalPeriodError({ ...base, anio: 2025 })).toBeNull();
        expect(globalPeriodError({ ...base, anio: 2024 })).toMatch(/año/);
        expect(globalPeriodError({ ...base, anio: 2027 })).toMatch(/año/);
    });

    it('bimestral solo con régimen 621 y con meses 13 a 18', () => {
        expect(globalPeriodError({ ...base, periodicidad: '05', meses: '13' })).toMatch(/621/);
        expect(globalPeriodError({ ...base, periodicidad: '05', meses: '13', regimen: '621' })).toBeNull();
        expect(globalPeriodError({ ...base, periodicidad: '05', meses: '09', regimen: '621' })).toMatch(/bimestre/);
        expect(globalPeriodError({ ...base, meses: '14' })).toMatch(/bimestral/);
    });

    it('rechaza claves fuera de catálogo', () => {
        expect(globalPeriodError({ ...base, periodicidad: '06' })).toMatch(/periodicidad/);
        expect(globalPeriodError({ ...base, meses: '19' })).toMatch(/mes/);
    });

    it('mensual y bimestral cubren el periodo completo, con años bisiestos', () => {
        expect(globalPeriodRange({ periodicidad: '04', meses: '02', anio: 2028 })).toEqual({ desde: '2028-02-01', hasta: '2028-02-29' });
        expect(globalPeriodRange({ periodicidad: '05', meses: '13', anio: 2026 })).toEqual({ desde: '2026-01-01', hasta: '2026-02-28' });
        expect(globalPeriodRange({ periodicidad: '05', meses: '18', anio: 2026 })).toEqual({ desde: '2026-11-01', hasta: '2026-12-31' });
    });

    it('diaria, semanal y quincenal eligen días dentro del mes que declaran', () => {
        const p = { meses: '09', anio: 2026 };
        expect(globalPeriodRange({ ...p, periodicidad: '01', desde: '2026-09-10', hasta: '2026-09-10' })).toEqual({ desde: '2026-09-10', hasta: '2026-09-10' });
        expect(globalPeriodRange({ ...p, periodicidad: '01', desde: '2026-09-10', hasta: '2026-09-11' })).toMatchObject({ error: expect.stringMatching(/un solo día/) });
        expect(globalPeriodRange({ ...p, periodicidad: '02', desde: '2026-09-01', hasta: '2026-09-07' })).toEqual({ desde: '2026-09-01', hasta: '2026-09-07' });
        expect(globalPeriodRange({ ...p, periodicidad: '02', desde: '2026-09-01', hasta: '2026-09-08' })).toMatchObject({ error: expect.stringMatching(/siete/) });
        expect(globalPeriodRange({ ...p, periodicidad: '03', desde: '2026-09-16', hasta: '2026-09-30' })).toEqual({ desde: '2026-09-16', hasta: '2026-09-30' });
        expect(globalPeriodRange({ ...p, periodicidad: '03', desde: '2026-08-31', hasta: '2026-09-10' })).toMatchObject({ error: expect.stringMatching(/dentro del mes/) });
        expect(globalPeriodRange({ ...p, periodicidad: '02' })).toMatchObject({ error: expect.stringMatching(/fechas/) });
        expect(globalPeriodRange({ ...p, periodicidad: '02', desde: '2026-09-07', hasta: '2026-09-01' })).toMatchObject({ error: expect.stringMatching(/antes de empezar/) });
    });
});

describe('conceptos de una venta', () => {
    it('un concepto por tasa, con 01010101, ACT y el folio como NoIdentificacion', () => {
        const conceptos = conceptosDeVenta('COT-0007', [
            { cantidad: 2, precio_unitario: 100, precio_negociado: null, tax_rate: 0.16 },
            { cantidad: 1, precio_unitario: 50, precio_negociado: null, tax_rate: 0 },
            { cantidad: 1, precio_unitario: 999, precio_negociado: null, tax_rate: 0.16, aprobado: false },
        ], { ivaIncluido: false, fallbackRate: 0.16 });
        expect(conceptos).toEqual([
            expect.objectContaining({ taxRate: 0, unitPrice: 50, subtotal: 50, taxAmount: 0, total: 50 }),
            expect.objectContaining({ taxRate: 0.16, unitPrice: 200, subtotal: 200, taxAmount: 32, total: 232 }),
        ]);
        for (const c of conceptos!) {
            expect(c).toMatchObject({ quantity: 1, productKey: '01010101', unitKey: 'ACT', identification: 'COT-0007', description: 'Venta' });
        }
    });

    it('con IVA incluido la base se desagrega del precio', () => {
        const [c] = conceptosDeVenta('COT-1', [{ cantidad: 1, precio_unitario: 116, precio_negociado: null, tax_rate: 0.16 }],
            { ivaIncluido: true, fallbackRate: 0.16 })!;
        expect([c.subtotal, c.taxAmount, c.total]).toEqual([100, 16, 116]);
    });

    it('el precio negociado manda y una línea sin tasa usa la de la organización', () => {
        const [c] = conceptosDeVenta('COT-2', [{ cantidad: 1, precio_unitario: 100, precio_negociado: 80, tax_rate: null }],
            { ivaIncluido: false, fallbackRate: 0.08 })!;
        expect([c.taxRate, c.subtotal, c.taxAmount]).toEqual([0.08, 80, 6.4]);
    });

    it('una tasa que el CFDI global no admite deja la venta fuera', () => {
        expect(conceptosDeVenta('COT-3', [{ cantidad: 1, precio_unitario: 100, precio_negociado: null, tax_rate: 0.05 }],
            { ivaIncluido: false, fallbackRate: 0.16 })).toBeNull();
        // Sin conceptos aprobados no hay importe que documentar.
        expect(conceptosDeVenta('COT-4', [], { ivaIncluido: false, fallbackRate: 0.16 })).toEqual([]);
    });

    it('con descuento de documento cada concepto lleva su Descuento y la suma cuadra con lo cobrado', () => {
        const items = [
            { cantidad: 3, precio_unitario: 333.33, precio_negociado: null, tax_rate: 0.16 },
            { cantidad: 1, precio_unitario: 250, precio_negociado: null, tax_rate: 0.16 },
            { cantidad: 2, precio_unitario: 99.99, precio_negociado: null, tax_rate: 0 },
        ];
        const descuento = { tipo: 'porcentaje' as const, valor: 12.5 };
        // Lo que se cobró: el mismo motor con el que la cotización calculó su total.
        const cobrado = calculateDocumentTotals(items.map((it) => ({ descripcion: 'x', ...it })), { roundLines: 2, descuento });
        const conceptos = conceptosDeVenta('COT-9', items, { ivaIncluido: false, fallbackRate: 0.16, descuento })!;
        expect(conceptos.map((c) => c.taxRate)).toEqual([0, 0.16]);
        const suma = (k: 'subtotal' | 'taxAmount' | 'total' | 'discount') => Math.round(conceptos.reduce((acc, c) => acc + (c[k] || 0), 0) * 100) / 100;
        expect(suma('discount')).toBe(cobrado.descuentoTotal);
        expect(suma('subtotal')).toBe(cobrado.subtotal);
        expect(suma('taxAmount')).toBe(cobrado.impuestos);
        expect(suma('total')).toBe(cobrado.total);
        for (const c of conceptos) expect(c.discount).toBeGreaterThan(0);
    });

    it('un monto fijo con precios con IVA incluido también cuadra', () => {
        const items = [{ cantidad: 1, precio_unitario: 1160, precio_negociado: null, tax_rate: 0.16 }];
        const descuento = { tipo: 'monto' as const, valor: 116 };
        const cobrado = calculateDocumentTotals(items.map((it) => ({ descripcion: 'x', ...it })), { ivaIncluido: true, roundLines: 2, descuento });
        const [c] = conceptosDeVenta('COT-10', items, { ivaIncluido: true, fallbackRate: 0.16, descuento })!;
        expect([c.subtotal, c.discount, c.taxAmount, c.total]).toEqual([900, 100, 144, 1044]);
        expect(c.total).toBe(cobrado.total);
    });

    it('una venta con descuento del 100 % no tiene concepto que timbrar', () => {
        expect(conceptosDeVenta('COT-11', [{ cantidad: 1, precio_unitario: 100, precio_negociado: null, tax_rate: 0.16 }],
            { ivaIncluido: false, fallbackRate: 0.16, descuento: { tipo: 'porcentaje', valor: 100 } })).toEqual([]);
    });

    it('la forma de pago es la de la venta de mayor importe con forma conocida', () => {
        expect(formaDeMayorImporte([
            { total: 500, formaPago: '99' }, { total: 300, formaPago: '04' }, { total: 100, formaPago: '01' },
        ])).toBe('04');
        expect(formaDeMayorImporte([{ total: 500, formaPago: '99' }])).toBeNull();
    });
});

describe('catálogo de motivos y receptor genérico', () => {
    it('motivos 01 a 04 con su texto del SAT', () => {
        expect(['01', '02', '03', '04'].every(isMotivoCancelacion)).toBe(true);
        expect(isMotivoCancelacion('05')).toBe(false);
        expect(isMotivoCancelacion('Error de captura')).toBe(false);
        expect(motivoTexto('04')).toBe('04 · Operación nominativa relacionada en una factura global');
    });
    it('reconoce "PUBLICO EN GENERAL" sin importar acentos, mayúsculas ni espacios', () => {
        expect(esNombrePublicoGeneral('Público en  general')).toBe(true);
        expect(esNombrePublicoGeneral(' PUBLICO EN GENERAL ')).toBe(true);
        expect(esNombrePublicoGeneral('Público General SA')).toBe(false);
    });
});

// ── Payload al PAC ─────────────────────────────────────────────────────────
const line = (extra: Record<string, unknown> = {}) => ({
    description: 'Venta', quantity: 1, unitPrice: 100, taxRate: 0.16, subtotal: 100, taxAmount: 16, total: 116, ...extra,
});
const request = (extra: Partial<FiscalDocumentRequest> = {}): FiscalDocumentRequest => ({
    documentId: 'doc-g', invoiceNumber: 'F-9', idempotencyKey: 'invoice:doc-g:v1', orgId: 'org-a', quoteId: 'doc-g', countryCode: 'MX',
    issuer: { legalName: 'Emisor', address: { countryCode: 'MX', postalCode: '06600' } },
    recipient: { legalName: '' },
    lines: [line({ productKey: '01010101', unitKey: 'ACT', identification: 'COT-0007' })],
    totals: { subtotal: 100, taxes: 16, total: 116, currency: 'MXN' },
    issuedAt: '2026-10-01', providerApiKey: 'sk_test_org_fixture',
    cfdi: { use: 'G03', paymentForm: '04', paymentMethod: 'PPD' },
    ...extra,
});
let fetchMock: ReturnType<typeof vi.fn>;
async function provider() { return new (await import('../src/lib/fiscal/providers/MexicoSatProvider')).MexicoSatProvider(); }
beforeEach(() => {
    vi.resetModules(); vi.stubEnv('FACTURAPI_KEY', ''); vi.stubEnv('FACTURAPI_API_KEY', '');
    fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: 'inv', uuid: 'u', status: 'valid' }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
const sent = () => JSON.parse(fetchMock.mock.calls[0][1].body);

describe('CFDI global hacia Facturapi', () => {
    it('receptor PUBLICO EN GENERAL con el CP del emisor, nodo global, PUE, S01 y el folio como sku', async () => {
        const r = await (await provider()).issueDocument(request({ global: { periodicidad: '04', meses: '09', anio: 2026 } }));
        expect(r.success).toBe(true);
        const body = sent();
        expect(body.customer).toEqual({ legal_name: 'PUBLICO EN GENERAL', tax_id: 'XAXX010101000', tax_system: '616', address: { zip: '06600' } });
        expect(body.global).toEqual({ periodicity: 'month', months: '09', year: 2026 });
        expect(body.payment_method).toBe('PUE');
        expect(body.payment_form).toBe('04');
        expect(body.use).toBe('S01');
        expect(body.items[0].product).toMatchObject({ product_key: '01010101', unit_key: 'ACT', sku: 'COT-0007' });
        expect(r.rawProviderData).toMatchObject({ global: { periodicidad: '04', meses: '09', anio: 2026 } });
    });

    it('una venta con descuento viaja con su Descuento y el ValorUnitario bruto', async () => {
        const r = await (await provider()).issueDocument(request({
            global: { periodicidad: '04', meses: '09', anio: 2026 },
            lines: [line({ unitPrice: 900, subtotal: 900, taxAmount: 144, total: 1044, discount: 100, productKey: '01010101', unitKey: 'ACT', identification: 'COT-10' })],
            totals: { subtotal: 900, taxes: 144, total: 1044, currency: 'MXN', discountTotal: 100 },
        }));
        expect(r.success).toBe(true);
        expect(sent().items[0]).toMatchObject({ quantity: 1, discount: 100, product: { price: 1000, sku: 'COT-10', product_key: '01010101', unit_key: 'ACT' } });
    });

    it('no timbra la global sin código postal del emisor ni con un periodo inválido', async () => {
        const p = await provider();
        expect(await p.issueDocument(request({ issuer: { legalName: 'Emisor' }, global: { periodicidad: '04', meses: '09', anio: 2026 } })))
            .toMatchObject({ success: false, error: expect.stringMatching(/código postal/) });
        expect(await p.issueDocument(request({ global: { periodicidad: '07', meses: '09', anio: 2026 } })))
            .toMatchObject({ success: false });
        expect(await p.issueDocument(request({ global: { periodicidad: '04', meses: '09', anio: 2026 }, cfdi: { paymentForm: '99' } })))
            .toMatchObject({ success: false, error: expect.stringMatching(/forma de pago/) });
        expect(fetchMock).not.toHaveBeenCalled();
    });
});

describe('receptor con RFC genérico en una factura individual', () => {
    it('usa el nombre del cliente, régimen 616 y el CP del emisor, aunque la ficha diga otra cosa', async () => {
        await (await provider()).issueDocument(request({
            recipient: { legalName: 'Juan Pérez', taxSystem: '601', address: { countryCode: 'MX', postalCode: '64000' } },
        }));
        expect(sent().customer).toEqual({ legal_name: 'JUAN PÉREZ', tax_id: 'XAXX010101000', tax_system: '616', address: { zip: '06600' } });
        expect(sent()).not.toHaveProperty('global');
    });

    it('reserva "PUBLICO EN GENERAL" a la factura global', async () => {
        const r = await (await provider()).issueDocument(request({ recipient: { legalName: 'Público en general' } }));
        expect(r).toMatchObject({ success: false, error: expect.stringMatching(/factura global/) });
        expect(fetchMock).not.toHaveBeenCalled();
    });
});

// ── La cotización no se factura si ya está en una global ────────────────────
describe('factura individual de una venta que está en una global', () => {
    it('emit.ts se niega antes de reservar el folio y dice qué hacer', async () => {
        vi.resetModules();
        const tx = vi.fn();
        vi.doMock('../src/lib/db', () => ({ withOrgTx: tx, withSystemTx: tx, sql: (s: TemplateStringsArray, ...v: unknown[]) => ({ text: s.join('?'), values: v }) }));
        vi.doMock('../src/lib/org-entitlements', () => ({ getEffectivePlan: async () => 'starter' }));
        vi.doMock('../src/lib/fiscal/invoices', () => ({ finalizeInvoice: vi.fn() }));
        const { emitFiscalDocument } = await import('../src/lib/fiscal/emit');
        tx.mockResolvedValueOnce([
            [{ country_code: 'MX', iva_pct: 16, base_currency: 'MXN', org_moneda: 'MXN', fiscal_metadata: {}, cliente_id: 'cli-1', cliente_empresa: 'Cliente', retenciones_snapshot: [] }],
            [{ descripcion: 'Servicio', cantidad: 1, precio_unitario: 100, precio_negociado: null, aprobado: true, tax_rate: 0.16 }],
        ]).mockResolvedValueOnce([[{ invoice_number: 'F-000120', status: 'issued' }]]);
        const r = await emitFiscalDocument('org-a', 'quote-1');
        expect(r).toMatchObject({ emitted: false, httpStatus: 409, error: expect.stringMatching(/F-000120.*motivo 04/) });
        expect(tx).toHaveBeenCalledTimes(2);
        expect(tx.mock.calls[1][1].text).toContain('factura_global_ventas');
        vi.doUnmock('../src/lib/db'); vi.doUnmock('../src/lib/org-entitlements'); vi.doUnmock('../src/lib/fiscal/invoices');
    });

    it('la reserva del folio vuelve a comprobarlo dentro de la transacción', async () => {
        const { readFileSync } = await import('node:fs');
        const src = readFileSync(new URL('../src/lib/fiscal/emit.ts', import.meta.url), 'utf8');
        const inicio = src.indexOf('next_number as (');
        const reserva = src.slice(inicio, src.indexOf('returning next_value', inicio));
        expect(inicio).toBeGreaterThan(0);
        // El mismo candado por cotización que toma la factura global.
        expect(src).toContain('const idempotencyKey = `quote:${cotizacionId}:invoice:v1`');
        expect(reserva).toContain('not exists');
        expect(reserva).toContain('factura_global_ventas');
        const global = readFileSync(new URL('../src/lib/fiscal/factura-global.ts', import.meta.url), 'utf8');
        expect(global).toContain('`${orgId}:quote:${id}:invoice:v1`');
    });
});

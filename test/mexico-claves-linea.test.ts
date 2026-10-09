// Claves SAT por línea: la de la línea gana sobre la del producto, se validan
// al guardar y viajan intactas hasta el concepto del CFDI.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ tx: vi.fn(), event: vi.fn() }));
vi.mock('../src/lib/db', () => ({ withOrgTx: m.tx, withSystemTx: m.tx, sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({ text: strings.join('?'), values }) }));
vi.mock('../src/lib/org-entitlements', () => ({ getEffectivePlan: async () => 'starter' }));
vi.mock('../src/lib/fiscal/timeline', () => ({ logInvoiceEvent: m.event }));
vi.mock('../src/lib/impuestos-db', () => ({
    taxCatalogFor: async () => ({ resolve: (r: number | null | undefined, d: number) => r ?? d, defaultRate: 0.16, retenciones: [], country: 'MX' }),
    TaxCatalogUnavailableError: class extends Error {},
}));

import {
    DEFAULT_PRODUCT_KEY, effectiveLineSatKeys, lineSatKeyError, lineSatKeysFrom,
} from '../src/lib/fiscal/sat-claves';
import { genericKeyCount, satKeysFromProduct, satPayload } from '../src/lib/sat-line-picker';
import { createInvoiceDraft, parseInvoiceItems } from '../src/lib/fiscal/invoices';
import { mexicoItems } from '../src/lib/fiscal/providers/mexico-items';

const head = (country = 'MX') => ({
    org_nombre: 'Emisor', country_code: country, iva_pct: 16, org_moneda: country === 'MX' ? 'MXN' : 'USD',
    fiscal_metadata: {}, cliente_id: 'cli-1', cliente_empresa: 'Cliente SA', cliente_rfc: 'AAA010101AAA',
    cliente_country_code: country,
});
const PRODUCTO = '11111111-1111-4111-8111-111111111111';

beforeEach(() => { m.tx.mockReset(); m.event.mockReset(); });

describe('precedencia de claves SAT', () => {
    it('la clave explícita de la línea gana, campo por campo, sobre la del producto', () => {
        const producto = { claveSat: '43231500', claveUnidadSat: 'H87', unidad: 'pieza' };
        expect(effectiveLineSatKeys({ productKey: '81111500', unitKey: 'E48' }, producto)).toEqual({ productKey: '81111500', unitKey: 'E48' });
        // Solo la clave de producto en la línea: la unidad sigue siendo la del producto.
        expect(effectiveLineSatKeys({ productKey: '81111500' }, producto)).toEqual({ productKey: '81111500', unitKey: 'H87' });
        // Sin clave propia, la del producto; sin producto, nada (el emisor pone los defaults).
        expect(effectiveLineSatKeys({}, producto)).toEqual({ productKey: '43231500', unitKey: 'H87' });
        expect(effectiveLineSatKeys({ productKey: null, unitKey: null }, null)).toEqual({});
        // Una clave inválida nunca sale de aquí.
        expect(effectiveLineSatKeys({ productKey: '123', unitKey: 'toolong' }, producto)).toEqual({ productKey: '43231500', unitKey: 'H87' });
    });

    it('lee los nombres del contrato HTTP y del dominio, y valida la forma al guardar', () => {
        expect(lineSatKeysFrom({ clave_sat: ' 8111 1500 ', clave_unidad_sat: 'e48' })).toEqual({ productKey: '81111500', unitKey: 'E48' });
        expect(lineSatKeysFrom({ productKey: '43231500' })).toEqual({ productKey: '43231500', unitKey: null });
        expect(lineSatKeysFrom(null)).toEqual({ productKey: null, unitKey: null });
        expect(lineSatKeyError([{ descripcion: 'Flete', productKey: '8111' }])).toMatch(/Flete.*8 dígitos/);
        expect(lineSatKeyError([{ descripcion: 'Flete', unitKey: 'ABCD' }])).toMatch(/unidad SAT de "Flete"/);
        expect(lineSatKeyError([{ descripcion: 'Flete', productKey: '78101800', unitKey: 'E48' }, { descripcion: 'Libre' }])).toBeNull();
    });

    it('parseInvoiceItems conserva las claves de la línea libre', () => {
        const [linea] = parseInvoiceItems([{ descripcion: 'Flete', cantidad: 1, precio_unitario: 100, clave_sat: '78101800', clave_unidad_sat: 'E48' }]);
        expect(linea).toMatchObject({ productKey: '78101800', unitKey: 'E48', productoId: null });
    });

    it('el editor nace con las claves del producto y cuenta las genéricas antes de emitir', () => {
        expect(satKeysFromProduct({ claveSat: '43231500', claveUnidadSat: null, unidad: 'hora' })).toEqual({ productKey: '43231500', unitKey: 'HUR' });
        expect(satKeysFromProduct({ claveSat: 'x', unidad: 'tarima de 40 sacos' })).toEqual({ productKey: null, unitKey: null });
        expect(genericKeyCount([{ productKey: null }, { productKey: DEFAULT_PRODUCT_KEY }, { productKey: '78101800' }])).toBe(2);
        expect(satPayload({ productKey: '78101800', unitKey: null })).toEqual({ clave_sat: '78101800' });
    });
});

describe('borrador de factura en México', () => {
    it('la clave de la línea gana sobre la del producto y queda congelada en el snapshot', async () => {
        m.tx
            .mockResolvedValueOnce([[head()]])
            .mockResolvedValueOnce([[{ id: PRODUCTO, clave_sat: '43231500', clave_unidad_sat: 'H87', unidad: 'pieza' }]])
            .mockResolvedValueOnce([[{ id: 'doc-1', public_token: 'tok' }]]);
        const result = await createInvoiceDraft('org-a', {
            clienteId: 'cli-1',
            items: [
                { descripcion: 'Licencia', cantidad: 1, precioUnitario: 100, productoId: PRODUCTO, productKey: '81111500', unitKey: null },
                { descripcion: 'Software', cantidad: 1, precioUnitario: 50, productoId: PRODUCTO },
                { descripcion: 'Flete', cantidad: 1, precioUnitario: 10, productKey: '78101800', unitKey: 'E48' },
                { descripcion: 'Libre', cantidad: 1, precioUnitario: 5 },
            ],
        });
        expect(result.ok).toBe(true);
        const insert = m.tx.mock.calls[2][1];
        expect(insert.text).toContain('insert into documentos_fiscales');
        const snapshot = JSON.parse(insert.values.find((v: unknown) => typeof v === 'string' && v.startsWith('[{"description"')));
        expect(snapshot.map((l: any) => [l.productKey, l.unitKey])).toEqual([
            ['81111500', 'H87'], ['43231500', 'H87'], ['78101800', 'E48'], [undefined, undefined],
        ]);
        // El producto se leyó acotado a la organización.
        expect(m.tx.mock.calls[1][0]).toBe('org-a');
        expect(m.tx.mock.calls[1][1].text).toContain('where org_id = ?');
    });

    it('rechaza al guardar una clave con forma inválida, nombrando el concepto', async () => {
        m.tx.mockResolvedValueOnce([[head()]]);
        const result = await createInvoiceDraft('org-a', {
            clienteId: 'cli-1', items: [{ descripcion: 'Flete', cantidad: 1, precioUnitario: 10, productKey: '7810' }],
        });
        expect(result).toMatchObject({ ok: false });
        expect(result.error).toMatch(/Flete/);
        expect(m.tx).toHaveBeenCalledTimes(1);
    });

    it('fuera de México las claves no se validan ni se guardan', async () => {
        m.tx
            .mockResolvedValueOnce([[head('US')]])
            .mockResolvedValueOnce([[{ id: 'doc-1', public_token: 'tok' }]]);
        const result = await createInvoiceDraft('org-a', {
            clienteId: 'cli-1', items: [{ descripcion: 'Freight', cantidad: 1, precioUnitario: 10, productKey: 'bad' }],
        });
        expect(result.ok).toBe(true);
        const insert = m.tx.mock.calls[1][1];
        expect(insert.values.some((v: unknown) => typeof v === 'string' && v.includes('productKey'))).toBe(false);
    });
});

describe('concepto del CFDI', () => {
    it('la clave congelada viaja como product_key/unit_key y la línea sin clave cae a 01010101/H87', () => {
        const items = mexicoItems({
            documentId: 'd', invoiceNumber: 'F-1', idempotencyKey: 'k', orgId: 'o', quoteId: 'q', countryCode: 'MX',
            issuer: { legalName: 'E' }, recipient: { legalName: 'R' }, issuedAt: '2026-10-08',
            lines: [
                { description: 'Flete', quantity: 1, unitPrice: 10, taxRate: 0.16, subtotal: 10, taxAmount: 1.6, total: 11.6, productKey: '78101800', unitKey: 'E48' },
                { description: 'Libre', quantity: 1, unitPrice: 5, taxRate: 0.16, subtotal: 5, taxAmount: 0.8, total: 5.8 },
            ],
            totals: { subtotal: 15, taxes: 2.4, total: 17.4, currency: 'MXN' },
        });
        expect(items.map((i) => [i.product.product_key, i.product.unit_key])).toEqual([['78101800', 'E48'], ['01010101', 'H87']]);
    });
});

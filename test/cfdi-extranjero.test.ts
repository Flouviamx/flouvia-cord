import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FiscalDocumentRequest } from '../src/lib/fiscal';
import { COUNTRY_ALPHA3, COUNTRY_CODES, toAlpha3 } from '../src/lib/countries';
import {
    DEFAULT_PRODUCT_KEY, DEFAULT_UNIT_KEY, SAT_UNITS, isProductKey, isUnitKey, resolveLineSatKeys, satUnitForUnit,
} from '../src/lib/fiscal/sat-claves';
import { PRODUCT_UNITS } from '../src/lib/product-units';

const line = (extra: Record<string, unknown> = {}) => ({
    description: 'Consultoría', quantity: 1, unitPrice: 100, taxRate: 0.16, subtotal: 100, taxAmount: 16, total: 116, ...extra,
});
const fixture = (recipient: FiscalDocumentRequest['recipient']): FiscalDocumentRequest => ({
    documentId: 'doc-a', invoiceNumber: 'F-1', idempotencyKey: 'invoice:doc-a:v1', orgId: 'org-a', quoteId: 'doc-a', countryCode: 'MX',
    issuer: { legalName: 'Emisor' }, recipient,
    lines: [line()], totals: { subtotal: 100, taxes: 16, total: 116, currency: 'MXN' },
    issuedAt: '2026-10-08', providerApiKey: 'sk_test_org_fixture',
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

describe('ISO 3166-1 alfa-3', () => {
    it('cubre cada país de COUNTRY_CODES con tres letras únicas', () => {
        for (const c of COUNTRY_CODES) expect(COUNTRY_ALPHA3[c], c).toMatch(/^[A-Z]{3}$/);
        expect(new Set(Object.values(COUNTRY_ALPHA3)).size).toBe(COUNTRY_CODES.length);
    });
    it('convierte los mercados de Cord y rechaza lo desconocido', () => {
        expect([toAlpha3('mx'), toAlpha3('US'), toAlpha3('ES'), toAlpha3('GB'), toAlpha3('DE'), toAlpha3('CH')])
            .toEqual(['MEX', 'USA', 'ESP', 'GBR', 'DEU', 'CHE']);
        expect(toAlpha3('XK')).toBeNull();
        expect(toAlpha3('')).toBeNull();
    });
});

describe('CFDI a un receptor extranjero', () => {
    it('manda la residencia fiscal en alfa-3, su número fiscal y uso S01, sin régimen ni RFC genérico nacional', async () => {
        const req = fixture({
            legalName: 'Northwind Traders', taxId: '12-345 6789', taxSystem: '601', email: 'ap@northwind.com',
            address: { countryCode: 'US', postalCode: '78701', city: 'Austin' },
        });
        req.cfdi = { use: 'G03' };
        const r = await (await provider()).issueDocument(req);
        expect(r.success).toBe(true);
        const body = sent();
        expect(body.customer).toEqual({
            legal_name: 'NORTHWIND TRADERS', tax_id: '12-3456789', email: 'ap@northwind.com',
            address: { country: 'USA', zip: '78701', city: 'Austin' },
        });
        expect(body.customer).not.toHaveProperty('tax_system');
        expect(body.use).toBe('S01');
        expect(r.rawProviderData).toMatchObject({ receptor_extranjero: 'USA' });
    });

    it('sin número fiscal extranjero no inventa uno', async () => {
        await (await provider()).issueDocument(fixture({ legalName: 'Atelier', address: { countryCode: 'FR' } }));
        expect(sent().customer).toEqual({ legal_name: 'ATELIER', address: { country: 'FRA' } });
    });

    it('una nota de crédito a un extranjero también es S01', async () => {
        const req = fixture({ legalName: 'Atelier', taxId: 'FR40303265045', address: { countryCode: 'FR' } });
        req.documentType = 'cfdi_egreso'; req.relatedFiscalId = '39c85a3f-275b-4341-b259-e8971d9f8a94';
        await (await provider()).issueDocument(req);
        expect(sent()).toMatchObject({ type: 'E', use: 'S01' });
    });

    it('un país inválido no llega al PAC', async () => {
        const r = await (await provider()).issueDocument(fixture({ legalName: 'X', address: { countryCode: 'ZZ' } }));
        expect(r.success).toBe(false);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('el receptor nacional no cambia: RFC real con su régimen y público en general con XAXX', async () => {
        const req = fixture({ legalName: 'Ferretería', taxId: 'AAA010101AAA', taxSystem: '601', address: { countryCode: 'MX', postalCode: '44100' } });
        req.cfdi = { use: 'G01' };
        await (await provider()).issueDocument(req);
        expect(sent().customer).toEqual({ legal_name: 'FERRETERÍA', tax_id: 'AAA010101AAA', tax_system: '601', address: { zip: '44100' } });
        expect(sent().use).toBe('G01');

        fetchMock.mockClear();
        await (await provider()).issueDocument(fixture({ legalName: '', address: { countryCode: 'MX', postalCode: '06600' } }));
        expect(sent().customer).toMatchObject({ tax_id: 'XAXX010101000', tax_system: '616' });
        expect(sent().use).toBe('S01');
    });

    it('sin país en el receptor se trata como nacional (comportamiento previo)', async () => {
        await (await provider()).issueDocument(fixture({ legalName: 'Cliente', taxId: 'AAA010101AAA' }));
        expect(sent().customer.tax_id).toBe('AAA010101AAA');
    });
});

describe('claves SAT del concepto', () => {
    it('manda las claves del producto y los defaults del SAT donde no hay', async () => {
        const req = fixture({ legalName: 'Cliente', taxId: 'AAA010101AAA', address: { countryCode: 'MX', postalCode: '44100' } });
        req.lines = [line({ productKey: '81111500', unitKey: 'HUR' }), line()];
        req.totals = { subtotal: 200, taxes: 32, total: 232, currency: 'MXN' };
        expect((await (await provider()).issueDocument(req)).success).toBe(true);
        expect(sent().items.map((i: any) => [i.product.product_key, i.product.unit_key])).toEqual([
            ['81111500', 'HUR'], [DEFAULT_PRODUCT_KEY, DEFAULT_UNIT_KEY],
        ]);
    });

    it('una clave con formato inválido se rechaza antes del PAC, nombrando el concepto', async () => {
        const req = fixture({ legalName: 'Cliente', taxId: 'AAA010101AAA' });
        req.lines = [line({ productKey: '8111' })];
        const r = await (await provider()).issueDocument(req);
        expect(r.success).toBe(false);
        expect(r.error).toContain('Consultoría');
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('valida el formato de cada catálogo', () => {
        expect(isProductKey('01010101')).toBe(true);
        expect(isProductKey('1010101')).toBe(false);
        expect(isProductKey('8111150A')).toBe(false);
        for (const u of SAT_UNITS) expect(isUnitKey(u.clave), u.clave).toBe(true);
        expect(isUnitKey('h87')).toBe(false);
        expect(isUnitKey('ABCD')).toBe(false);
    });

    it('cada unidad sugerida al dar de alta un producto tiene su clave de unidad', () => {
        const curated = new Set(SAT_UNITS.map((u) => u.clave));
        for (const lang of ['es', 'en'] as const) {
            for (const units of Object.values(PRODUCT_UNITS[lang])) {
                for (const u of units) {
                    const key = satUnitForUnit(u);
                    expect(key, `${lang}:${u}`).not.toBeNull();
                    expect(curated.has(key!), `${lang}:${u} → ${key}`).toBe(true);
                }
            }
        }
    });

    it('la clave explícita gana; sin ella se deduce de la unidad; lo inválido se descarta', () => {
        expect(resolveLineSatKeys({ claveSat: '81111500', claveUnidadSat: 'E48', unidad: 'hora' })).toEqual({ productKey: '81111500', unitKey: 'E48' });
        expect(resolveLineSatKeys({ unidad: 'Hora' })).toEqual({ unitKey: 'HUR' });
        expect(resolveLineSatKeys({ unidad: 'm²' })).toEqual({ unitKey: 'MTK' });
        expect(resolveLineSatKeys({ unidad: 'tarima de 40 sacos' })).toEqual({});
        expect(resolveLineSatKeys({ claveSat: '123', claveUnidadSat: 'toolong' })).toEqual({});
        expect(resolveLineSatKeys(null)).toEqual({});
    });
});

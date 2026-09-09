import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ resolve: vi.fn(), tx: vi.fn(), active: vi.fn() }));
vi.mock('../src/lib/db', () => ({
    resolvePublicInvoice: mocks.resolve, withOrgTx: mocks.tx, getActiveOrgId: mocks.active,
    sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({ text: strings.join('?'), values }),
}));
vi.mock('../src/lib/crypto-secret', () => ({ decryptSecret: () => null }));

const id = 'af9a9cf1-f55e-4a41-a6b8-a4302c7d5d93';
const fixture = (extra = {}) => ({
    id, status: 'issued', lifecycle: 'open', document_type: 'commercial_invoice',
    invoice_number: 'INV-0001', country_code: 'US', currency: 'USD', subtotal: 100,
    tax_total: 0, total: 100, issued_at: new Date('2026-09-05T12:00:00Z'),
    issuer_snapshot: { legalName: 'Seller' }, recipient_snapshot: { legalName: 'Buyer' },
    line_items_snapshot: [{ description: 'Service', quantity: 1, unitPrice: 100, subtotal: 100, total: 100, taxAmount: 0 }],
    provider_data: {}, invoice_token: 'public-token', ...extra,
});
let fetchMock: ReturnType<typeof vi.fn>;
async function publicDownload(token = 'public-token', format = 'pdf') {
    const { GET } = await import('../src/pages/api/i/[token]/documents/[format]');
    return GET({ params: { token, format } } as any);
}

beforeEach(() => {
    vi.resetModules(); vi.clearAllMocks();
    mocks.resolve.mockResolvedValue({ id, orgId: 'seller-org' });
    mocks.tx.mockResolvedValue([[fixture()]]);
    mocks.active.mockResolvedValue('unrelated-browser-org');
    fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe('descarga pública limitada a una factura', () => {
    it('genera un PDF sin sesión, usando la identidad del token y sin caché', async () => {
        const result = await publicDownload();
        expect(result.status).toBe(200);
        expect(result.headers.get('content-type')).toBe('application/pdf');
        expect((await result.text()).startsWith('%PDF-')).toBe(true);
        expect(result.headers.get('cache-control')).toContain('no-store');
        expect(result.headers.get('referrer-policy')).toBe('no-referrer');
        expect(mocks.active).not.toHaveBeenCalled();
        expect(mocks.tx.mock.calls[0][0]).toBe('seller-org');
        expect(mocks.tx.mock.calls[0][1].values).toContain('public-token');
        expect(fetchMock).not.toHaveBeenCalled();
    });
    it('rechaza un token inválido antes de cargar documentos', async () => {
        mocks.resolve.mockResolvedValue(null);
        expect((await publicDownload('invalid')).status).toBe(404);
        expect(mocks.tx).not.toHaveBeenCalled();
    });
    it('no sirve un documento que deja de estar disponible después de resolver el token', async () => {
        mocks.tx.mockResolvedValue([[]]);
        expect((await publicDownload()).status).toBe(404);
        expect(fetchMock).not.toHaveBeenCalled();
    });
    it('sirve XML timbrado sin exponer credenciales ni usar la sesión ajena', async () => {
        mocks.tx.mockResolvedValue([[fixture({ document_type: 'cfdi_40', facturapi_live_key: 'private-fixture-key', provider_data: { facturapi_id: 'provider-doc' } })]]);
        fetchMock.mockResolvedValue(new Response('<cfdi:Comprobante/>'));
        const result = await publicDownload('public-token', 'xml');
        expect(result.status).toBe(200);
        expect(result.headers.get('content-type')).toBe('application/xml');
        expect(await result.text()).toBe('<cfdi:Comprobante/>');
        expect(fetchMock.mock.calls[0][0]).toContain('/invoices/provider-doc/xml');
        expect(JSON.stringify([...result.headers])).not.toContain('private-fixture-key');
        expect(mocks.active).not.toHaveBeenCalled();
    });
    it('no inventa XML de una factura comercial', async () => {
        expect((await publicDownload('public-token', 'xml')).status).toBe(404);
    });
    it('rechaza formatos arbitrarios antes de resolver el token', async () => {
        expect((await publicDownload('public-token', '../secrets')).status).toBe(404);
        expect(mocks.resolve).not.toHaveBeenCalled();
    });
    it('oculta errores de infraestructura también en respuestas sin caché', async () => {
        mocks.tx.mockRejectedValue(new Error('private database credentials'));
        const result = await publicDownload();
        expect(result.status).toBe(503);
        expect(await result.text()).not.toContain('private');
        expect(result.headers.get('cache-control')).toContain('no-store');
    });
    it('la ruta interna continúa resolviendo la organización de la sesión', async () => {
        const { GET } = await import('../src/pages/api/fiscal/documents/[id]/[format]');
        expect((await GET({ params: { id, format: 'pdf' } } as any)).status).toBe(200);
        expect(mocks.active).toHaveBeenCalledOnce();
        expect(mocks.tx.mock.calls[0][0]).toBe('unrelated-browser-org');
        expect(mocks.resolve).not.toHaveBeenCalled();
    });
});

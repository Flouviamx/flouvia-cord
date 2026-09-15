import { beforeEach, describe, expect, it, vi } from 'vitest';

// Contrato del helper que se integra por separado. No accede a DB ni decide
// flags: estas pruebas verifican qué organización/documento pide el consumidor.
const m = vi.hoisted(() => ({
    link: vi.fn(), active: vi.fn(), tx: vi.fn(), list: vi.fn(), page: vi.fn(), detail: vi.fn(), idem: vi.fn(),
    create: vi.fn(), collections: vi.fn(),
}));
vi.mock('../src/lib/public-links', () => ({ publicDocumentUrl: m.link }));
vi.mock('../src/lib/api-idempotency', () => ({ withIdempotency: m.idem }));
vi.mock('../src/lib/db', () => ({
    getActiveOrgId: m.active, withOrgTx: m.tx, reqIp: () => '127.0.0.1',
    sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({ text: strings.join('?'), values }),
}));
vi.mock('../src/lib/apikey', () => ({ withApiAuth: (_scope: string, handler: unknown) => handler }));
vi.mock('../src/lib/queries', () => ({
    getCotizaciones: m.list, getCotizacionesPage: m.page, getCotizacion: m.detail, getCobranza: m.collections,
    getAnalytics: vi.fn(), getPlanUsage: vi.fn(), getFacturas: vi.fn(), getFacturaDetalle: vi.fn(),
}));
vi.mock('../src/lib/cotizaciones', () => ({ createCotizacion: m.create, QuoteError: class extends Error {} }));
vi.mock('../src/lib/org-entitlements', () => ({
    checkEntitlement: async () => ({ ok: true }), requireEntitlement: async () => null,
}));
vi.mock('../src/lib/fiscal/invoices', () => ({ createInvoiceDraft: vi.fn() }));
vi.mock('../src/lib/fiscal/gate', () => ({ invoicingFeatureFor: vi.fn() }));

const quote = (id = 'quote-a') => ({
    id, token: `token-${id}`, folio: 'COT-1', cliente: 'Buyer', status: 'sent', total: 100,
    terminos: 'Contado', vigencia: '2026-09-30', creada: '2026-09-06',
    items: [{ descripcion: 'Service', cantidad: 1, unidad: 'u', precioLista: 100 }],
    eventos: [],
});
const auth = { orgId: 'sandbox-org', keyId: 'key-test' };

beforeEach(() => {
    vi.clearAllMocks();
    m.active.mockResolvedValue('sandbox-org');
    m.link.mockImplementation(async (orgId, kind, token, suffix = '') =>
        `${orgId === 'sandbox-org' ? 'https://sandbox.example.test' : 'https://ventas.example.test'}/${kind}/${token}${suffix}`);
    m.list.mockResolvedValue([quote()]);
    m.detail.mockResolvedValue(quote());
    m.create.mockResolvedValue({ id: 'quote-a', folio: 'COT-1', token: 'token-created' });
    m.tx.mockResolvedValue([[]]);
    m.idem.mockImplementation(async (_owner: unknown, _req: unknown, execute: () => Promise<unknown>) => ({ kind: 'executed', result: await execute() }));
    m.collections.mockResolvedValue({
        resumen: {}, aging: {}, clientes: [],
        items: [{ id: 'quote-a', overdue: true, token: 'secret', publicUrl: 'https://ventas.example.test/q/secret' }],
    });
});

describe('URLs públicas en API v1', () => {
    it('resuelve enlaces del listado paginado con la organización efectiva', async () => {
        const { GET } = await import('../src/pages/api/v1/cotizaciones');
        m.page.mockResolvedValue({ items: [quote('b')], total: 3 });
        const response = await (GET as any)({ url: new URL('https://untrusted.example/api/v1/cotizaciones?limit=1&offset=1') }, auth);
        const body = await response.json();
        expect(m.page).toHaveBeenCalledWith({ limit: 1, offset: 1, status: null, folio: null });
        expect(body.meta).toEqual({ limit: 1, offset: 1, total: 3 });
        expect(body.data).toHaveLength(1);
        expect(body.data[0].link_publico).toBe('https://sandbox.example.test/q/token-b');
        expect(m.link).toHaveBeenCalledExactlyOnceWith('sandbox-org', 'q', 'token-b');
    });

    it('espera el serializador del detalle y conserva sus líneas', async () => {
        const { GET } = await import('../src/pages/api/v1/cotizaciones/[id]');
        const response = await (GET as any)({ params: { id: 'quote-a' } }, auth);
        const body = await response.json();
        expect(body.data.link_publico).toBe('https://sandbox.example.test/q/token-quote-a');
        expect(body.data.items[0].descripcion).toBe('Service');
        expect(m.link).toHaveBeenCalledWith('sandbox-org', 'q', 'token-quote-a');
    });

    it('no resuelve dominios para un documento inexistente', async () => {
        m.detail.mockResolvedValue(null);
        const { GET } = await import('../src/pages/api/v1/cotizaciones/[id]');
        expect((await (GET as any)({ params: { id: 'missing' } }, auth)).status).toBe(404);
        expect(m.link).not.toHaveBeenCalled();
    });

    it('la creación usa la URL del helper aunque el request venga de otro host', async () => {
        const { POST } = await import('../src/pages/api/v1/cotizaciones');
        const request = new Request('https://untrusted.example/api/v1/cotizaciones', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items: [] }),
        });
        const response = await (POST as any)({ request }, auth);
        const { data } = await response.json();
        expect(data.link_publico).toBe('https://sandbox.example.test/q/token-created');
        expect(data.token).toBe('token-created');
        expect(m.link).toHaveBeenCalledExactlyOnceWith('sandbox-org', 'q', 'token-created');
    });

    it('la cartera sigue sin exponer la credencial del enlace', async () => {
        const { GET } = await import('../src/pages/api/v1/cobranza');
        const body = await (await (GET as any)({}, auth)).json();
        expect(body.data.items).toEqual([{ id: 'quote-a', overdue: true }]);
    });
});

describe('URLs públicas en MCP', () => {
    const toolCtx = { ip: '127.0.0.1', keyId: 'key-test', orgId: 'sandbox-org', origin: 'https://cordhq.app' };

    it('guarda el enlace absoluto en la respuesta idempotente del borrador', async () => {
        const { findTool } = await import('../src/lib/mcp');
        const result: any = await findTool('crear_cotizacion_borrador')!.handler({ items: [], idempotency_key: 'retry-key' }, toolCtx);
        expect(result.link_publico).toBe('https://sandbox.example.test/q/token-created');
        expect(m.link).toHaveBeenCalledExactlyOnceWith('sandbox-org', 'q', 'token-created');
        const [owner, req] = m.idem.mock.calls[0];
        expect(owner).toEqual({ orgId: 'sandbox-org', keyId: 'key-test' });
        expect(req).toMatchObject({ key: 'retry-key', method: 'MCP', path: '/mcp/tools/crear_cotizacion_borrador' });
        expect(req.payload).not.toContain('retry-key');
        const stored = await m.idem.mock.results[0].value;
        expect(JSON.parse(stored.result.body)).toEqual(result);
    });

    it('reproduce la respuesta guardada sin volver a crear ni cambiar su enlace', async () => {
        const stored = { id: 'quote-a', link_publico: 'https://previous.example.test/q/token', estado: 'borrador' };
        m.idem.mockResolvedValue({ kind: 'replayed', result: { status: 200, body: JSON.stringify(stored) } });
        const { findTool } = await import('../src/lib/mcp');
        expect(await findTool('crear_cotizacion_borrador')!.handler({ idempotency_key: 'retry-key' }, toolCtx)).toEqual(stored);
        expect(m.create).not.toHaveBeenCalled();
        expect(m.link).not.toHaveBeenCalled();
    });

    it('la cartera vencida sigue sin exponer tokens ni sus URLs', async () => {
        const { findTool } = await import('../src/lib/mcp');
        const result: any = await findTool('cartera_vencida')!.handler({}, toolCtx);
        expect(result.vencidas).toEqual([{ id: 'quote-a', overdue: true }]);
    });
});

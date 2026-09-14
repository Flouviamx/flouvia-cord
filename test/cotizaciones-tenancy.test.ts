import { beforeEach, describe, expect, it, vi } from 'vitest';

type Q = { text: string; values: unknown[] };

const m = vi.hoisted(() => ({
    queries: [] as { text: string; values: unknown[] }[],
    rows: new Map<RegExp, unknown[]>(),
    perm: vi.fn(),
    dispatchFrom: vi.fn(),
}));

vi.mock('../src/lib/db', () => ({
    sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({ text: strings.join('?'), values }),
    withOrgTx: async (_org: string, q: Q) => {
        m.queries.push(q);
        for (const [re, rows] of m.rows) if (re.test(q.text)) return [rows];
        return [[]];
    },
    getActiveOrgId: async () => 'org-a',
    logAudit: vi.fn(),
    reqIp: () => '127.0.0.1',
}));
vi.mock('../src/lib/queries', () => ({ requirePerm: m.perm, invalidateMoneyCaches: vi.fn() }));
vi.mock('../src/lib/ratelimit', () => ({ strictRateLimit: async () => ({ ok: true }), strictLimitResponse: () => null }));
vi.mock('../src/lib/webhooks', () => ({ dispatchQuoteEvent: vi.fn(), dispatchQuoteEventFrom: m.dispatchFrom }));
vi.mock('../src/lib/after', () => ({ after: vi.fn() }));
vi.mock('../src/lib/email', () => ({ notifyQuoteSent: vi.fn() }));
vi.mock('../src/lib/billing', () => ({ reserveUsage: vi.fn(), cancelUsage: vi.fn(), flushUsageReservation: vi.fn() }));
vi.mock('../src/lib/org-entitlements', () => ({
    requireEntitlement: vi.fn(), assertResourceCapacity: vi.fn(), checkEntitlement: vi.fn(),
    parsedResourceLimit: vi.fn(), ResourceLimitReachedError: class extends Error {},
}));
vi.mock('../src/lib/fiscal/emit', () => ({ emitFiscalDocument: vi.fn() }));
vi.mock('../src/lib/cobros', () => ({ materializeAnticipoCobros: vi.fn() }));
vi.mock('../src/lib/impuestos-db', () => ({
    taxCatalogFor: async () => ({ resolve: () => 0.16, defaultRate: 0.16, retenciones: [] }),
    TaxCatalogUnavailableError: class extends Error {},
}));
vi.mock('../src/lib/posthog-server', () => ({ trackServer: vi.fn() }));
vi.mock('../src/lib/fx/FXService', () => ({ FXService: { getExchangeRate: vi.fn() }, FXUnavailableError: class extends Error {} }));
vi.mock('../src/lib/context', () => ({ currentUserId: () => 'user-a' }));
vi.mock('../src/lib/fmt-server', () => ({ intlLocale: () => 'es-MX' }));
vi.mock('../src/lib/log', () => ({ log: { error: vi.fn() } }));

const { assertClienteDeOrg, productosDeOrg, QuoteError } = await import('../src/lib/cotizaciones');
const { PATCH, DELETE } = await import('../src/pages/api/cotizaciones/[id]');

const CLIENTE = '11111111-1111-4111-8111-111111111111';
const PRODUCTO = '22222222-2222-4222-8222-222222222222';
const AJENO = '33333333-3333-4333-8333-333333333333';

beforeEach(() => {
    vi.clearAllMocks();
    m.queries.length = 0;
    m.rows.clear();
    m.perm.mockResolvedValue(null);
});

describe('assertClienteDeOrg', () => {
    it('acepta un cliente de la org y filtra por org_id', async () => {
        m.rows.set(/from clientes/, [{ id: CLIENTE }]);
        await expect(assertClienteDeOrg('org-a', CLIENTE)).resolves.toBeUndefined();
        expect(m.queries[0].values).toEqual([CLIENTE, 'org-a']);
    });

    it('rechaza con 404 un cliente de otra org', async () => {
        const err = await assertClienteDeOrg('org-a', AJENO).catch((e) => e);
        expect(err).toBeInstanceOf(QuoteError);
        expect(err.status).toBe(404);
    });

    it('rechaza un id que no es UUID sin consultar la base', async () => {
        await expect(assertClienteDeOrg('org-a', "x' or 1=1")).rejects.toBeInstanceOf(QuoteError);
        expect(m.queries).toHaveLength(0);
    });
});

describe('productosDeOrg', () => {
    it('solo devuelve productos de la org', async () => {
        m.rows.set(/from productos/, [{ id: PRODUCTO }]);
        const propios = await productosDeOrg('org-a', [PRODUCTO, AJENO, 'no-uuid', null, PRODUCTO]);
        expect([...propios]).toEqual([PRODUCTO]);
        expect(m.queries[0].values).toEqual(['org-a', [PRODUCTO, AJENO]]);
    });

    it('sin candidatos no consulta la base', async () => {
        expect((await productosDeOrg('org-a', [null, undefined, ''])).size).toBe(0);
        expect(m.queries).toHaveLength(0);
    });
});

describe('PATCH /api/cotizaciones/[id]', () => {
    const patch = (body: Record<string, unknown>) =>
        PATCH({
            params: { id: 'cot-1' },
            request: new Request('https://cord.test/api/cotizaciones/cot-1', { method: 'PATCH', body: JSON.stringify(body) }),
        } as any) as Promise<Response>;

    beforeEach(() => {
        m.rows.set(/select id, status, version/, [{ id: 'cot-1', status: 'draft', version: 1, base_currency: 'MXN', fiscal_currency: 'MXN', fx_rate: 1 }]);
    });

    it('un borrador no puede apuntar al cliente de otra org', async () => {
        const res = await patch({ action: 'update_draft', cliente_id: AJENO, items: [{ descripcion: 'x', cantidad: 1, precio_unitario: 10 }] });
        expect(res.status).toBe(404);
        expect(m.queries.some((q) => /update cotizaciones set/.test(q.text))).toBe(false);
        expect(m.queries.some((q) => /delete from cotizacion_items/.test(q.text))).toBe(false);
    });

    it('un producto de otra org se guarda sin referencia', async () => {
        m.rows.set(/from clientes/, [{ id: CLIENTE }]);
        m.rows.set(/from productos/, [{ id: PRODUCTO }]);
        const res = await patch({
            action: 'update_draft',
            cliente_id: CLIENTE,
            items: [
                { producto_id: PRODUCTO, descripcion: 'propio', cantidad: 1, precio_unitario: 10 },
                { producto_id: AJENO, descripcion: 'ajeno', cantidad: 1, precio_unitario: 10 },
            ],
        });
        expect(res.status).toBe(200);
        const inserts = m.queries.filter((q) => /insert into cotizacion_items/.test(q.text));
        expect(inserts.map((q) => q.values[1])).toEqual([PRODUCTO, null]);
    });
});

describe('DELETE /api/cotizaciones/[id]', () => {
    const del = () => DELETE({ params: { id: 'cot-1' } } as any) as Promise<Response>;

    it('exige el permiso cotizar y sin él no toca la base', async () => {
        m.perm.mockResolvedValue(new Response('{}', { status: 403 }));
        expect((await del()).status).toBe(403);
        expect(m.perm).toHaveBeenCalledWith('cotizar');
        expect(m.queries).toHaveLength(0);
    });

    it('con permiso borra el borrador', async () => {
        m.rows.set(/select c.id, c.folio, c.status/, [{ id: 'cot-1', folio: 'COT-1', status: 'draft' }]);
        m.rows.set(/delete from cotizaciones/, [{ id: 'cot-1' }]);
        expect((await del()).status).toBe(200);
        expect(m.dispatchFrom).toHaveBeenCalled();
    });
});

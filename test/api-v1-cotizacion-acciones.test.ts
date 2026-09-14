import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
    scopes: [] as string[],
    run: vi.fn(),
    del: vi.fn(),
    limit: vi.fn(),
}));

vi.mock('../src/lib/apikey', () => ({
    withApiAuth: (need: string, handler: any) => {
        m.scopes.push(need);
        return (ctx: any) => handler(ctx, { orgId: 'org-a', keyId: 'key-1', scope: 'write', mode: 'live', type: 'secret' });
    },
}));
vi.mock('../src/lib/queries', () => ({ getCotizacion: vi.fn() }));
vi.mock('../src/lib/db', () => ({ getActiveOrgId: async () => 'org-a', reqIp: () => '10.0.0.1' }));
vi.mock('../src/lib/public-links', () => ({ publicDocumentUrl: async () => 'x' }));
vi.mock('../src/lib/ratelimit', () => ({
    strictRateLimit: m.limit,
    strictLimitResponse: (r: { ok: boolean }) => (r.ok ? null : new Response('{}', { status: 429 })),
}));
vi.mock('../src/lib/actions/quotes', () => ({ runQuoteAction: m.run, deleteQuoteDraft: m.del }));

const { POST, DELETE } = await import('../src/pages/api/v1/cotizaciones/[id]');

const ID = '11111111-1111-4111-8111-111111111111';
const post = (body: unknown, id = ID) => (POST as any)({
    params: { id },
    request: new Request(`https://cord.test/api/v1/cotizaciones/${id}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
}) as Promise<Response>;

beforeEach(() => {
    vi.clearAllMocks();
    m.limit.mockResolvedValue({ ok: true });
    m.run.mockResolvedValue({ status: 200, body: { ok: true, status: 'approved' } });
    m.del.mockResolvedValue({ status: 200, body: { ok: true } });
});

describe('POST /api/v1/cotizaciones/[id]', () => {
    it('GET exige read; POST y DELETE exigen write', () => {
        expect(m.scopes).toEqual(['read', 'write', 'write']);
    });

    it('ejecuta la acción con el actor de la llave y responde en formato de API', async () => {
        const res = await post({ action: 'approve' });
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ data: { ok: true, status: 'approved' } });
        expect(m.run).toHaveBeenCalledWith(
            expect.objectContaining({ orgId: 'org-a', actor: 'api:key-1', source: 'api', ip: '10.0.0.1' }),
            ID, { action: 'approve' });
        expect(m.limit).toHaveBeenCalledWith('cotizacion-patch:org-a', 120, 60);
    });

    it('mark_paid se traduce a paid y acota el método de pago', async () => {
        await post({ action: 'mark_paid', payment_method: 'x'.repeat(200) });
        const input = m.run.mock.calls[0][2];
        expect(input.action).toBe('paid');
        expect(input.payment_method).toHaveLength(40);
    });

    it.each(['invoiced', 'update_draft', 'approve_request', 'reply', 'paid', ''])('no expone la acción interna "%s"', async (action) => {
        const res = await post({ action });
        expect(res.status).toBe(400);
        expect((await res.json()).code).toBe('invalid_request');
        expect(m.run).not.toHaveBeenCalled();
    });

    it('no reenvía campos arbitrarios del body a la acción', async () => {
        await post({ action: 'send', items: [{ descripcion: 'x' }], cliente_id: ID });
        expect(m.run.mock.calls[0][2]).toEqual({ action: 'send' });
    });

    it('un id que no es UUID responde 404 sin ejecutar nada', async () => {
        expect((await post({ action: 'approve' }, 'abc')).status).toBe(404);
        expect(m.run).not.toHaveBeenCalled();
    });

    it('con el límite agotado responde 429 sin ejecutar', async () => {
        m.limit.mockResolvedValue({ ok: false });
        expect((await post({ action: 'approve' })).status).toBe(429);
        expect(m.run).not.toHaveBeenCalled();
    });

    it('los errores de la acción llevan code', async () => {
        m.run.mockResolvedValue({ status: 409, body: { error: 'No se puede pasar de "draft" con esta acción' } });
        const res = await post({ action: 'approve' });
        expect(res.status).toBe(409);
        expect(await res.json()).toEqual({ error: 'No se puede pasar de "draft" con esta acción', code: 'invalid_state' });
    });
});

describe('DELETE /api/v1/cotizaciones/[id]', () => {
    it('borra el borrador con el actor de la llave', async () => {
        const res = await (DELETE as any)({ params: { id: ID }, request: new Request('https://cord.test', { method: 'DELETE' }) });
        expect(res.status).toBe(200);
        expect(m.del).toHaveBeenCalledWith(expect.objectContaining({ actor: 'api:key-1' }), ID);
    });
});

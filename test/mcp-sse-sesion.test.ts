import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ auth: null as any, session: null as any, handle: vi.fn(), push: vi.fn() }));

vi.mock('../src/lib/apikey', () => ({
    authApiKey: async () => m.auth,
    checkApiKeyRateLimit: async () => null,
    meterApiUsage: async () => null,
    logApiRequest: vi.fn(),
}));
vi.mock('../src/lib/mcp/session-store', () => ({ getSession: async () => m.session, pushOutbox: m.push, touchSession: vi.fn() }));
vi.mock('../src/lib/mcp/rpc', () => ({
    handle: m.handle, routeLabel: () => '/mcp/x', posthogMcp: null,
    RpcError: class extends Error { code = -1; },
}));

const { POST } = await import('../src/pages/api/mcp/message');

const post = () => POST({
    request: new Request('https://cordhq.app/api/mcp/message?sessionId=s1', { method: 'POST', body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'crear_cliente' } }) }),
    url: new URL('https://cordhq.app/api/mcp/message?sessionId=s1'),
} as any) as Promise<Response>;

beforeEach(() => {
    vi.clearAllMocks();
    m.session = { orgId: 'org-a', keyId: 'key-write', scope: 'write' };
    m.handle.mockResolvedValue({ ok: true });
});

describe('POST /api/mcp/message', () => {
    it('otra llave de la misma organización no hereda la sesión', async () => {
        m.auth = { orgId: 'org-a', keyId: 'key-read', scope: 'read', mode: 'live' };
        const res = await post();
        expect(res.status).toBe(403);
        expect(m.handle).not.toHaveBeenCalled();
    });

    it('la llave dueña ejecuta con su propio permiso y modo', async () => {
        m.auth = { orgId: 'org-a', keyId: 'key-write', scope: 'write', mode: 'test' };
        const res = await post();
        expect(res.status).toBe(202);
        expect(m.handle.mock.calls[0][1]).toMatchObject({ keyId: 'key-write', scope: 'write', mode: 'test', orgId: 'org-a' });
    });
});

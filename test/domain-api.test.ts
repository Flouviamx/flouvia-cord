import { beforeEach, describe, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ perm: vi.fn(), org: vi.fn(), fresh: vi.fn(), limit: vi.fn(), state: vi.fn(),
    register: vi.fn(), disconnect: vi.fn(), verify: vi.fn() }));
vi.mock('../src/lib/db', () => ({ getActiveOrgId: m.org }));
vi.mock('../src/lib/queries', () => ({ requirePerm: m.perm }));
vi.mock('../src/lib/step-up', () => ({ requireFreshAuth: m.fresh }));
vi.mock('../src/lib/context', () => ({ currentLocale: () => 'es' }));
vi.mock('../src/lib/log', () => ({ log: { warn: vi.fn() } }));
vi.mock('../src/lib/ratelimit', () => ({ strictRateLimit: m.limit,
    strictLimitResponse: (r: any) => r.ok ? null : new Response('limited', { status: 429 }) }));
vi.mock('../src/lib/customer-domains', () => ({ domainState: m.state, registerCustomerDomain: m.register,
    disconnectCustomerDomain: m.disconnect, verifyCustomerDomain: m.verify,
    DomainError: class extends Error { constructor(public code: string, public status = 409) { super(code); } },
}));
import { GET, POST, DELETE } from '../src/pages/api/domains/index';
import { POST as VERIFY } from '../src/pages/api/domains/verify';
beforeEach(() => {
    vi.clearAllMocks(); m.org.mockResolvedValue('org-from-session'); m.perm.mockResolvedValue(null);
    m.fresh.mockResolvedValue(null); m.limit.mockResolvedValue({ ok: true }); m.state.mockResolvedValue({ domain: null });
    m.register.mockResolvedValue(undefined);
});
function post(body: unknown) { return POST({ request: new Request('https://cordhq.app/api/domains', {
    method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' },
}) } as any); }
describe('domain session API', () => {
    it('requires settings permission before resolving a tenant', async () => {
        m.perm.mockResolvedValue(new Response('denied', { status: 403 }));
        expect((await GET({} as any)).status).toBe(403); expect(m.org).not.toHaveBeenCalled();
        expect((await post({ hostname: 'quotes.acme.com' })).status).toBe(403);
        expect(m.register).not.toHaveBeenCalled();
    });
    it('requires fresh authentication for all writes', async () => {
        m.fresh.mockResolvedValue(new Response('reauth', { status: 428 }));
        expect((await post({ hostname: 'quotes.acme.com' })).status).toBe(428);
        expect((await DELETE({} as any)).status).toBe(428); expect((await VERIFY({} as any)).status).toBe(428);
        expect(m.register).not.toHaveBeenCalled(); expect(m.disconnect).not.toHaveBeenCalled(); expect(m.verify).not.toHaveBeenCalled();
    });
    it('uses the session organization and disallows an organization supplied in JSON', async () => {
        expect((await post({ hostname: 'quotes.acme.com', orgId: 'victim' })).status).toBe(422);
        expect((await post({ hostname: 'quotes.acme.com' })).status).toBe(201);
        expect(m.register).toHaveBeenCalledExactlyOnceWith('org-from-session', 'quotes.acme.com');
        expect(m.limit).toHaveBeenCalledWith('domains:write:org-from-session', 6, 60);
    });
    it('fails closed under rate limiting', async () => {
        m.limit.mockResolvedValue({ ok: false });
        expect((await post({ hostname: 'quotes.acme.com' })).status).toBe(429); expect(m.register).not.toHaveBeenCalled();
    });
    it('does not leak provider credentials/errors and marks responses private', async () => {
        m.register.mockRejectedValue(new Error('VERCEL_TOKEN=secret'));
        const res = await post({ hostname: 'quotes.acme.com' }); expect(res.status).toBe(503);
        expect(await res.text()).not.toContain('secret'); expect(res.headers.get('cache-control')).toContain('no-store');
    });
});

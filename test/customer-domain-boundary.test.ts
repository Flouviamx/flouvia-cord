import { beforeEach, describe, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ enabled: vi.fn(), resolve: vi.fn(), read: vi.fn(), eligible: vi.fn(),
    verify: vi.fn(), quote: vi.fn(), invoice: vi.fn(), tx: vi.fn() }));
vi.mock('../src/lib/db', () => ({ resolveCustomerDomain: m.resolve, resolvePublicQuote: m.quote,
    resolvePublicInvoice: m.invoice, withOrgTx: m.tx, sql: vi.fn() }));
vi.mock('../src/lib/vercel-domains', () => ({ domainsEnabled: m.enabled }));
vi.mock('../src/lib/customer-domains', () => ({ readCustomerDomain: m.read, domainEligible: m.eligible,
    verifyCustomerDomain: m.verify, domainProbeProof: () => 'proof' }));
vi.mock('../src/lib/public-links', () => ({ canonicalPublicOrigin: () => 'https://cordhq.app' }));
import { customerDomainBoundary, isPlatformHostname } from '../src/lib/customer-domain-middleware';

const host = 'quotes.acme.com';
const active = () => ({ hostname: host, status: 'active', provider_owned: true, verified_at: new Date().toISOString() });
beforeEach(() => {
    vi.clearAllMocks(); m.enabled.mockReturnValue(true); m.resolve.mockResolvedValue('org-a');
    m.read.mockResolvedValue(active()); m.eligible.mockResolvedValue(true);
    m.quote.mockResolvedValue({ orgId: 'org-a' }); m.invoice.mockResolvedValue({ orgId: 'org-a' });
    m.tx.mockResolvedValue([[{ nombre: '<script>bad</script>', idioma: 'es' }]]);
});
function run(path: string, method = 'GET', headers: Record<string, string> = {}, hostname = host) {
    const url = new URL('https://' + hostname + path);
    const context: any = { url, request: new Request(url, { method, headers }), locals: {} };
    const next = vi.fn(async () => new Response('document'));
    return { response: Promise.resolve(customerDomainBoundary(context, next)).then(res => {
        if (!(res instanceof Response)) throw new Error('Expected a response from host boundary');
        return res;
    }), next, context };
}
describe('customer host boundary', () => {
    it('leaves exact platform hosts alone, not their lookalikes', async () => {
        const r = run('/app', 'GET', {}, 'cordhq.app');
        expect((await r.response).status).toBe(200); expect(r.next).toHaveBeenCalled();
        expect(isPlatformHostname('cordhq.app.attacker.com')).toBe(false);
        expect(m.resolve).not.toHaveBeenCalled();
    });
    it.each(['build.cordhq.app', 'pay.cordhq.app'])('preserves existing production host %s even during rollout pause', async hostname => {
        m.enabled.mockReturnValue(false);
        const r = run('/app', 'GET', {}, hostname);
        expect((await r.response).status).toBe(200);
        expect(r.next).toHaveBeenCalled(); expect(m.resolve).not.toHaveBeenCalled();
        expect(isPlatformHostname(hostname + '.attacker.com')).toBe(false);
    });
    it.each(['/app', '/sign-in', '/api/auth/login', '/api/domains', '/api/v1/cotizaciones', '/ops', '/billing'])('rejects forbidden %s before resolving a tenant', async path => {
        const r = run(path); expect((await r.response).status).toBe(404);
        expect(r.next).not.toHaveBeenCalled(); expect(m.resolve).not.toHaveBeenCalled();
    });
    it('rejects unregistered and disabled hosts', async () => {
        m.resolve.mockResolvedValue(null); expect((await run('/').response).status).toBe(404);
        m.enabled.mockReturnValue(false); expect((await run('/').response).status).toBe(404);
    });
    it('rejects another organization’s quote and invoice tokens', async () => {
        m.quote.mockResolvedValue({ orgId: 'org-b' }); m.invoice.mockResolvedValue({ orgId: 'org-b' });
        for (const path of ['/q/abcdef123', '/api/i/abcdef123/payment-intent']) {
            const r = run(path); expect((await r.response).status).toBe(404); expect(r.next).not.toHaveBeenCalled();
        }
    });
    it('allows only same-origin mutations, never the Cord origin exception', async () => {
        for (const origin of ['', 'https://cordhq.app', 'https://attacker.com']) {
            expect((await run('/api/q/abcdef123', 'POST', origin ? { origin } : {}).response).status).toBe(403);
        }
        const r = run('/api/q/abcdef123', 'POST', { origin: 'https://' + host });
        expect((await r.response).status).toBe(200); expect(r.context.locals.customerDomainOrgId).toBe('org-a');
    });
    it('sets privacy headers and a cookie-blind marker', async () => {
        const r = run('/q/abcdef123', 'GET', { cookie: 'cord_session=forged; cord_test_mode=1' });
        const res = await r.response;
        expect(res.headers.get('cache-control')).toContain('no-store');
        expect(res.headers.get('x-robots-tag')).toContain('noindex');
        expect(res.headers.get('strict-transport-security')).not.toContain('includeSubDomains');
        expect(r.context.locals.customerDomainOrgId).toBe('org-a');
    });
    it('does not serve pending, revoked or stale domains', async () => {
        for (const extra of [{ status: 'pending' }, { removing: true }, { verified_at: '2000-01-01' }]) {
            m.read.mockResolvedValue({ ...active(), ...extra });
            const r = run('/q/abcdef123'); expect((await r.response).status).toBeGreaterThanOrEqual(400);
            expect(r.next).not.toHaveBeenCalled();
        }
        expect(m.verify).toHaveBeenCalledWith('org-a');
    });
    it('downgrades redirect reads to Cord but do not proxy writes', async () => {
        m.eligible.mockResolvedValue(false);
        const read = await run('/q/abcdef123?pagado=1').response;
        expect(read.status).toBe(302); expect(read.headers.get('location')).toBe('https://cordhq.app/q/abcdef123?pagado=1');
        expect((await run('/api/q/abcdef123', 'POST', { origin: 'https://' + host }).response).status).toBe(404);
    });
    it('recovers a transient failure on a later request, but never serves while it remains unverified', async () => {
        const failed = { ...active(), status: 'error', verified_at: null, error_code: 'provider_unavailable',
            last_checked_at: new Date(Date.now() - 120000).toISOString() };
        m.read.mockResolvedValueOnce(failed).mockResolvedValueOnce(active());
        expect((await run('/q/abcdef123').response).status).toBe(200);
        expect(m.verify).toHaveBeenCalledOnce();
        m.verify.mockClear();
        m.read.mockResolvedValue({ ...failed, last_checked_at: new Date().toISOString() });
        expect((await run('/q/abcdef123').response).status).toBe(503);
        expect(m.verify).not.toHaveBeenCalled();
    });
    it('serves the probe before activation but only after provider binding', async () => {
        m.read.mockResolvedValue({ ...active(), status: 'tls_pending' });
        expect(await (await run('/.well-known/cord-domain-check?nonce=' + 'a'.repeat(48)).response).text()).toBe('proof');
        m.read.mockResolvedValue({ ...active(), provider_owned: false });
        expect((await run('/.well-known/cord-domain-check?nonce=' + 'a'.repeat(48)).response).status).toBe(404);
    });
    it('escapes business names on the minimal root and discloses no document list', async () => {
        const body = await (await run('/').response).text();
        expect(body).toContain('&lt;script&gt;'); expect(body).not.toContain('<script>bad');
        expect(body).not.toContain('/q/');
    });
    it('fails closed on lookup failures', async () => {
        m.resolve.mockRejectedValue(new Error('database secret'));
        const res = await run('/q/abcdef123').response; expect(res.status).toBe(503);
        expect(await res.text()).not.toContain('secret');
    });
});

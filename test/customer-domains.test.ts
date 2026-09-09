import { beforeEach, describe, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ enabled: vi.fn(), access: vi.fn(), tx: vi.fn(), dns: vi.fn(), fetch: vi.fn(),
    get: vi.fn(), add: vi.fn(), config: vi.fn(), verify: vi.fn(), remove: vi.fn(), audit: vi.fn() }));
vi.mock('node:dns/promises', () => ({ Resolver: class { resolveTxt = m.dns; } }));
vi.mock('../src/lib/db', () => ({ withOrgTx: m.tx, logAudit: m.audit,
    sql: (s: TemplateStringsArray, ...values: unknown[]) => ({ text: s.join('?'), values }) }));
vi.mock('../src/lib/org-entitlements', () => ({ checkEntitlement: m.access }));
vi.mock('../src/lib/ssrf', () => ({ safeFetch: m.fetch }));
vi.mock('../src/lib/vercel-domains', () => ({ domainsEnabled: m.enabled,
    domainProviderConfig: () => ({ project: 'prj_a', team: 'team_a' }),
    getProviderDomain: m.get, addProviderDomain: m.add, getProviderConfig: m.config,
    verifyProviderDomain: m.verify, removeProviderDomain: m.remove,
    DomainProviderError: class extends Error { constructor(public status: number) { super('provider'); } },
}));
import { registerCustomerDomain, verifyCustomerDomain, disconnectCustomerDomain, domainProbeProof,
    domainState, type CustomerDomain } from '../src/lib/customer-domains';
let domain: CustomerDomain;
beforeEach(() => {
    vi.clearAllMocks(); m.enabled.mockReturnValue(true); m.access.mockResolvedValue({ ok: true, context: { isSandbox: false } });
    domain = { id: 'id-a', org_id: 'org-a', hostname: 'quotes.acme.com', verification_token: 'secret-txt',
        probe_secret: 'private-proof', status: 'pending', records: [], provider_owned: false, provider_project: null,
        provider_team: null, removing: false, last_checked_at: null, verified_at: null, error_code: null };
    m.tx.mockImplementation(async (_org, q) => {
        if (q.text.includes('select *') || q.text.includes('returning *')) return [[{ ...domain }]];
        return [[{ id: domain.id }]];
    });
    m.dns.mockResolvedValue([['cord-verification=secret-txt']]); m.get.mockResolvedValue(null);
    m.add.mockResolvedValue({ name: domain.hostname, projectId: 'prj_a', verified: true });
    m.config.mockResolvedValue({ misconfigured: false, configuredBy: 'CNAME', recommendedCNAME: [{ rank: 1, value: 'unique.vercel-dns-017.com' }] });
    m.fetch.mockImplementation(async (url: string) => ({ ok: true, body: domainProbeProof(domain, new URL(url).searchParams.get('nonce')!) }));
});
const checks = () => m.tx.mock.calls.filter(([, q]) => q.text.includes('last_checked_at = now()')).map(([, q]) => q.values);
describe('domain lifecycle', () => {
    it('reserves only a random ownership challenge, never contacts the provider on POST', async () => {
        await registerCustomerDomain('org-a', 'quotes.acme.com');
        expect(m.add).not.toHaveBeenCalled(); expect(m.get).not.toHaveBeenCalled();
        const [, q] = m.tx.mock.calls[0]; expect(q.values[0]).toBe('org-a');
        expect(q.values[2]).toMatch(/^[a-f0-9]{64}$/); expect(q.values[3]).not.toBe(q.values[2]);
        expect(q.values[4]).toContain('_cord.quotes.acme.com');
    });
    it.each([false, 'sandbox'])('blocks unpaid/sandbox %s before writes', async kind => {
        m.access.mockResolvedValue({ ok: kind !== false, context: { isSandbox: kind === 'sandbox' } });
        await expect(registerCustomerDomain('org-a', 'quotes.acme.com')).rejects.toMatchObject({ status: 402 });
        await expect(verifyCustomerDomain('org-a')).rejects.toMatchObject({ status: 402 });
        expect(m.tx).not.toHaveBeenCalled(); expect(m.add).not.toHaveBeenCalled();
    });
    it('does not bind without Cord TXT ownership even if a provider could call it verified', async () => {
        m.dns.mockResolvedValue([['wrong']]);
        await verifyCustomerDomain('org-a');
        expect(m.get).not.toHaveBeenCalled(); expect(m.add).not.toHaveBeenCalled();
        expect(checks()[0][0]).toBe('pending');
    });
    it('will not adopt an existing project alias', async () => {
        m.get.mockResolvedValue({ name: domain.hostname, projectId: 'prj_a', verified: true });
        await expect(verifyCustomerDomain('org-a')).rejects.toMatchObject({ code: 'domain_requires_support' });
        expect(m.add).not.toHaveBeenCalled(); expect(m.fetch).not.toHaveBeenCalled();
    });
    it('distinguishes missing TXT from a temporary DNS resolver failure', async () => {
        m.dns.mockRejectedValueOnce(Object.assign(new Error(), { code: 'ETIMEOUT' }));
        await expect(verifyCustomerDomain('org-a')).rejects.toMatchObject({ code: 'dns_unavailable', status: 503 });
        expect(checks()[0][2]).toBe('dns_unavailable');
        expect(m.get).not.toHaveBeenCalled();
        m.dns.mockRejectedValueOnce(Object.assign(new Error(), { code: 'ENODATA' }));
        await verifyCustomerDomain('org-a');
        expect(checks()[1][0]).toBe('pending');
    });
    it('requires DNS configuration independently from provider verified=true', async () => {
        m.config.mockResolvedValue({ misconfigured: true, configuredBy: null, recommendedCNAME: [{ rank: 1, value: 'unique.vercel-dns-017.com' }] });
        await verifyCustomerDomain('org-a');
        expect(checks()[0][0]).toBe('dns_pending'); expect(m.fetch).not.toHaveBeenCalled();
        expect(checks()[0][1]).toContain('unique.vercel-dns-017.com');
    });
    it('marks active only after a real HTTPS response with a matching per-host HMAC', async () => {
        await verifyCustomerDomain('org-a');
        expect(checks().map(c => c[0])).toEqual(['tls_pending', 'active']);
        expect(m.fetch.mock.calls[0][0]).toMatch(/^https:\/\/quotes.acme.com\//);
        expect(m.fetch.mock.calls[0][2]).toEqual({ timeoutMs: 8000, maxBodyBytes: 256 });
    });
    it('a TLS error or an unrelated server never activates the domain', async () => {
        m.fetch.mockResolvedValue({ ok: true, body: 'attacker' }); await verifyCustomerDomain('org-a');
        expect(checks().map(c => c[0])).toEqual(['tls_pending', 'tls_pending']);
    });
    it('will not operate in a different provider project/team', async () => {
        domain.provider_project = 'other'; domain.provider_team = 'team_a'; domain.provider_owned = true;
        await expect(verifyCustomerDomain('org-a')).rejects.toMatchObject({ code: 'provider_scope_changed' });
        expect(m.get).not.toHaveBeenCalled();
    });
    it('an exclusive lease prevents concurrent provisioning', async () => {
        m.tx.mockResolvedValue([[]]);
        await expect(verifyCustomerDomain('org-a')).rejects.toMatchObject({ code: 'domain_busy' });
        expect(m.add).not.toHaveBeenCalled();
    });
    it('disconnect is possible after downgrade or rollout pause, and never deletes an unowned alias', async () => {
        m.enabled.mockReturnValue(false); m.access.mockResolvedValue({ ok: false, context: { isSandbox: false } });
        await disconnectCustomerDomain('org-a');
        expect(m.remove).not.toHaveBeenCalled();
        expect(m.tx.mock.calls.some(([, q]) => q.text.includes('delete from org_domains'))).toBe(true);
    });
    it('revokes routing first and keeps a tombstone if provider deletion fails', async () => {
        domain.provider_owned = true; domain.provider_project = 'prj_a'; domain.provider_team = 'team_a';
        m.remove.mockRejectedValue(new Error('provider secret'));
        await expect(disconnectCustomerDomain('org-a')).rejects.toThrow();
        const lease = m.tx.mock.calls.find(([, q]) => q.text.includes('returning *'));
        expect(lease?.[1].values).toContain(true);
        expect(m.tx.mock.calls.some(([, q]) => q.text.includes('delete from org_domains'))).toBe(false);
        expect(m.tx.mock.calls.some(([, q]) => q.text.includes('disconnect_failed'))).toBe(true);
    });
    it('never returns probe secrets, internal identity or provider scope to settings', async () => {
        const state = JSON.stringify(await domainState('org-a'));
        expect(state).not.toContain('private-proof'); expect(state).not.toContain('org-a');
        expect(state).not.toContain('provider_project');
    });
});

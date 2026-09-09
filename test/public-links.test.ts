import { beforeEach, describe, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ enabled: vi.fn(), read: vi.fn(), eligible: vi.fn() }));
vi.mock('../src/lib/vercel-domains', () => ({ domainsEnabled: m.enabled }));
vi.mock('../src/lib/customer-domains', () => ({ readCustomerDomain: m.read, domainEligible: m.eligible }));
import { publicDocumentUrl } from '../src/lib/public-links';
beforeEach(() => {
    vi.clearAllMocks(); m.enabled.mockReturnValue(true); m.eligible.mockResolvedValue(true);
    m.read.mockResolvedValue({ hostname: 'quotes.acme.com', status: 'active', verified_at: new Date().toISOString() });
});
describe('public document URLs', () => {
    it('uses the verified custom origin for the owning organization', async () => {
        expect(await publicDocumentUrl('org-a', 'q', 'token', '/pay?x=1')).toBe('https://quotes.acme.com/q/token/pay?x=1');
        expect(m.read).toHaveBeenCalledWith('org-a'); expect(m.eligible).toHaveBeenCalledWith('org-a');
    });
    it('keeps Cord links when feature is disabled without reading the new schema', async () => {
        m.enabled.mockReturnValue(false);
        expect(await publicDocumentUrl('org-a', 'i', 'token')).toBe('https://cordhq.app/i/token');
        expect(m.read).not.toHaveBeenCalled();
    });
    it('falls back for sandbox/downgrade, pending, expired, removing and lookup failure', async () => {
        m.eligible.mockResolvedValue(false);
        expect(await publicDocumentUrl('sandbox', 'q', 'token')).toBe('https://cordhq.app/q/token');
        m.eligible.mockResolvedValue(true);
        for (const extra of [{ status: 'pending' }, { verified_at: null }, { removing: true }]) {
            m.read.mockResolvedValue({ hostname: 'quotes.acme.com', status: 'active', verified_at: new Date(), ...extra });
            expect(await publicDocumentUrl('org-a', 'i', 'token')).toBe('https://cordhq.app/i/token');
        }
        m.read.mockRejectedValue(new Error('db down'));
        expect(await publicDocumentUrl('org-a', 'q', 'token')).toBe('https://cordhq.app/q/token');
    });
});

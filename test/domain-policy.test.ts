import { describe, it, expect } from 'vitest';
import { normalizeCustomerHostname, publicDocumentIdentity, domainIsFresh, domainNeedsRecheck, DOMAIN_FRESH_MS, DOMAIN_RETRY_MS } from '../src/lib/domain-policy';

describe('customer hostname policy', () => {
    it.each(['quotes.acme.com', 'cotizaciones.negocio.com.mx', 'propuestas.agencia.co.uk'])('accepts owned subdomain %s', host => {
        expect(normalizeCustomerHostname('  ' + host.toUpperCase() + ' ')).toBe(host);
    });
    it.each(['acme.com', 'negocio.com.mx', 'co.uk', 'https://quotes.acme.com', 'quotes.acme.com/path',
        'quotes.acme.com:443', 'quotes.acme.com.', '*.acme.com', 'a..acme.com', 'a.-acme.com',
        '127.0.0.1', 'localhost', 'a.localhost', '169.254.169.254', 'a.cordhq.app', 'a.b.cordhq.app',
        'a.flouvia.com', 'a.vercel.app', 'a.github.io', 'a.xn--bcher-kva.de', 'bücher.acme.com',
        'a.invalid', 'a.com@evil.com', 'a.com\\evil.com', 'a'.repeat(64) + '.acme.com'])('rejects %s', host => {
        expect(() => normalizeCustomerHostname(host)).toThrow('invalid_hostname');
    });
    it('requires recent successful verification, including against future timestamps', () => {
        const now = Date.now();
        expect(domainIsFresh({ status: 'active', verified_at: new Date(now - 1000) }, now)).toBe(true);
        for (const at of [null, 'invalid', new Date(now + 1), new Date(now - DOMAIN_FRESH_MS)]) {
            expect(domainIsFresh({ status: 'active', verified_at: at }, now)).toBe(false);
        }
        expect(domainIsFresh({ status: 'pending', verified_at: new Date(now) }, now)).toBe(false);
    });
    it('extracts the tenant credential only from public document paths', () => {
        expect(publicDocumentIdentity('/api/q/abcdef123/payment-intent')).toEqual({ kind: 'q', token: 'abcdef123' });
        expect(publicDocumentIdentity('/i/abcdef123')).toEqual({ kind: 'i', token: 'abcdef123' });
        for (const path of ['/app', '/api/domains', '/api/q', '/q/demo', '/q/abc%2fdefghi', '/en/q/abcdef123']) {
            expect(publicDocumentIdentity(path)).toBeNull();
        }
    });
    it('retries recoverable failures after a cooldown without provisioning or retrying support/deletion errors', () => {
        const now = Date.now();
        const failed = { status: 'error', verified_at: null, provider_owned: true, error_code: 'provider_unavailable',
            last_checked_at: new Date(now - DOMAIN_RETRY_MS) };
        expect(domainNeedsRecheck(failed, now)).toBe(true);
        for (const status of ['pending', 'dns_pending', 'tls_pending']) expect(domainNeedsRecheck({ ...failed, status }, now)).toBe(true);
        for (const changes of [{ provider_owned: false }, { removing: true }, { error_code: 'disconnect_failed' },
            { error_code: 'domain_requires_support' }, { error_code: 'provider_scope_changed' },
            { last_checked_at: new Date(now - 1000) }, { last_checked_at: new Date(now + 1) },
            { status: 'active', verified_at: new Date(now) }]) expect(domainNeedsRecheck({ ...failed, ...changes }, now)).toBe(false);
    });
});

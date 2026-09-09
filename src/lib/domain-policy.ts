import { parse } from 'tldts';

export const DOMAIN_FRESH_MS = 24 * 60 * 60 * 1000;
export const DOMAIN_PROBE_PATH = '/.well-known/cord-domain-check';
export const DOMAIN_RETRY_MS = 60_000;

/** Only retry domains already provisioned by Cord; never provision from a public visit. */
export function domainNeedsRecheck(domain: {
    status: string; verified_at: string | Date | null; last_checked_at?: string | Date | null;
    provider_owned?: boolean; removing?: boolean; error_code?: string | null;
}, now = Date.now()): boolean {
    if (!domain.provider_owned || domain.removing || domainIsFresh(domain, now)) return false;
    if (domain.status === 'error' && !['provider_unavailable', 'dns_unavailable'].includes(domain.error_code || '')) return false;
    if (!['active', 'pending', 'dns_pending', 'tls_pending', 'error'].includes(domain.status)) return false;
    const last = domain.last_checked_at ? new Date(domain.last_checked_at).getTime() : 0;
    return !last || (last <= now && now - last >= DOMAIN_RETRY_MS);
}

/** Deliberately ASCII-only: no wildcard, apex, URL, port or IDN homograph. */
export function normalizeCustomerHostname(input: unknown): string {
    if (typeof input !== 'string') throw new Error('invalid_hostname');
    const host = input.trim().toLowerCase();
    if (host.length > 253 || !/^[a-z0-9.-]+$/.test(host) ||
        host.split('.').some(label => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label) || label.startsWith('xn--'))) {
        throw new Error('invalid_hostname');
    }
    const parsed = parse(host, { allowPrivateDomains: true });
    if (!parsed.isIcann || parsed.isPrivate || !parsed.domain || !parsed.subdomain || parsed.isIp ||
        ['cordhq.app', 'flouvia.com', 'vercel.app', 'vercel.com', 'vercel-dns.com'].some(d => host === d || host.endsWith('.' + d))) {
        throw new Error('invalid_hostname');
    }
    return host;
}

export function domainIsFresh(domain: { status: string; verified_at: string | Date | null }, now = Date.now()): boolean {
    const verified = domain.verified_at ? new Date(domain.verified_at).getTime() : 0;
    return domain.status === 'active' && verified > 0 && verified <= now && now - verified < DOMAIN_FRESH_MS;
}

/** Match only public document routes. A custom host is never an app origin. */
export function publicDocumentIdentity(path: string): { kind: 'q' | 'i'; token: string } | null {
    const match = /^(?:\/api)?\/(q|i)\/([a-zA-Z0-9_-]{8,200})(?:\/|$)/.exec(path);
    return match ? { kind: match[1] as 'q' | 'i', token: match[2] } : null;
}

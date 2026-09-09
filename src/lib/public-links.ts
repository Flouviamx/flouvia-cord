import { domainsEnabled } from './vercel-domains';
import { readCustomerDomain, domainEligible } from './customer-domains';
import { domainIsFresh } from './domain-policy';
import { reqContext } from './context';

const requestOrigins = new WeakMap<object, Map<string, Promise<string>>>();

/** Never derive email/payment links from a caller-controlled Host header. */
export function canonicalPublicOrigin(): string {
    return 'https://cordhq.app';
}
export async function publicOriginForOrg(orgId: string): Promise<string> {
    const context = reqContext.getStore();
    if (!context) return resolveOrigin(orgId);
    let cache = requestOrigins.get(context);
    if (!cache) { cache = new Map(); requestOrigins.set(context, cache); }
    if (!cache.has(orgId)) cache.set(orgId, resolveOrigin(orgId));
    return cache.get(orgId)!;
}
async function resolveOrigin(orgId: string): Promise<string> {
    if (!domainsEnabled()) return canonicalPublicOrigin();
    try {
        const domain = await readCustomerDomain(orgId);
        if (domain && !domain.removing && domainIsFresh(domain) && await domainEligible(orgId)) {
            return 'https://' + domain.hostname;
        }
    } catch { /* Preserve delivery using Cord when a custom host is unavailable. */ }
    return canonicalPublicOrigin();
}
export async function publicDocumentUrl(orgId: string, kind: 'q' | 'i', token: string, suffix = ''): Promise<string> {
    // suffix is a document-local path/query, never a second origin.
    if (suffix && !/^[/?#]/.test(suffix)) throw new Error('Invalid document URL suffix');
    const origin = token === 'demo' ? canonicalPublicOrigin() : await publicOriginForOrg(orgId);
    return origin + '/' + kind + '/' + encodeURIComponent(token) + suffix;
}

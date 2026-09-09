import type { MiddlewareHandler } from 'astro';
import { resolveCustomerDomain, resolvePublicQuote, resolvePublicInvoice, sql, withOrgTx } from './db';
import { domainIsFresh, domainNeedsRecheck, DOMAIN_PROBE_PATH, publicDocumentIdentity } from './domain-policy';
import { domainsEnabled } from './vercel-domains';
import { readCustomerDomain, domainEligible, domainProbeProof, verifyCustomerDomain } from './customer-domains';
import { canonicalPublicOrigin } from './public-links';

export function isPlatformHostname(host: string): boolean {
    const known = new Set(['cordhq.app', 'www.cordhq.app', 'dev.cordhq.app', 'docs.cordhq.app',
        'ops.cordhq.app', 'billing.cordhq.app', 'build.cordhq.app', 'pay.cordhq.app', 'cord.flouvia.com']);
    for (const value of [import.meta.env.VERCEL_URL || process.env.VERCEL_URL,
        import.meta.env.VERCEL_BRANCH_URL || process.env.VERCEL_BRANCH_URL,
        import.meta.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_PROJECT_PRODUCTION_URL]) {
        if (value && /^[a-z0-9.-]+\.vercel\.app$/i.test(value)) known.add(value.toLowerCase());
    }
    if (!import.meta.env.PROD) ['localhost', '127.0.0.1', '[::1]'].forEach(h => known.add(h));
    return known.has(host.toLowerCase());
}
const privateHeaders = {
    'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex, nofollow, noarchive',
    'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff',
};
function unavailable(status = 404) {
    return new Response(status === 404 ? 'Not found' : 'This link is temporarily unavailable. Please try again later.',
        { status, headers: { ...privateHeaders, ...(status === 503 ? { 'Retry-After': '60' } : {}) } });
}
const escapeHtml = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** Runs before session parsing. Customer origins cannot inherit Cord authority. */
export const customerDomainBoundary: MiddlewareHandler = async (context, next) => {
    const hostname = context.url.hostname.toLowerCase();
    if (isPlatformHostname(hostname)) return next();
    if (!domainsEnabled()) return unavailable();
    const path = context.url.pathname;
    const method = context.request.method;
    const identity = publicDocumentIdentity(path);
    const probe = path === DOMAIN_PROBE_PATH;
    // Do not hit the database at all for forbidden app/auth/API routes.
    if (!identity && path !== '/' && path !== '/robots.txt' && !probe && !path.startsWith('/_astro/')) return unavailable();
    try {
        const orgId = await resolveCustomerDomain(hostname);
        if (!orgId) return unavailable();
        let domain = await readCustomerDomain(orgId);
        if (!domain || domain.hostname !== hostname || domain.removing) return unavailable();
        if (probe) {
            const nonce = context.url.searchParams.get('nonce') || '';
            if (method !== 'GET' || !/^[a-f0-9]{48}$/.test(nonce) || !domain.provider_owned ||
                !['tls_pending', 'active'].includes(domain.status)) return unavailable();
            return new Response(domainProbeProof(domain, nonce), { headers: privateHeaders });
        }
        if (path === '/robots.txt' && (method === 'GET' || method === 'HEAD')) {
            return new Response('User-agent: *\nDisallow: /\n', { headers: { ...privateHeaders, 'Content-Type': 'text/plain' } });
        }
        // A token for a different tenant must not render even if the link is valid on Cord.
        if (identity) {
            const doc = await (identity.kind === 'q' ? resolvePublicQuote(identity.token) : resolvePublicInvoice(identity.token));
            if (!doc || doc.orgId !== orgId) return unavailable();
        }
        if (!['GET', 'HEAD', 'OPTIONS'].includes(method) && context.request.headers.get('origin') !== context.url.origin) {
            return new Response('Forbidden', { status: 403, headers: privateHeaders });
        }
        const eligible = await domainEligible(orgId);
        // Expired/pending connections recover on demand, with a durable cooldown + lease.
        // Failed ownership/HTTPS checks still fail closed until a full verification succeeds.
        if (eligible && domainNeedsRecheck(domain)) {
            await verifyCustomerDomain(orgId);
            domain = await readCustomerDomain(orgId);
        }
        if (!domain || !domainIsFresh(domain)) return unavailable(503);
        if (!eligible) {
            // Keep existing read links usable after downgrade, without granting premium access.
            if (identity && (method === 'GET' || method === 'HEAD')) {
                return new Response(null, { status: 302, headers: { ...privateHeaders,
                    Location: canonicalPublicOrigin() + path + context.url.search } });
            }
            return unavailable();
        }
        if (path === '/') {
            if (method !== 'GET' && method !== 'HEAD') return unavailable();
            const [rows] = await withOrgTx(orgId, sql`select nombre, idioma from orgs where id = ${orgId} limit 1`);
            const name = escapeHtml(String(rows[0]?.nombre || ''));
            const en = rows[0]?.idioma === 'en';
            const html = `<!doctype html><html lang="${en ? 'en' : 'es'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${name}</title><style>body{margin:0;background:#f5f5f7;color:#0a192f;font-family:Inter,system-ui,sans-serif;min-height:100svh;display:grid;place-items:center}main{padding:48px 28px;max-width:560px}small{letter-spacing:.12em;text-transform:uppercase;font-size:11px;color:#667085}h1{font-size:clamp(32px,7vw,52px);letter-spacing:-.04em;line-height:1.1;overflow-wrap:anywhere}p{line-height:1.7;color:#667085}@media(prefers-color-scheme:dark){body{background:#10151e;color:#f5f5f7}p,small{color:#a0aab8}}</style></head><body><main><small>${en ? 'Client documents' : 'Documentos para clientes'}</small><h1>${name}</h1><p>${en ? 'Open the personal link your contact sent you to view your quote or invoice.' : 'Abre el enlace personal que te compartió tu contacto para consultar tu cotización o factura.'}</p></main></body></html>`;
            return new Response(method === 'HEAD' ? null : html, { headers: { ...privateHeaders, 'Content-Type': 'text/html; charset=utf-8',
                'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'" } });
        }
        context.locals.customerDomainOrgId = orgId;
        const response = await next();
        for (const [key, value] of Object.entries(privateHeaders)) response.headers.set(key, value);
        // Never enable HSTS includeSubDomains/preload for a domain owned by a customer.
        response.headers.set('Strict-Transport-Security', 'max-age=31536000');
        return response;
    } catch { return unavailable(503); }
};

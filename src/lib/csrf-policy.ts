const CSRF_EXEMPT_WRITE_EXACT = new Set([
    '/api/stripe/webhook',
    '/api/stripe/webhook/',
    '/api/mcp',
    '/api/mcp/',
    '/api/mcp/message',
    '/api/mcp/message/',
]);

/**
 * Exento si y solo si la mutación usa una credencial no ambiental (HMAC,
 * Bearer, CRON_SECRET) y el handler debe operar sin cookies.
 */
export function isCsrfExemptWrite(path: string, method: string): boolean {
    if (!["POST", "PATCH", "PUT", "DELETE"].includes(method)) return false;
    if (CSRF_EXEMPT_WRITE_EXACT.has(path)) return true;
    if (path.startsWith('/api/v1/')) return true;
    if (path.startsWith('/api/cron/')) return true;
    const samlAcs = /^\/api\/auth\/saml\/[0-9a-fA-F-]{36}\/acs\/?$/;
    return method === 'POST' && samlAcs.test(path);
}

export function isAllowedMutationOrigin(
    path: string,
    originHeader: string | null,
    requestOrigin: string,
    siteOrigin?: string | null,
): boolean {
    if (!originHeader) return false;
    if (originHeader === requestOrigin) return true;
    const isOpsMutation = path === '/ops' || path.startsWith('/ops/')
        || path === '/api/ops' || path.startsWith('/api/ops/');
    return !isOpsMutation && !!siteOrigin && originHeader === siteOrigin;
}

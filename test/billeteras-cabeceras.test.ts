// Cabeceras del middleware en las superficies de cobro: los marcos de Stripe.js
// necesitan que la página les DELEGUE el permiso `payment` (Apple Pay y Google
// Pay); `payment=(self)` lo impedía. Fuera de esas páginas no cambia nada.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('astro:middleware', async () => import('astro/middleware'));
vi.mock('../src/lib/db', () => ({ getAppGates: vi.fn(), getActiveOrgId: async () => 'org-a', resolvePresentationContext: async () => {} }));
vi.mock('../src/lib/auth', () => ({
    validateSession: vi.fn(async () => null), authorizeSessionActivity: vi.fn(), SESSION_COOKIE: 'cord_session',
    setSessionCookies: vi.fn(), clearSessionCookies: vi.fn(),
}));
vi.mock('../src/lib/ops-auth', () => ({ OPS_SESSION_COOKIE: 'ops_session', validateOpsSession: vi.fn() }));
vi.mock('../src/lib/org-entitlements', () => ({ checkMemberSeatAccess: vi.fn() }));
vi.mock('../src/lib/ratelimit', () => ({ strictRateLimit: async () => ({ ok: true }), strictLimitResponse: () => null }));
vi.mock('../src/lib/log', () => ({ log: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

async function headers(path: string) {
    const { onRequest } = await import('../src/middleware');
    const url = new URL(path, 'http://localhost:4321');
    const next = vi.fn(async () => new Response('<html></html>', { headers: { 'Content-Type': 'text/html' } }));
    const context = {
        url, request: new Request(url, { method: 'GET' }),
        cookies: { get: () => undefined, set: vi.fn(), delete: vi.fn() },
        locals: {}, redirect: (location: string, status = 302) => new Response(null, { status, headers: { Location: location } }),
        rewrite: vi.fn(),
    };
    const response = await onRequest(context as any, next as any);
    if (!(response instanceof Response)) throw new Error('El middleware no devolvió una respuesta');
    return response.headers;
}

const directiva = (csp: string | null, nombre: string) =>
    (csp ?? '').split(';').map((d) => d.trim()).find((d) => d.startsWith(nombre + ' ')) ?? '';

beforeEach(() => { vi.resetModules(); });
afterEach(() => vi.unstubAllEnvs());

describe('Permissions-Policy y CSP de las superficies de cobro', () => {
    it.each(['/q/tok_abcdef123/pay', '/i/tok_abcdef123', '/portal/tok_abcdef123'])('%s delega payment a Stripe.js', async (path) => {
        const h = await headers(path);
        const pp = h.get('Permissions-Policy') ?? '';
        expect(pp).toContain('payment=(self "https://js.stripe.com" "https://*.js.stripe.com")');
        expect(pp).toContain('camera=()');
        const csp = h.get('Content-Security-Policy');
        expect(directiva(csp, 'script-src')).toContain('https://*.js.stripe.com');
        expect(directiva(csp, 'frame-src')).toContain('https://*.js.stripe.com');
        expect(directiva(csp, 'frame-src')).toContain('https://hooks.stripe.com');
    });

    it.each(['/q/tok_abcdef123', '/precios'])('%s conserva payment=(self) y la CSP general', async (path) => {
        const h = await headers(path);
        expect(h.get('Permissions-Policy')).toContain('payment=(self)');
        expect(h.get('Permissions-Policy')).not.toContain('js.stripe.com');
        expect(directiva(h.get('Content-Security-Policy'), 'frame-src')).not.toContain('*.js.stripe.com');
    });
});

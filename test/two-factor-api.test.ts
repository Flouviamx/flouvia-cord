import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ gates: vi.fn(), session: vi.fn(), seat: vi.fn(), activity: vi.fn() }));
vi.mock('astro:middleware', async () => import('astro/middleware'));
vi.mock('../src/lib/db', () => ({ getAppGates: mocks.gates, getActiveOrgId: async () => 'org-a', resolvePresentationContext: async () => {} }));
vi.mock('../src/lib/auth', () => ({
    validateSession: mocks.session, authorizeSessionActivity: mocks.activity, SESSION_COOKIE: 'cord_session',
    setSessionCookies: vi.fn(), clearSessionCookies: vi.fn(),
}));
vi.mock('../src/lib/ops-auth', () => ({ OPS_SESSION_COOKIE: 'ops_session', validateOpsSession: vi.fn() }));
vi.mock('../src/lib/org-entitlements', () => ({ checkMemberSeatAccess: mocks.seat }));
vi.mock('../src/lib/ratelimit', () => ({ strictRateLimit: async () => ({ ok: true }), strictLimitResponse: () => null }));
vi.mock('../src/lib/log', () => ({ log: { error: vi.fn() } }));

async function call(path: string, method = 'POST') {
    const { onRequest } = await import('../src/middleware');
    const url = new URL(path, 'http://localhost:4321');
    const next = vi.fn(async () => new Response('handler reached'));
    const context = {
        url, request: new Request(url, { method, headers: { origin: url.origin } }),
        cookies: { get: (name: string) => name === 'cord_session' ? { value: 'session' } : undefined, set: vi.fn(), delete: vi.fn() },
        locals: {}, redirect: (location: string, status = 302) => new Response(null, { status, headers: { Location: location } }),
    };
    const response = await onRequest(context as any, next as any);
    if (!(response instanceof Response)) throw new Error('El middleware no devolvió una respuesta');
    return { response, next };
}

beforeEach(() => {
    vi.resetModules(); vi.clearAllMocks();
    mocks.session.mockResolvedValue({ userId: 'user-a', sessionId: 'hash', idleMs: 0, slid: false });
    mocks.gates.mockResolvedValue({ needs2fa: true });
    mocks.activity.mockResolvedValue({ slid: false });
    mocks.seat.mockResolvedValue({ ok: true });
});
afterEach(() => vi.unstubAllEnvs());

describe('2FA obligatorio ante peticiones directas a la API', () => {
    it.each([['/api/clientes', 'POST'], ['/api/facturas', 'GET'], ['/api/org', 'PATCH'], ['/api/account/profile', 'PATCH']])(
        'rechaza %s %s antes de ejecutar su handler', async (path, method) => {
            const { response, next } = await call(path, method);
            expect(response.status).toBe(403);
            expect(await response.json()).toMatchObject({ code: 'two_factor_required' });
            expect(next).not.toHaveBeenCalled();
            expect(mocks.gates).toHaveBeenCalledWith('user-a', { strictSecurity: true });
        },
    );
    it.each(['/api/account/2fa/start', '/api/account/2fa/verify', '/api/account/reauthenticate', '/api/auth/logout'])(
        'permite completar recuperación en %s aunque el gate no esté disponible', async path => {
            mocks.gates.mockRejectedValue(new Error('database unavailable'));
            const { response, next } = await call(path);
            expect(response.status).toBe(200);
            expect(next).toHaveBeenCalledOnce();
            expect(mocks.gates).not.toHaveBeenCalled();
        },
    );
    it('falla cerrado cuando no puede verificar la política', async () => {
        mocks.gates.mockRejectedValue(new Error('secret database error'));
        const { response, next } = await call('/api/clientes');
        expect(response.status).toBe(503);
        expect(await response.text()).not.toContain('secret');
        expect(next).not.toHaveBeenCalled();
    });
    it('permite operar después de completar 2FA', async () => {
        mocks.gates.mockResolvedValue({ needs2fa: false });
        const { response, next } = await call('/api/clientes');
        expect(response.status).toBe(200);
        expect(next).toHaveBeenCalledOnce();
    });
    it('conserva el acceso anónimo a las descargas públicas por token', async () => {
        mocks.session.mockResolvedValue(null);
        const { response, next } = await call('/api/i/invoice-token/documents/pdf', 'GET');
        expect(response.status).toBe(200);
        expect(response.headers.get('referrer-policy')).toBe('no-referrer');
        expect(next).toHaveBeenCalledOnce();
        expect(mocks.gates).not.toHaveBeenCalled();
    });
    it('el endpoint interno de descarga sigue exigiendo sesión', async () => {
        mocks.session.mockResolvedValue(null);
        const { response, next } = await call('/api/fiscal/documents/id/pdf', 'GET');
        expect(response.status).toBe(401);
        expect(next).not.toHaveBeenCalled();
    });
});

describe('inactividad también en rutas de sesión', () => {
    it.each([['/api/clientes', 'GET'], ['/api/facturas', 'POST'], ['/api/billing/subscribe', 'POST'], ['/api/auth/passkeys/register', 'POST'], ['/api/auth/passkeys/register-options', 'POST']])(
        'bloquea %s antes del handler si la sesión ya venció', async (path, method) => {
            mocks.gates.mockResolvedValue({ needs2fa: false, sessionTimeoutMin: 15 });
            mocks.activity.mockResolvedValue(null);
            const { response, next } = await call(path, method);
            expect(response.status).toBe(401);
            expect(await response.json()).toMatchObject({ code: 'session_expired' });
            expect(next).not.toHaveBeenCalled();
            expect(mocks.activity).toHaveBeenCalledWith('hash', 'user-a', 15);
        },
    );
    it.each(['/app/facturas', '/billing'])('envía %s al login cuando vence la sesión', async path => {
        mocks.gates.mockResolvedValue({ needs2fa: false, sessionTimeoutMin: 15 });
        mocks.activity.mockResolvedValue(null);
        const { response, next } = await call(path, 'GET');
        expect(response.status).toBe(302);
        expect(response.headers.get('location')).toMatch(/^\/sign-in\?/);
        if (path === '/billing') expect(response.headers.get('location')).toContain(encodeURIComponent('/api/billing/handoff'));
        expect(next).not.toHaveBeenCalled();
    });
    it.each(['/docs/pagos/resumen', '/api/i/token/documents/pdf', '/api/account/2fa/start', '/api/auth/logout'])(
        'no renueva actividad al consultar una ruta pública o de recuperación: %s', async path => {
            const { response } = await call(path, path.startsWith('/api/account') || path.endsWith('logout') ? 'POST' : 'GET');
            expect(response.status).toBe(200);
            expect(mocks.activity).not.toHaveBeenCalled();
        },
    );
    it('no renueva actividad si no pudo obtener la política de la organización', async () => {
        mocks.gates.mockRejectedValue(new Error('policy unavailable'));
        const { response, next } = await call('/api/clientes');
        expect(response.status).toBe(503); expect(next).not.toHaveBeenCalled();
        expect(mocks.activity).not.toHaveBeenCalled();
    });
});

// A dónde llega el dinero (crítico C3 de la auditoría de oct 2026). Antes:
//   - un miembro con solo `equipo` se daba `cobros_config` a sí mismo;
//   - Mercado Pago se conectaba con el permiso `ajustes` y sin reautenticación;
//   - el traspaso a billing.cordhq.app abría una sesión "recién reautenticada"
//     para cualquier cookie robada.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
    rows: [] as any[], actor: { rol: 'owner', permisos: {}, esOwner: true } as any, user: 'user-actor' as string | null,
    fresh: vi.fn(), notify: vi.fn(), perm: vi.fn(), audit: vi.fn(), sqlCalls: [] as Array<{ text: string; values: unknown[] }>,
    createSession: vi.fn(), handoffRow: null as any, exchange: vi.fn(), cuenta: vi.fn(), save: vi.fn(), consume: vi.fn(),
}));
vi.mock('../src/lib/db', () => ({
    sql: (s: TemplateStringsArray, ...values: unknown[]) => {
        const q = { text: s.join('?'), values };
        m.sqlCalls.push(q);
        // `await sql\`...\`` del canje del traspaso.
        return Object.assign(Promise.resolve(m.handoffRow ? [m.handoffRow] : []), q);
    },
    getActiveOrgId: async () => 'org-1',
    logAudit: m.audit,
    reqIp: () => '203.0.113.7',
    withOrgTx: async (_org: string, ...qs: Array<{ text: string }>) => qs.map((q) => (/^\s*select/i.test(q.text) ? m.rows : [])),
}));
vi.mock('../src/lib/queries', async () => ({
    requirePerm: m.perm,
    getMyMembership: async () => m.actor,
    requireOwner: async () => (m.actor.esOwner ? null : new Response(null, { status: 403 })),
}));
vi.mock('../src/lib/step-up', () => ({ requireFreshAuth: m.fresh }));
vi.mock('../src/lib/context', () => ({ currentUserId: () => m.user, currentLocale: () => 'es' }));
vi.mock('../src/lib/auth-email', () => ({ notifyMoneyDestinationChange: m.notify, sendTeamInviteEmail: vi.fn(async () => ({ sent: true })) }));
vi.mock('../src/lib/after', () => ({ after: (p: Promise<unknown>) => { void p; } }));
vi.mock('../src/lib/org-entitlements', () => ({ requireEntitlement: async () => null, requireResourceCapacity: async () => null, resourceLimitError: () => null }));
vi.mock('../src/lib/ratelimit', () => ({ rateLimit: async () => ({ ok: true }), tooMany: () => new Response(null, { status: 429 }), strictRateLimit: async () => ({ ok: true }), strictLimitResponse: () => null }));
vi.mock('../src/lib/posthog-server', () => ({ trackServer: vi.fn() }));
vi.mock('../src/lib/auth', () => ({ sha256Hex: (v: string) => `h:${v}`, createSession: m.createSession, setSessionCookies: vi.fn() }));
vi.mock('../src/lib/integraciones/conexiones', () => ({ createOAuthState: async () => 'state-1', consumeOAuthState: m.consume }));
vi.mock('../src/lib/mercadopago', () => ({
    mpCredentials: () => ({ clientId: 'c', clientSecret: 's' }),
    mpAuthorizeUrl: () => 'https://auth.mercadopago.com/authorization?x=1',
    disconnectMp: vi.fn(),
    exchangeMpCode: m.exchange,
    fetchMpCuenta: m.cuenta,
    saveMpAccount: m.save,
    MP_SITE_COUNTRY: { MLM: 'MX', MCO: 'CO' },
}));
vi.mock('../src/lib/email', () => ({ siteOrigin: () => 'https://cordhq.app' }));
vi.mock('../src/lib/saml', () => ({
    updateConnection: vi.fn(async () => ({ id: 'c-1', nombre: 'IdP' })), deleteConnection: vi.fn(async () => true),
    SamlValidationError: class extends Error {},
}));

import { otorgaPermisoDeDinero, permisoDenegado } from '../src/lib/permissions';

const staleAuth = () => new Response(JSON.stringify({ error: 'reauthentication_required' }), { status: 428 });
const patch = async (body: Record<string, unknown>) => {
    const { PATCH } = await import('../src/pages/api/equipo');
    return PATCH({ request: new Request('https://cordhq.app/api/equipo', { method: 'PATCH', body: JSON.stringify(body) }) } as any) as Promise<Response>;
};

beforeEach(() => {
    vi.clearAllMocks();
    m.sqlCalls = [];
    m.user = 'user-actor';
    m.actor = { rol: 'owner', permisos: {}, esOwner: true };
    m.perm.mockResolvedValue(null);
    m.fresh.mockResolvedValue(null);
});

describe('quién puede repartir permisos', () => {
    it('nadie da ni quita un permiso que no tiene; el dueño los tiene todos', () => {
        const soloEquipo = { rol: 'miembro', permisos: { equipo: true }, esOwner: false };
        expect(permisoDenegado(soloEquipo, {}, { cobros_config: true })).toMatch(/no tienes/);
        expect(permisoDenegado(soloEquipo, { reembolsar: true }, {})).toMatch(/no tienes/);
        expect(permisoDenegado(soloEquipo, {}, { equipo: true })).toBeNull();
        expect(permisoDenegado({ rol: 'owner', permisos: {}, esOwner: true }, {}, { cobros_config: true, reembolsar: true })).toBeNull();
    });
    it('detecta cuándo se OTORGA un permiso sobre el dinero', () => {
        expect(otorgaPermisoDeDinero({}, { cobros_config: true, cotizar: true })).toEqual(['cobros_config']);
        expect(otorgaPermisoDeDinero({ cobros_config: true }, { cobros_config: true })).toEqual([]);
        expect(otorgaPermisoDeDinero({ reembolsar: true }, {})).toEqual([]);
    });
});

describe('PATCH /api/equipo', () => {
    it('nadie se cambia sus propios permisos (así se escalaba a cobros_config)', async () => {
        m.actor = { rol: 'miembro', permisos: { equipo: true }, esOwner: false };
        m.rows = [{ rol: 'miembro', permisos: { equipo: true }, email: 'yo@x.com', user_id: 'user-actor' }];
        const res = await patch({ id: 'm-1', permisos: { equipo: true, cobros_config: true } });
        expect(res.status).toBe(403);
        expect(m.sqlCalls.some((q) => q.text.includes('update org_members'))).toBe(false);
    });

    it('un miembro con solo `equipo` no le da `cobros_config` a otro', async () => {
        m.actor = { rol: 'miembro', permisos: { equipo: true }, esOwner: false };
        m.rows = [{ rol: 'miembro', permisos: {}, email: 'otro@x.com', user_id: 'user-otro' }];
        expect((await patch({ id: 'm-2', permisos: { cobros_config: true } })).status).toBe(403);
    });

    it('tampoco con un preset que lo incluye (admin trae cobros_config)', async () => {
        m.actor = { rol: 'miembro', permisos: { equipo: true }, esOwner: false };
        m.rows = [{ rol: 'vendedor', permisos: {}, email: 'otro@x.com', user_id: 'user-otro' }];
        expect((await patch({ id: 'm-2', rol: 'admin' })).status).toBe(403);
    });

    it('el dueño sí puede, pero solo con reautenticación reciente, y se avisa a los dueños', async () => {
        m.rows = [{ rol: 'vendedor', permisos: {}, email: 'otro@x.com', user_id: 'user-otro' }];
        m.fresh.mockResolvedValueOnce(staleAuth());
        expect((await patch({ id: 'm-2', permisos: { cobros_config: true } })).status).toBe(428);
        expect(m.notify).not.toHaveBeenCalled();

        const ok = await patch({ id: 'm-2', permisos: { cobros_config: true } });
        expect(ok.status).toBe(200);
        expect(m.notify).toHaveBeenCalledWith('org-1', 'permiso', expect.objectContaining({ detalle: expect.stringContaining('cobros_config') }));
    });
});

describe('Mercado Pago: conectar es decidir a dónde llega el dinero', () => {
    it('conectar y desconectar exigen `cobros_config` y reautenticación', async () => {
        const { POST, DELETE } = await import('../src/pages/api/billing/mercadopago/connect');
        m.rows = [{ pais: 'MX', mp_user_id: '777', mp_nickname: 'TIENDA' }];
        m.fresh.mockResolvedValue(staleAuth());
        expect((await (POST as any)({ request: new Request('https://cordhq.app/x', { method: 'POST' }) })).status).toBe(428);
        expect((await (DELETE as any)({ request: new Request('https://cordhq.app/x', { method: 'DELETE' }) })).status).toBe(428);
        expect(m.perm.mock.calls.map((c) => c[0])).toEqual(['cobros_config', 'cobros_config']);
    });

    it('una cuenta de Mercado Pago de otro país se rechaza', async () => {
        const { GET } = await import('../src/pages/api/billing/mercadopago/callback');
        m.consume.mockResolvedValue(true);
        m.exchange.mockResolvedValue({ access_token: 'a', refresh_token: 'r', user_id: 999, expires_in: 100 });
        m.cuenta.mockResolvedValue({ nickname: 'AJENA', siteId: 'MCO' });
        m.rows = [{ mp_user_id: '777', mp_nickname: 'TIENDA', pais: 'MX' }];
        const url = new URL('https://cordhq.app/api/billing/mercadopago/callback?code=c&state=s');
        const res = await (GET as any)({ request: new Request(url), url, redirect: (to: string) => new Response(null, { status: 302, headers: { Location: to } }) });
        expect(res.headers.get('Location')).toContain('mp=pais');
        expect(m.save).not.toHaveBeenCalled();
    });

    it('cambiar a OTRA cuenta guarda, audita el antes y el después y avisa a los dueños', async () => {
        const { GET } = await import('../src/pages/api/billing/mercadopago/callback');
        m.consume.mockResolvedValue(true);
        m.exchange.mockResolvedValue({ access_token: 'a', refresh_token: 'r', user_id: 999, expires_in: 100 });
        m.cuenta.mockResolvedValue({ nickname: 'NUEVA', siteId: 'MLM' });
        m.rows = [{ mp_user_id: '777', mp_nickname: 'TIENDA', pais: 'MX' }];
        const url = new URL('https://cordhq.app/api/billing/mercadopago/callback?code=c&state=s');
        await (GET as any)({ request: new Request(url), url, redirect: (to: string) => new Response(null, { status: 302, headers: { Location: to } }) });
        expect(m.save).toHaveBeenCalled();
        expect(m.audit).toHaveBeenCalledWith('org-1', expect.objectContaining({ accion: 'cord_pagos.mercadopago_cambiado', detalle: expect.stringContaining('antes cuenta 777') }));
        expect(m.notify).toHaveBeenCalledWith('org-1', 'mp_cambiado', expect.objectContaining({ detalle: expect.stringContaining('999') }));
    });
});

describe('billing.cordhq.app no fabrica reautenticación', () => {
    it('la sesión del subdominio hereda la frescura de la sesión que pidió el traspaso', async () => {
        const { GET } = await import('../src/pages/billing/entrar');
        const hace = new Date(Date.now() - 3600_000).toISOString();
        m.handoffRow = { user_id: 'u-1', org_id: 'org-1', reauthenticated_at: hace };
        m.createSession.mockResolvedValue('token');
        const url = new URL(`https://billing.cordhq.app/billing/entrar?t=${'a'.repeat(64)}`);
        await (GET as any)({ url, request: new Request(url), cookies: { set: vi.fn() }, redirect: (to: string) => new Response(null, { status: 302, headers: { Location: to } }) });
        expect(m.createSession).toHaveBeenCalledWith('u-1', undefined, undefined, { reauthenticatedAt: hace });
        m.handoffRow = null;
    });

    it('sin reautenticación previa, la sesión nueva tampoco la tiene', async () => {
        const { GET } = await import('../src/pages/billing/entrar');
        m.handoffRow = { user_id: 'u-1', org_id: 'org-1', reauthenticated_at: null };
        m.createSession.mockResolvedValue('token');
        const url = new URL(`https://billing.cordhq.app/billing/entrar?t=${'b'.repeat(64)}`);
        await (GET as any)({ url, request: new Request(url), cookies: { set: vi.fn() }, redirect: (to: string) => new Response(null, { status: 302, headers: { Location: to } }) });
        expect(m.createSession).toHaveBeenCalledWith('u-1', undefined, undefined, { reauthenticatedAt: null });
        m.handoffRow = null;
    });
});

describe('SSO entrega el control de la cuenta: solo el dueño, con reautenticación', () => {
    const patchSso = async () => {
        const { PATCH } = await import('../src/pages/api/sso/connections/[id]');
        return (PATCH as any)({ params: { id: 'c-1' }, request: new Request('https://cordhq.app/x', { method: 'PATCH', body: JSON.stringify({ role_mappings: [{ attr: 'g', op: 'eq', value: 'x', preset: 'admin' }] }) }) }) as Promise<Response>;
    };
    it('un miembro con `equipo` ya no puede cambiar la conexión SSO (antes: se daba cobros_config por mapeo)', async () => {
        m.actor = { rol: 'miembro', permisos: { equipo: true }, esOwner: false };
        expect((await patchSso()).status).toBe(403);
    });
    it('el dueño sí, pero con reautenticación reciente y aviso a los dueños', async () => {
        m.fresh.mockResolvedValueOnce(staleAuth());
        expect((await patchSso()).status).toBe(428);
        expect((await patchSso()).status).toBe(200);
        expect(m.notify).toHaveBeenCalledWith('org-1', 'sso', expect.anything());
    });
});

describe('DELETE /api/equipo', () => {
    it('nadie revoca a quien tiene permisos que él no tiene', async () => {
        const { DELETE } = await import('../src/pages/api/equipo');
        m.actor = { rol: 'miembro', permisos: { equipo: true }, esOwner: false };
        m.rows = [{ rol: 'admin', permisos: { equipo: true, cobros_config: true } }];
        const res = await (DELETE as any)({ request: new Request('https://cordhq.app/api/equipo', { method: 'DELETE', body: JSON.stringify({ id: 'm-9' }) }) });
        expect(res.status).toBe(403);
    });
});

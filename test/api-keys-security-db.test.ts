import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';

const m = vi.hoisted(() => ({ db: null as any, audit: vi.fn(), org: '', hits: new Map<string, number>() }));

vi.mock('../src/lib/db', () => {
    const run = (q: { text: string; values: any[] }) => m.db.query(q.text, q.values).then((r: any) => r.rows);
    const sql = (s: TemplateStringsArray, ...values: any[]) => {
        const q: any = { text: s.reduce((text, part, i) => text + (i ? `$${i}` : '') + part, ''), values };
        q.then = (res: any, rej: any) => run(q).then(res, rej);
        q.catch = (rej: any) => run(q).catch(rej);
        return q;
    };
    return {
        sql,
        withOrgTx: async (org: string, ...queries: any[]) => m.db.transaction(async (tx: any) => {
            await tx.query("select set_config('app.org_id',$1,true)", [org]);
            const rows = [];
            for (const q of queries) rows.push((await tx.query(q.text, q.values)).rows);
            return rows;
        }),
        logAudit: m.audit,
        getActiveOrgId: async () => m.org,
        reqIp: () => '127.0.0.1',
        resolveSandboxOrgId: async (id: string) => id,
    };
});
vi.mock('../src/lib/context', async (orig) => ({ ...(await orig<any>()), currentUserId: () => 'user-1' }));
vi.mock('../src/lib/ratelimit', () => ({
    rateLimit: async (key: string, max: number) => {
        const n = (m.hits.get(key) ?? 0) + 1;
        m.hits.set(key, n);
        return { ok: n <= max, retryAfter: 60 };
    },
    tooMany: () => new Response('{}', { status: 429 }),
}));
vi.mock('../src/lib/permissions', () => ({ apiKeyLimit: () => 2, planLabel: () => 'Pro' }));
vi.mock('../src/lib/org-entitlements', () => ({ getEntitlementContext: async () => ({ effectivePlan: 'pro' }) }));
vi.mock('../src/lib/queries', () => ({ requirePerm: async () => null }));
vi.mock('../src/lib/posthog-server', () => ({ trackServer: vi.fn() }));
vi.mock('../src/lib/billing', () => ({ flushUsageReservation: vi.fn(), reserveUsage: vi.fn() }));

const { authApiKey } = await import('../src/lib/apikey');
const keys = await import('../src/pages/api/keys');

const A = '00000000-0000-4000-8000-00000000000a';
const migration = readFileSync(new URL('../db/migrations/2026-10-05-api-key-security.sql', import.meta.url), 'utf8');

beforeAll(async () => {
    m.db = new PGlite();
    await m.db.exec(`
        create table orgs(id uuid primary key, sandbox_of uuid, embed_domains text, is_demo boolean default false);
        create function cord_effective_plan(uuid) returns text language sql as $$ select 'pro' $$;
        create table oauth_clients(client_id text primary key, slug text, nombre text);
        create table api_keys(
            id uuid default gen_random_uuid() primary key, org_id uuid not null references orgs(id), nombre text not null,
            prefix text not null, last4 text not null, hash text not null, scope text not null default 'read',
            created_by text, created_at timestamptz default now(), last_used_at timestamptz, revoked_at timestamptz,
            mode text not null default 'live', type text not null default 'secret', oauth_client_id text, expires_at timestamptz, api_version text);
        create table oauth_grants(id uuid primary key default gen_random_uuid(), org_id uuid, api_key_id uuid, revoked_at timestamptz);
        create table webhooks(id uuid primary key default gen_random_uuid(), org_id uuid, url text, activo boolean default true, created_by_key uuid);
        insert into orgs (id) values ('${A}');`);
    await m.db.exec(migration);
    await m.db.exec(migration);
}, 15000);

beforeEach(async () => {
    vi.clearAllMocks();
    m.org = A;
    m.hits.clear();
    await m.db.exec('delete from webhooks; delete from api_keys;');
});

afterAll(async () => { await m.db.close(); });

const call = async (handler: any, method: string, body: unknown) => {
    const res: Response = await handler({ request: new Request('https://cord.test/api/keys', { method, body: JSON.stringify(body) }) });
    return { status: res.status, body: await res.json() as any };
};
const create = (body: Record<string, unknown>) => call(keys.POST, 'POST', { nombre: 'k', mode: 'test', ...body });

const auth = async (secret: string, path: string, need: 'read' | 'write' = 'read', headers: Record<string, string> = {}) => {
    const r = await authApiKey(new Request(`https://cord.test${path}`, { headers: { authorization: `Bearer ${secret}`, ...headers } }), need);
    return r instanceof Response ? { status: r.status, code: (await r.json() as any).code } : { status: 200, auth: r };
};

describe('llaves restringidas (rk_)', () => {
    it('cada ruta pasa solo con el nivel de su recurso', async () => {
        const { body } = await create({ type: 'restricted', permissions: { cotizaciones: 'write', clientes: 'read' } });
        expect(body.secret).toMatch(/^rk_test_[0-9a-f]{48}$/);
        const row = (await m.db.query('select created_by, scope, type, permissions from api_keys')).rows[0];
        expect(row).toMatchObject({ created_by: 'user-1', scope: 'write', type: 'secret' });
        expect(row.permissions.productos).toBe('none');

        expect(await auth(body.secret, '/api/v1/clientes')).toMatchObject({ status: 200, auth: { restricted: true } });
        expect((await auth(body.secret, '/api/v1/clientes/abc', 'write')).code).toBe('insufficient_permissions');
        expect((await auth(body.secret, '/api/v1/productos')).code).toBe('insufficient_permissions');
        expect((await auth(body.secret, '/api/v1/cotizaciones/x/aprobar', 'write')).status).toBe(200);
        expect((await auth(body.secret, '/api/v1/me')).status).toBe(200);
        expect((await auth(body.secret, '/api/v1/ruta-nueva')).code).toBe('insufficient_permissions');
        expect((await auth(body.secret, '/api/mcp')).code).toBe('insufficient_permissions');
    });

    it('rechaza permisos vacíos o desconocidos', async () => {
        expect((await create({ type: 'restricted', permissions: { cotizaciones: 'none' } })).status).toBe(400);
        expect((await create({ type: 'restricted', permissions: { admin: 'write' } })).status).toBe(400);
        expect((await create({ type: 'restricted', permissions: { clientes: 'all' } })).status).toBe(400);
        expect((await m.db.query('select count(*)::int n from api_keys')).rows[0].n).toBe(0);
    });
});

describe('IPs permitidas', () => {
    it('acepta el rango, rechaza lo demás y no se deja engañar por X-Forwarded-For', async () => {
        const { body } = await create({ allowed_ips: '10.0.0.0/8, 2001:db8::/32' });
        expect((await auth(body.secret, '/api/v1/me', 'read', { 'x-real-ip': '10.20.30.40' })).status).toBe(200);
        expect((await auth(body.secret, '/api/v1/me', 'read', { 'x-real-ip': '2001:db8::1' })).status).toBe(200);
        const spoof = await auth(body.secret, '/api/v1/me', 'read', { 'x-real-ip': '8.8.8.8', 'x-forwarded-for': '10.0.0.1' });
        expect(spoof).toMatchObject({ status: 403, code: 'ip_not_allowed' });
        await auth(body.secret, '/api/v1/me', 'read', { 'x-real-ip': '8.8.8.8' });
        await new Promise((r) => setTimeout(r, 20));
        const denials = m.audit.mock.calls.filter(([, e]) => e.accion === 'apikey.ip_rechazada');
        expect(denials).toHaveLength(1);
        expect(denials[0][1]).toMatchObject({ ip: '8.8.8.8', actor: 'system' });
    });

    it.each(['10.0.0.0/33', 'no-es-ip', '0.0.0.0/0', '1.2.3.4/8/1'])('rechaza %s', async (ip) => {
        expect((await create({ allowed_ips: ip })).status).toBe(400);
    });
});

describe('vencimiento y rotación', () => {
    it('una llave vencida responde key_expired y deja de contar contra el límite', async () => {
        expect((await create({ expires_in_days: 3 })).status).toBe(400);
        const a = await create({ expires_in_days: 7 });
        await create({});
        expect((await create({})).status).toBe(403);
        await m.db.query(`update api_keys set expires_at = now() - interval '1 minute' where expires_at is not null`);
        expect((await auth(a.body.secret, '/api/v1/me')).code).toBe('key_expired');
        const c = await create({});
        expect(c.status).toBe(200);
        expect((await auth(c.body.secret, '/api/v1/me')).status).toBe(200);
    });

    it('rotar con gracia deja vivas las dos llaves y mueve los webhooks de integración', async () => {
        const old = await create({ type: 'restricted', permissions: { webhooks: 'write' }, allowed_ips: '10.0.0.1' });
        await m.db.query(`insert into webhooks (org_id, url, created_by_key) values ($1, 'https://h.example', $2)`, [A, old.body.id]);
        await create({});
        const rolled = await call(keys.POST, 'POST', { action: 'roll', id: old.body.id, grace_hours: 24 });
        expect(rolled.status).toBe(200);
        expect(rolled.body.secret).toMatch(/^rk_test_/);
        const ip = { 'x-real-ip': '10.0.0.1' };
        expect((await auth(rolled.body.secret, '/api/v1/webhooks', 'write', ip)).status).toBe(200);
        expect((await auth(old.body.secret, '/api/v1/webhooks', 'write', ip)).status).toBe(200);
        expect((await m.db.query('select created_by_key from webhooks')).rows[0].created_by_key).toBe(rolled.body.id);

        await m.db.query(`update api_keys set expires_at = now() - interval '1 minute' where id = $1`, [old.body.id]);
        expect((await auth(old.body.secret, '/api/v1/webhooks', 'write', ip)).code).toBe('key_expired');
        expect((await call(keys.POST, 'POST', { action: 'roll', id: old.body.id, grace_hours: 24 })).status).toBe(404);
    });

    it('rotar sin gracia revoca la anterior en el acto', async () => {
        const old = await create({});
        const rolled = await call(keys.POST, 'POST', { action: 'roll', id: old.body.id, grace_hours: 0 });
        expect((await auth(old.body.secret, '/api/v1/me')).code).toBe('invalid_key');
        expect((await auth(rolled.body.secret, '/api/v1/me')).status).toBe(200);
        expect((await call(keys.POST, 'POST', { action: 'roll', id: rolled.body.id, grace_hours: 5 })).status).toBe(400);
    });
});

describe('edición', () => {
    it('cambia permisos de una rk_ e IPs de una sk_, nunca convierte una en otra', async () => {
        const rk = await create({ type: 'restricted', permissions: { clientes: 'read' } });
        const sk = await create({});
        expect((await call(keys.PATCH, 'PATCH', { id: rk.body.id, permissions: { clientes: 'write' } })).status).toBe(200);
        expect((await auth(rk.body.secret, '/api/v1/clientes', 'write')).status).toBe(200);
        expect((await call(keys.PATCH, 'PATCH', { id: sk.body.id, permissions: { clientes: 'read' } })).status).toBe(400);
        expect((await call(keys.PATCH, 'PATCH', { id: sk.body.id, allowed_ips: ['192.168.1.0/24'] })).status).toBe(200);
        expect((await auth(sk.body.secret, '/api/v1/me', 'read', { 'x-real-ip': '192.168.2.1' })).code).toBe('ip_not_allowed');
        expect((await call(keys.PATCH, 'PATCH', { id: sk.body.id, allowed_ips: [] })).status).toBe(200);
        expect((await auth(sk.body.secret, '/api/v1/me', 'read', { 'x-real-ip': '192.168.2.1' })).status).toBe(200);
        expect(m.audit).toHaveBeenCalledWith(A, expect.objectContaining({ accion: 'apikey.editada' }));
    });

    it('una Publishable Key no acepta IPs ni permisos', async () => {
        const pk = await create({ type: 'publishable', allowed_ips: '10.0.0.1', permissions: { clientes: 'read' } });
        const row = (await m.db.query('select allowed_ips, permissions from api_keys where id = $1', [pk.body.id])).rows[0];
        expect(row).toEqual({ allowed_ips: null, permissions: null });
        expect((await call(keys.PATCH, 'PATCH', { id: pk.body.id, allowed_ips: '10.0.0.1' })).status).toBe(400);
    });
});

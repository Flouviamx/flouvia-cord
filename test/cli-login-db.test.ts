import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';

const m = vi.hoisted(() => {
    process.env.ENCRYPTION_KEY = Buffer.alloc(32, 9).toString('base64');
    return { db: null as any, org: '' };
});

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
        logAudit: vi.fn(),
        getActiveOrgId: async () => m.org,
        reqIp: () => '127.0.0.1',
        resolveSandboxOrgId: async (id: string) => id,
    };
});
vi.mock('../src/lib/context', async (orig) => ({ ...(await orig<any>()), currentUserId: () => USER }));
vi.mock('../src/lib/ratelimit', () => ({ rateLimit: async () => ({ ok: true }), tooMany: () => new Response('{}', { status: 429 }) }));
vi.mock('../src/lib/permissions', () => ({ apiKeyLimit: () => 10, planLabel: () => 'Pro' }));
vi.mock('../src/lib/org-entitlements', () => ({ getEntitlementContext: async () => ({ effectivePlan: 'pro' }) }));
vi.mock('../src/lib/queries', () => ({ requirePerm: async () => null }));
vi.mock('../src/lib/posthog-server', () => ({ trackServer: vi.fn() }));
vi.mock('../src/lib/billing', () => ({ flushUsageReservation: vi.fn(), reserveUsage: vi.fn() }));

const ORG = '00000000-0000-4000-8000-00000000000a';
const USER = '00000000-0000-4000-8000-0000000000f1';
const { startLogin, findLogin, decideLogin, claimLogin, normalizeUserCode, cleanHost, newUserCode } = await import('../src/lib/cli-login');
const { authApiKey } = await import('../src/lib/apikey');

beforeAll(async () => {
    m.db = new PGlite();
    await m.db.exec(`
        create table orgs(id uuid primary key, sandbox_of uuid, embed_domains text, is_demo boolean default false);
        create table users(id uuid primary key);
        create function cord_effective_plan(uuid) returns text language sql as $$ select 'pro' $$;
        create table oauth_clients(client_id text primary key, slug text, nombre text);
        create table api_keys(
            id uuid default gen_random_uuid() primary key, org_id uuid not null references orgs(id), nombre text not null,
            prefix text not null, last4 text not null, hash text not null, scope text not null default 'read',
            created_by text, created_at timestamptz default now(), last_used_at timestamptz, revoked_at timestamptz,
            mode text not null default 'live', type text not null default 'secret', oauth_client_id text, expires_at timestamptz, api_version text);
        create table oauth_grants(id uuid primary key default gen_random_uuid(), org_id uuid, api_key_id uuid, revoked_at timestamptz);
        create table webhooks(id uuid primary key default gen_random_uuid(), org_id uuid, url text, activo boolean default true, created_by_key uuid);
        insert into orgs (id) values ('${ORG}');
        insert into users (id) values ('${USER}');`);
    await m.db.exec(readFileSync(new URL('../db/migrations/2026-10-05-api-key-security.sql', import.meta.url), 'utf8'));
    await m.db.exec(readFileSync(new URL('../db/migrations/2026-10-06-cli-logins.sql', import.meta.url), 'utf8'));
}, 15000);

beforeEach(async () => {
    m.org = ORG;
    await m.db.exec('delete from cli_logins; delete from api_keys;');
});

afterAll(async () => { await m.db.close(); });

const ctx = (host: string) => ({ orgId: ORG, userId: USER, host, request: new Request('https://cord.test/api/cli/login/decide', { method: 'POST' }) });

describe('cord login por navegador', () => {
    it('códigos legibles y normalización de lo que se teclea', () => {
        expect(newUserCode()).toMatch(/^[BCDFGHJKMNPQRTVWXZ2346789]{4}-[BCDFGHJKMNPQRTVWXZ2346789]{4}$/);
        expect(normalizeUserCode(' wxyz 2346 ')).toBe('WXYZ-2346');
        expect(normalizeUserCode('WXYZ-234')).toBeNull();
        expect(cleanHost('mac<script>-de-ana')).toBe('macscript-de-ana');
        expect(cleanHost('')).toBe('terminal');
    });

    it('aprobado: la terminal recibe una llave restringida de prueba una sola vez', async () => {
        const { deviceCode, userCode } = await startLogin('mac-de-ana');
        expect(await claimLogin(deviceCode)).toEqual({ estado: 'pendiente' });
        expect(await findLogin(userCode)).toMatchObject({ host: 'mac-de-ana', estado: 'pendiente', vigente: true });

        expect(await decideLogin(userCode, true, ctx('mac-de-ana'))).toEqual({ ok: true });
        const stored = (await m.db.query('select secret_enc, device_hash from cli_logins')).rows[0];
        expect(stored.secret_enc).not.toMatch(/rk_test_/);
        expect(stored.device_hash).not.toBe(deviceCode);

        const first = await claimLogin(deviceCode);
        expect(first.estado).toBe('aprobado');
        expect(first.apiKey).toMatch(/^rk_test_[0-9a-f]{48}$/);
        expect(await claimLogin(deviceCode)).toEqual({ estado: 'reclamado' });
        expect((await m.db.query('select secret_enc from cli_logins')).rows[0].secret_enc).toBeNull();

        const key = (await m.db.query('select nombre, mode, expires_at, permissions from api_keys')).rows[0];
        expect(key.nombre).toBe('CLI · mac-de-ana');
        expect(key.mode).toBe('test');
        expect(key.expires_at).not.toBeNull();
        const allowed = async (path: string, need: 'read' | 'write') => {
            const r = await authApiKey(new Request(`https://cord.test${path}`, { headers: { authorization: `Bearer ${first.apiKey}` } }), need);
            return !(r instanceof Response);
        };
        expect(await allowed('/api/v1/setup/plans', 'write')).toBe(true);
        expect(await allowed('/api/v1/test_helpers/listen', 'write')).toBe(true);
        expect(await allowed('/api/v1/events', 'read')).toBe(true);
        expect(await allowed('/api/v1/cotizaciones', 'read')).toBe(false);
        expect(await allowed('/api/v1/clientes', 'write')).toBe(false);
    });

    it('rechazado o vencido: no se crea ninguna llave', async () => {
        const a = await startLogin('x');
        expect(await decideLogin(a.userCode, false, ctx('x'))).toEqual({ ok: true });
        expect(await claimLogin(a.deviceCode)).toEqual({ estado: 'rechazado' });

        const b = await startLogin('y');
        await m.db.query("update cli_logins set expira_at = now() - interval '1 minute' where user_code = $1", [b.userCode]);
        expect(await claimLogin(b.deviceCode)).toEqual({ estado: 'vencido' });
        const r = await decideLogin(b.userCode, true, ctx('y'));
        expect(r.ok).toBe(false);
        const keys = (await m.db.query('select revoked_at from api_keys')).rows;
        expect(keys.every((k: any) => k.revoked_at !== null)).toBe(true);
    });

    it('un device code ajeno o malformado no revela nada', async () => {
        expect(await claimLogin('no-hex')).toEqual({ estado: 'invalido' });
        expect(await claimLogin('a'.repeat(64))).toEqual({ estado: 'invalido' });
    });
});

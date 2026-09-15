import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';

const m = vi.hoisted(() => ({ db: null as any, plan: 'pro', audit: vi.fn(), perm: vi.fn(), org: '' }));

vi.mock('../src/lib/db', () => ({
    sql: (s: TemplateStringsArray, ...values: any[]) => ({ text: s.reduce((text, part, i) => text + (i ? `$${i}` : '') + part, ''), values }),
    withOrgTx: async (org: string, ...queries: any[]) => m.db.transaction(async (tx: any) => {
        await tx.query("select set_config('app.org_id',$1,true)", [org]);
        const rows = [];
        for (const q of queries) rows.push((await tx.query(q.text, q.values)).rows);
        return rows;
    }),
    logAudit: m.audit,
    getActiveOrgId: async () => m.org,
    reqIp: () => '127.0.0.1',
}));
vi.mock('../src/lib/org-entitlements', () => ({ getEntitlementContext: async () => ({ effectivePlan: m.plan }) }));
vi.mock('../src/lib/crypto-secret', () => ({ encryptRequiredSecret: (s: string) => `enc:${s.length}` }));
vi.mock('../src/lib/queries', () => ({ requirePerm: m.perm }));
vi.mock('../src/lib/posthog-server', () => ({ trackServer: vi.fn() }));
vi.mock('../src/lib/webhooks', async () => {
    const { DOMAIN_EVENTS } = await import('../src/lib/domain-events');
    return { WEBHOOK_EVENT_IDS: Object.keys(DOMAIN_EVENTS) };
});

const { createWebhookEndpoint, listApiWebhooks, deleteWebhookEndpoint } = await import('../src/lib/actions/webhooks');
const { DELETE: revokeKey } = await import('../src/pages/api/keys');

const A = '00000000-0000-4000-8000-00000000000a';
const B = '00000000-0000-4000-8000-00000000000b';
const KEY_1 = '00000000-0000-4000-8000-0000000000a1';
const KEY_2 = '00000000-0000-4000-8000-0000000000a2';
const ctxA = { orgId: A, origin: 'https://cord.test', actor: `api:${KEY_1}`, source: 'api' as const };
const owner = readFileSync(new URL('../db/migrations/2026-09-14-webhooks-api-owner.sql', import.meta.url), 'utf8');

beforeAll(async () => {
    m.db = new PGlite();
    await m.db.exec(`
        create table orgs(id uuid primary key);
        create table api_keys(id uuid primary key, org_id uuid, revoked_at timestamptz);
        create table webhooks(id uuid primary key default gen_random_uuid(), org_id uuid not null, url text not null, eventos jsonb not null default '[]',
            secret text, secret_enc text, activo boolean not null default true, created_at timestamptz default now());
        insert into orgs values ('${A}'), ('${B}');
        insert into api_keys values ('${KEY_1}', '${A}', null), ('${KEY_2}', '${A}', null);`);
    await m.db.exec(owner);
    await m.db.exec(owner);
}, 15000);

beforeEach(async () => {
    vi.clearAllMocks();
    m.plan = 'pro';
    m.org = A;
    m.perm.mockResolvedValue(null);
    await m.db.exec(`delete from webhooks; update api_keys set revoked_at = null;`);
});

afterAll(async () => { await m.db.close(); });

const count = async (where = 'true') => (await m.db.query(`select count(*)::int n from webhooks where ${where}`)).rows[0].n as number;

describe('createWebhookEndpoint', () => {
    it('crea el endpoint ligado a la llave, cifra el secreto y lo devuelve una sola vez', async () => {
        const r = await createWebhookEndpoint(ctxA, { url: 'https://hooks.zapier.com/abc', eventos: ['client.created', 'no.existe'] }, KEY_1);
        expect(r.status).toBe(200);
        expect(r.body).toMatchObject({ url: 'https://hooks.zapier.com/abc', eventos: ['client.created'] });
        expect(String(r.body.secret)).toMatch(/^whsec_[0-9a-f]{48}$/);
        const row = (await m.db.query('select org_id, created_by_key, secret, secret_enc from webhooks')).rows[0];
        expect(row).toMatchObject({ org_id: A, created_by_key: KEY_1, secret: null });
        expect(row.secret_enc).not.toContain('whsec_');
        expect(m.audit).toHaveBeenCalledWith(A, expect.objectContaining({ accion: 'webhook.creado', actor: `api:${KEY_1}` }));
    });

    it.each(['http://localhost:3000/x', 'https://127.0.0.1/x', 'https://169.254.169.254/latest', 'ftp://example.com', 'no-es-url'])(
        'rechaza la URL %s sin crear nada', async (url) => {
            const r = await createWebhookEndpoint(ctxA, { url }, KEY_1);
            expect(r.status).toBe(400);
            expect(await count()).toBe(0);
        });

    it('los endpoints del equipo respetan el tope del plan sin contar los de integraciones', async () => {
        m.plan = 'free';
        await m.db.exec(`insert into webhooks (org_id, url, created_by_key) select '${A}', 'https://zap.example/' || g, '${KEY_1}' from generate_series(1, 30) g`);
        await m.db.exec(`insert into webhooks (org_id, url) select '${A}', 'https://equipo.example/' || g from generate_series(1, 15) g`);
        expect((await createWebhookEndpoint(ctxA, { url: 'https://example.com/16' })).status).toBe(200);
        const r = await createWebhookEndpoint(ctxA, { url: 'https://example.com/17' });
        expect(r.status).toBe(403);
        expect(r.body.code).toBe('plan_limit_reached');
        expect(await count('created_by_key is null')).toBe(16);
    });

    it('las integraciones tienen su propio cupo, igual en todos los planes', async () => {
        m.plan = 'free';
        await m.db.exec(`insert into webhooks (org_id, url) select '${A}', 'https://equipo.example/' || g from generate_series(1, 16) g`);
        await m.db.exec(`insert into webhooks (org_id, url, created_by_key) select '${A}', 'https://zap.example/' || g, '${KEY_1}' from generate_series(1, 99) g`);
        expect((await createWebhookEndpoint(ctxA, { url: 'https://example.com/100' }, KEY_2)).status).toBe(200);
        const r = await createWebhookEndpoint(ctxA, { url: 'https://example.com/101' }, KEY_1);
        expect(r.status).toBe(403);
        expect(r.body.code).toBe('integration_limit_reached');
        expect(await count('created_by_key is not null')).toBe(100);
    });

    it('rechaza eventos que no son lista', async () => {
        expect((await createWebhookEndpoint(ctxA, { url: 'https://example.com/1', eventos: 'quote.sent' }, KEY_1)).status).toBe(400);
    });
});

describe('alcance por llave', () => {
    beforeEach(async () => {
        await m.db.exec(`insert into webhooks (org_id, url, created_by_key) values
            ('${A}', 'https://app.example/produccion', null),
            ('${A}', 'https://zapier.example/k1', '${KEY_1}'),
            ('${A}', 'https://make.example/k2', '${KEY_2}'),
            ('${B}', 'https://otra-org.example', '${KEY_1}')`);
    });

    it('una llave solo lista los endpoints que creó, sin secretos', async () => {
        const hooks = await listApiWebhooks(ctxA, KEY_1);
        expect(hooks.map((h) => h.url)).toEqual(['https://zapier.example/k1']);
        expect(Object.keys(hooks[0]).sort()).toEqual(['activo', 'created_at', 'eventos', 'id', 'url']);
    });

    it('una llave no puede borrar el endpoint de la app, el de otra llave ni el de otra org', async () => {
        const ids = (await m.db.query('select id, url from webhooks')).rows as { id: string; url: string }[];
        for (const url of ['https://app.example/produccion', 'https://make.example/k2', 'https://otra-org.example']) {
            const id = ids.find((w) => w.url === url)!.id;
            expect((await deleteWebhookEndpoint(ctxA, id, KEY_1)).status).toBe(404);
        }
        expect(await count()).toBe(4);
        const propio = ids.find((w) => w.url === 'https://zapier.example/k1')!.id;
        expect((await deleteWebhookEndpoint(ctxA, propio, KEY_1)).status).toBe(200);
        expect(await count()).toBe(3);
    });

    it('la app (sin llave) sí borra cualquier endpoint de su org, pero no de otra', async () => {
        const ids = (await m.db.query('select id, url from webhooks')).rows as { id: string; url: string }[];
        const ajeno = ids.find((w) => w.url === 'https://otra-org.example')!.id;
        expect((await deleteWebhookEndpoint(ctxA, ajeno)).status).toBe(404);
        const produccion = ids.find((w) => w.url === 'https://app.example/produccion')!.id;
        expect((await deleteWebhookEndpoint(ctxA, produccion)).status).toBe(200);
    });

    it('revocar una llave apaga solo sus endpoints en su org', async () => {
        const res = await revokeKey({ request: new Request('https://cord.test/api/keys', { method: 'DELETE', body: JSON.stringify({ id: KEY_1 }) }) } as any);
        expect(res.status).toBe(200);
        const estado = (await m.db.query('select url, activo from webhooks order by url')).rows;
        expect(estado).toEqual([
            { url: 'https://app.example/produccion', activo: true },
            { url: 'https://make.example/k2', activo: true },
            { url: 'https://otra-org.example', activo: true },
            { url: 'https://zapier.example/k1', activo: false },
        ]);
    });

    it('revocar exige permiso y un id válido', async () => {
        m.perm.mockResolvedValue(new Response('{}', { status: 403 }));
        expect((await revokeKey({ request: new Request('https://cord.test', { method: 'DELETE', body: JSON.stringify({ id: KEY_1 }) }) } as any)).status).toBe(403);
        m.perm.mockResolvedValue(null);
        expect((await revokeKey({ request: new Request('https://cord.test', { method: 'DELETE', body: JSON.stringify({ id: 'abc' }) }) } as any)).status).toBe(404);
        expect(await count('activo = false')).toBe(0);
    });
});

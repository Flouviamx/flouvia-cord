import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { createHmac } from 'node:crypto';

const m = vi.hoisted(() => ({ db: null as any }));

vi.mock('../src/lib/db', () => ({
    sql: (s: TemplateStringsArray, ...values: any[]) => ({ text: s.reduce((text, part, i) => text + (i ? `$${i}` : '') + part, ''), values }),
    withOrgTx: async (org: string, ...queries: any[]) => m.db.transaction(async (tx: any) => {
        await tx.query("select set_config('app.org_id',$1,true)", [org]);
        const rows = [];
        for (const q of queries) rows.push((await tx.query(q.text, q.values)).rows);
        return rows;
    }),
    withSystemTx: vi.fn(),
    assertCronContext: vi.fn(),
    logAudit: vi.fn(),
}));
vi.mock('../src/lib/crypto-secret', () => ({
    encryptRequiredSecret: (s: string) => `enc:${s}`,
    decryptSecret: (s: string | null) => (s && s.startsWith('enc:') ? s.slice(4) : null),
}));
vi.mock('../src/lib/ratelimit', () => ({ rateLimit: async () => ({ ok: true }) }));
vi.mock('../src/lib/safe-fetch', () => ({ safeFetch: vi.fn() }));
vi.mock('../src/lib/email', () => ({ sendEmail: vi.fn(), siteOrigin: () => 'https://cord.test' }));
vi.mock('../src/lib/log', () => ({ log: { error: vi.fn() } }));

const { openCliSession, closeCliSession, MAX_CLI_SESSIONS_PER_KEY } = await import('../src/lib/cli-listen');
const { claimCliDeliveries } = await import('../src/lib/webhook-delivery');

const LIVE = '00000000-0000-4000-8000-00000000000a';
const SANDBOX = '00000000-0000-4000-8000-00000000000b';
const KEY = '00000000-0000-4000-8000-0000000000c1';

beforeAll(async () => {
    m.db = new PGlite();
    await m.db.exec(`
        create table orgs(id uuid primary key, sandbox_of uuid);
        create table webhooks(id uuid primary key default gen_random_uuid(), org_id uuid not null, url text not null, eventos jsonb not null default '[]',
            secret text, secret_enc text, secret_prev text, secret_prev_enc text, secret_prev_expira timestamptz,
            activo boolean not null default true, created_by_key text, created_at timestamptz default now(), api_version text, cli_hasta timestamptz);
        create table webhook_events(id uuid primary key default gen_random_uuid(), org_id uuid not null, webhook_id uuid not null references webhooks(id) on delete cascade,
            event_id text not null, evento text not null, payload text not null, estado text not null default 'pending', intentos int not null default 0,
            last_status int, delivered_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
        insert into orgs values ('${LIVE}', null), ('${SANDBOX}', '${LIVE}');`);
});

beforeEach(async () => { await m.db.exec('delete from webhook_events; delete from webhooks;'); });

describe('sesiones de cord listen', () => {
    it('solo existen en la sandbox', async () => {
        await expect(openCliSession(LIVE, KEY, [])).rejects.toThrow(/entorno de prueba/);
    });

    it('filtra eventos fuera del catálogo y acota sesiones por llave', async () => {
        const s = await openCliSession(SANDBOX, KEY, ['quote.paid', 'inventado', 'quote.paid']);
        expect(s?.eventos).toEqual(['quote.paid']);
        expect(s?.secret).toMatch(/^whsec_/);
        for (let i = 1; i < MAX_CLI_SESSIONS_PER_KEY; i++) expect(await openCliSession(SANDBOX, KEY, [])).not.toBeNull();
        expect(await openCliSession(SANDBOX, KEY, [])).toBeNull();
    });

    it('entrega los pendientes una sola vez, en orden, con la firma real', async () => {
        const s = (await openCliSession(SANDBOX, KEY, []))!;
        const body1 = JSON.stringify({ id: 'evt_1', event: 'quote.sent', created_at: 'x', data: {} });
        const body2 = JSON.stringify({ id: 'evt_2', event: 'quote.paid', created_at: 'x', data: {} });
        await m.db.query(`insert into webhook_events (org_id, webhook_id, event_id, evento, payload, created_at) values ($1,$2,'evt_1','quote.sent',$3, now() - interval '1 second'), ($1,$2,'evt_2','quote.paid',$4, now())`, [SANDBOX, s.id, body1, body2]);

        const first = await claimCliDeliveries(SANDBOX, s.id);
        expect(first?.map((d) => d.event_id)).toEqual(['evt_1', 'evt_2']);
        const v1 = first![0].headers['X-Cord-Signature-V1'];
        const [, t, sig] = /^t=(\d+),v1=([0-9a-f]{64})$/.exec(v1)!;
        expect(sig).toBe(createHmac('sha256', s.secret).update(`${t}.${body1}`).digest('hex'));
        expect(await claimCliDeliveries(SANDBOX, s.id)).toEqual([]);
    });

    it('otra org no puede leer ni cerrar la sesión', async () => {
        const s = (await openCliSession(SANDBOX, KEY, []))!;
        expect(await claimCliDeliveries(LIVE, s.id)).toBeNull();
        expect(await closeCliSession(LIVE, KEY, s.id)).toBe(false);
        expect(await closeCliSession(SANDBOX, 'otra-llave', s.id)).toBe(false);
        expect(await closeCliSession(SANDBOX, KEY, s.id)).toBe(true);
    });
});

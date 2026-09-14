import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';

const m = vi.hoisted(() => ({ db: null as any }));

vi.mock('../src/lib/db', () => ({
    sql: (s: TemplateStringsArray, ...values: any[]) => ({ text: s.reduce((text, part, i) => text + (i ? `$${i}` : '') + part, ''), values }),
    withOrgTx: async (org: string, ...queries: any[]) => m.db.transaction(async (tx: any) => {
        await tx.query("select set_config('app.org_id',$1,true)", [org]);
        const rows = [];
        for (const q of queries) rows.push((await tx.query(q.text, q.values)).rows);
        return rows;
    }),
}));
vi.mock('../src/lib/log', () => ({ log: { error: vi.fn() } }));

const { listDomainEvents, EventsQueryError } = await import('../src/lib/domain-events-read');

const A = '00000000-0000-4000-8000-00000000000a';
const B = '00000000-0000-4000-8000-00000000000b';
const Q1 = '00000000-0000-4000-8000-0000000000e1';
const Q2 = '00000000-0000-4000-8000-0000000000e2';
const migration = readFileSync(new URL('../db/migrations/2026-09-14-domain-events.sql', import.meta.url), 'utf8');
const base = { type: null, objectId: null, cursor: null, limit: 50 };

beforeAll(async () => {
    m.db = new PGlite();
    await m.db.exec(`create table orgs(id uuid primary key); insert into orgs values ('${A}'), ('${B}');`);
    await m.db.exec(migration);
    // Mismo instante al milisegundo, distinto al microsegundo: el caso que rompe un cursor con Date de JS.
    await m.db.exec(`
        insert into domain_events (org_id, type, object, object_id, actor, created_at)
        select '${A}', case when g % 3 = 0 then 'quote.paid' else 'quote.sent' end, 'quote',
               case when g % 2 = 0 then '${Q1}'::uuid else '${Q2}'::uuid end, 'system',
               '2026-09-14T10:00:00.123000Z'::timestamptz + (g || ' microseconds')::interval
        from generate_series(1, 25) g;
        insert into domain_events (org_id, type, object, object_id, actor) values ('${B}', 'quote.sent', 'quote', '${Q1}', 'system');`);
}, 15000);

afterAll(async () => { await m.db.close(); });

describe('listDomainEvents', () => {
    it('recorre todas las páginas sin repetir ni saltar eventos', async () => {
        const vistos: string[] = [];
        let cursor: string | null = null;
        let paginas = 0;
        do {
            const page = await listDomainEvents(A, { ...base, limit: 4, cursor });
            vistos.push(...page.items.map((e) => e.id));
            cursor = page.nextCursor;
            paginas++;
        } while (cursor && paginas < 20);
        expect(vistos).toHaveLength(25);
        expect(new Set(vistos).size).toBe(25);
        const total = (await m.db.query(`select count(*)::int n from domain_events where org_id = '${A}'`)).rows[0].n;
        expect(vistos.length).toBe(total);
    });

    it('nunca devuelve eventos de otra organización', async () => {
        const page = await listDomainEvents(B, base);
        expect(page.items).toHaveLength(1);
        const deA = await listDomainEvents(A, { ...base, limit: 200 });
        expect(deA.items.every((e) => e.object_id !== null)).toBe(true);
        expect(deA.items).toHaveLength(25);
    });

    it('filtra por tipo y por objeto', async () => {
        const pagados = await listDomainEvents(A, { ...base, type: 'quote.paid', limit: 200 });
        expect(pagados.items).toHaveLength(8);
        expect(pagados.items.every((e) => e.type === 'quote.paid')).toBe(true);
        const deQ1 = await listDomainEvents(A, { ...base, objectId: Q1, limit: 200 });
        expect(deQ1.items.every((e) => e.object_id === Q1)).toBe(true);
    });

    it.each([
        [{ type: 'quote.hackeada' }],
        [{ objectId: "1' or 1=1" }],
        [{ cursor: 'basura' }],
        [{ cursor: Buffer.from('2026-01-01|no-uuid').toString('base64url') }],
    ])('rechaza parámetros inválidos %j', async (params) => {
        await expect(listDomainEvents(A, { ...base, ...params })).rejects.toBeInstanceOf(EventsQueryError);
    });
});

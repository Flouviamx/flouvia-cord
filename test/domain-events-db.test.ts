import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';

const m = vi.hoisted(() => ({ db: null as any, enqueue: vi.fn(async () => []) }));

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
vi.mock('../src/lib/after', () => ({ after: vi.fn() }));
vi.mock('../src/lib/public-links', () => ({ publicDocumentUrl: async () => 'https://cord.test/q/secreto' }));
vi.mock('../src/lib/webhook-delivery', () => ({
    enqueueForSubscribers: m.enqueue, flushNow: vi.fn(), newEventId: () => 'evt_1',
    sendTestEvent: vi.fn(), redeliver: vi.fn(), reenableAndRetryRecent: vi.fn(), rotateSecret: vi.fn(),
}));

const { recordDomainEvent, DOMAIN_EVENTS } = await import('../src/lib/domain-events');
const { dispatchQuoteEvent, dispatchQuoteEventFrom, WEBHOOK_EVENT_IDS } = await import('../src/lib/webhooks');
const { reqContext } = await import('../src/lib/context');

const A = '00000000-0000-4000-8000-00000000000a';
const B = '00000000-0000-4000-8000-00000000000b';
const QUOTE = '00000000-0000-4000-8000-0000000000e1';
const migration = readFileSync(new URL('../db/migrations/2026-09-14-domain-events.sql', import.meta.url), 'utf8');

beforeAll(async () => {
    m.db = new PGlite();
    await m.db.exec(`create table orgs(id uuid primary key); insert into orgs values ('${A}'), ('${B}');`);
    await m.db.exec(migration);
    await m.db.exec(migration);
    await m.db.exec('create role app_test nologin; grant select, insert on domain_events to app_test;');
}, 15000);

beforeEach(async () => { await m.db.exec('reset role; delete from domain_events;'); });
afterAll(async () => { await m.db.close(); });

describe('catálogo', () => {
    it('cubre exactamente los eventos públicos de webhook', () => {
        const publicos = Object.entries(DOMAIN_EVENTS).filter(([, e]) => e.public).map(([type]) => type).sort();
        expect(publicos).toEqual([...WEBHOOK_EVENT_IDS].sort());
    });
});

describe('recordDomainEvent', () => {
    it('guarda tipo, objeto, actor del contexto y datos sin credenciales', async () => {
        const id = await reqContext.run({ userId: null, orgId: A, actor: 'api:key-1' }, () =>
            recordDomainEvent(A, 'quote.approved', { id: QUOTE, folio: 'COT-1', total: 100, link_publico: 'https://cord.test/q/secreto' }));
        expect(id).toBeTruthy();
        const row = (await m.db.query('select org_id, type, object, object_id, actor, data from domain_events')).rows[0];
        expect(row).toMatchObject({ org_id: A, type: 'quote.approved', object: 'quote', object_id: QUOTE, actor: 'api:key-1' });
        expect(row.data).toEqual({ id: QUOTE, folio: 'COT-1', total: 100 });
    });

    it('sin contexto de API el actor es el usuario de la sesión o el sistema', async () => {
        await reqContext.run({ userId: 'user-9' }, () => recordDomainEvent(A, 'quote.sent', { id: QUOTE }));
        await recordDomainEvent(A, 'quote.expired', { id: QUOTE });
        const actores = (await m.db.query('select actor from domain_events order by type')).rows.map((r: any) => r.actor);
        expect(actores).toEqual(['system', 'user:user-9']);
    });

    it('un tipo fuera del catálogo no se registra', async () => {
        expect(await recordDomainEvent(A, 'quote.hackeada', { id: QUOTE })).toBeNull();
        expect((await m.db.query('select count(*)::int n from domain_events')).rows[0].n).toBe(0);
    });

    it('nunca lanza aunque falle la base', async () => {
        await expect(recordDomainEvent('no-es-uuid', 'quote.sent', { id: QUOTE })).resolves.toBeNull();
    });

    it('se registra aunque la org no tenga webhooks', async () => {
        await dispatchQuoteEventFrom(A, 'quote.deleted', { id: QUOTE, folio: 'COT-1', status: 'draft', total: 0, public_token: 'secreto', empresa: null });
        const row = (await m.db.query('select type, data from domain_events')).rows[0];
        expect(row.type).toBe('quote.deleted');
        expect(JSON.stringify(row.data)).not.toContain('secreto');
    });
});

describe('entrega a webhooks', () => {
    const setPlan = (plan: string) => m.db.exec(`create or replace function cord_effective_plan(uuid) returns text language sql as $$ select '${plan}' $$;`);

    beforeAll(async () => {
        await m.db.exec(`
            create table webhooks(id uuid primary key default gen_random_uuid(), org_id uuid, eventos jsonb default '[]', activo boolean default true, created_at timestamptz default now());
            create table clientes(id uuid primary key, org_id uuid, empresa text);
            create table cotizaciones(id uuid primary key, org_id uuid, folio text, status text, total numeric, public_token text, base_currency text, cliente_id uuid);
            insert into webhooks(org_id, created_at) select '${A}', now() - (g || ' minutes')::interval from generate_series(1, 12) g;
            insert into clientes values ('00000000-0000-4000-8000-0000000000c1', '${A}', 'Cliente A');
            insert into cotizaciones values ('${QUOTE}', '${A}', 'COT-1', 'sent', 250, 'secreto', 'USD', '00000000-0000-4000-8000-0000000000c1');`);
    });
    beforeEach(() => m.enqueue.mockClear());

    it.each([['free', 1], ['pro', 10], ['business', 10], ['developer', 12]])('plan %s entrega a %i endpoints', async (plan, esperados) => {
        await setPlan(plan);
        await dispatchQuoteEventFrom(A, 'quote.deleted', { id: QUOTE, folio: 'COT-1', status: 'draft', total: 0, public_token: 't', empresa: null });
        expect(m.enqueue).toHaveBeenCalledTimes(1);
        expect(m.enqueue.mock.calls[0][1]).toHaveLength(esperados);
    });

    it('el payload de cotización lleva divisa y cliente_id', async () => {
        await setPlan('pro');
        await dispatchQuoteEvent(A, QUOTE, 'quote.approved');
        const body = JSON.parse(m.enqueue.mock.calls[0][3]);
        expect(body.data).toMatchObject({ id: QUOTE, moneda: 'USD', total: 250, cliente: 'Cliente A', cliente_id: '00000000-0000-4000-8000-0000000000c1' });
    });

    it('un endpoint suscrito a eventos concretos no recibe los demás', async () => {
        await setPlan('pro');
        await m.db.exec(`update webhooks set eventos = '["client.created"]'`);
        await dispatchQuoteEvent(A, QUOTE, 'quote.approved');
        expect(m.enqueue).not.toHaveBeenCalled();
        await m.db.exec(`update webhooks set eventos = '[]'`);
    });
});

describe('garantías de la tabla', () => {
    it('es append-only', async () => {
        await recordDomainEvent(A, 'quote.sent', { id: QUOTE });
        await expect(m.db.exec("update domain_events set type = 'quote.paid'")).rejects.toThrow('append-only');
    });

    it('RLS: una org solo ve y escribe sus propios eventos', async () => {
        await recordDomainEvent(A, 'quote.sent', { id: QUOTE });
        await recordDomainEvent(B, 'quote.sent', { id: QUOTE });
        await m.db.transaction(async (tx: any) => {
            await tx.query('set local role app_test');
            await tx.query("select set_config('app.org_id', $1, true)", [A]);
            const visibles = (await tx.query('select org_id from domain_events')).rows;
            expect(visibles).toEqual([{ org_id: A }]);
        });
        await expect(m.db.transaction(async (tx: any) => {
            await tx.query('set local role app_test');
            await tx.query("select set_config('app.org_id', $1, true)", [A]);
            await tx.query(`insert into domain_events (org_id, type, object, actor) values ('${B}', 'quote.sent', 'quote', 'x')`);
        })).rejects.toThrow(/row-level security/);
    });

    it('RLS: sin org en el contexto no se ve nada', async () => {
        await recordDomainEvent(A, 'quote.sent', { id: QUOTE });
        await m.db.transaction(async (tx: any) => {
            await tx.query('set local role app_test');
            expect((await tx.query('select count(*)::int n from domain_events')).rows[0].n).toBe(0);
        });
    });
});

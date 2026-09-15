import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';

const m = vi.hoisted(() => ({
    db: null as any,
    pending: [] as Promise<unknown>[],
    email: vi.fn(),
    slack: vi.fn(),
    recordEvent: null as null | ((orgId: string, type: string, data: Record<string, unknown>, actor?: string) => Promise<string | null>),
}));

vi.mock('../src/lib/db', () => ({
    sql: (s: TemplateStringsArray, ...values: any[]) => ({ text: s.reduce((text, part, i) => text + (i ? `$${i}` : '') + part, ''), values }),
    withOrgTx: async (org: string, ...queries: any[]) => m.db.transaction(async (tx: any) => {
        await tx.query("select set_config('app.org_id',$1,true)", [org]);
        const rows = [];
        for (const q of queries) rows.push((await tx.query(q.text, q.values)).rows);
        return rows;
    }),
}));
vi.mock('../src/lib/log', () => ({ log: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock('../src/lib/after', () => ({ after: (p: Promise<unknown>) => { m.pending.push(Promise.resolve(p).catch(() => {})); } }));
vi.mock('../src/lib/email', () => ({ siteOrigin: () => 'https://cordhq.app', sendEmail: m.email }));
vi.mock('../src/lib/slack', () => ({ postSlackText: m.slack }));
vi.mock('../src/lib/ratelimit', () => ({ strictRateLimit: async () => ({ ok: true }) }));
vi.mock('../src/lib/actions/tasks', () => ({
    createTask: async (ctx: any, input: any) => {
        const { rows } = await m.db.query(
            `insert into tareas (org_id, titulo, due_date, cotizacion_id) values ($1, $2, $3, $4) returning id`,
            [ctx.orgId, input.titulo, input.due_date, input.cotizacion_id]);
        await m.recordEvent!(ctx.orgId, 'task.created', { id: rows[0].id, titulo: input.titulo }, ctx.actor);
        return { status: 200, body: { id: rows[0].id } };
    },
}));

const { recordDomainEvent } = await import('../src/lib/domain-events');
const { processOrgRuns } = await import('../src/lib/workflows/engine');
m.recordEvent = recordDomainEvent;

const A = '00000000-0000-4000-8000-00000000000a';
const B = '00000000-0000-4000-8000-00000000000b';
const OWNER_ID = '00000000-0000-4000-8000-0000000000e1';
const MEMBER_ID = '00000000-0000-4000-8000-0000000000e2';
const INVITED_ID = '00000000-0000-4000-8000-0000000000e3';
const QUOTE = '00000000-0000-4000-8000-0000000000c1';

const q = async (text: string, params: unknown[] = []) => (await m.db.query(text, params)).rows;
const flush = async () => { while (m.pending.length) await m.pending.shift(); };

async function workflow(orgId: string, trigger: string, steps: unknown[], estado = 'active', nombre = 'WF') {
    const def = JSON.stringify({ trigger, steps });
    const [row] = await q(
        `insert into workflows (org_id, nombre, estado, definicion, publicado, trigger_publicado, version, published_at)
         values ($1, $2, $3, $4::jsonb, $4::jsonb, $5, 1, now()) returning id`,
        [orgId, nombre, estado, def, trigger]);
    return row.id as string;
}

const task = (id: string, titulo: string, extra: Record<string, unknown> = {}) =>
    ({ id, type: 'action', action: 'create_task', params: { titulo, ...extra } });

beforeAll(async () => {
    m.db = new PGlite();
    await m.db.exec(`
        create table orgs(id uuid primary key, owner_id uuid, slack_webhook_url text, idioma text default 'es-MX');
        create table users(id uuid primary key, email text);
        create table org_members(org_id uuid, user_id uuid, estado text);
        create table cotizaciones(id uuid primary key, org_id uuid, status text);
        create table documentos_fiscales(id uuid primary key, org_id uuid, lifecycle text);
        create table tareas(id uuid primary key default gen_random_uuid(), org_id uuid, titulo text, due_date date, cotizacion_id uuid);
        create table test_plan(plan text);
        insert into test_plan values ('pro');
        create function cord_effective_plan(uuid) returns text language sql stable as $$ select plan from test_plan limit 1 $$;
        insert into users values ('${OWNER_ID}', 'owner@a.test'), ('${MEMBER_ID}', 'member@a.test'), ('${INVITED_ID}', 'invited@a.test');
        insert into orgs(id, owner_id) values ('${A}', '${OWNER_ID}'), ('${B}', null);
        insert into org_members values ('${A}', '${OWNER_ID}', 'activo'), ('${A}', '${MEMBER_ID}', 'activo'), ('${A}', '${INVITED_ID}', 'invitado');
        insert into cotizaciones values ('${QUOTE}', '${A}', 'sent');`);
    await m.db.exec(readFileSync(new URL('../db/migrations/2026-09-14-domain-events.sql', import.meta.url), 'utf8'));
    await m.db.exec(readFileSync(new URL('../db/migrations/2026-09-14-workflows.sql', import.meta.url), 'utf8'));
    await m.db.exec(readFileSync(new URL('../db/migrations/2026-09-14-workflows.sql', import.meta.url), 'utf8'));
}, 20000);

beforeEach(async () => {
    vi.clearAllMocks();
    m.pending.length = 0;
    m.email.mockResolvedValue({ sent: true });
    m.slack.mockResolvedValue({ ok: true, status: 200 });
    await m.db.exec(`delete from workflow_runs; delete from workflows; delete from domain_events; delete from tareas;
        update test_plan set plan = 'pro'; update cotizaciones set status = 'sent'; update orgs set slack_webhook_url = null;`);
});

afterAll(async () => { await m.db.close(); });

const quoteEvent = (orgId = A, extra: Record<string, unknown> = {}) =>
    recordDomainEvent(orgId, 'quote.approved', { id: QUOTE, folio: 'COT-7', cliente: 'ACME <script>', total: 150000, moneda: 'MXN', ...extra }, 'user:x');

describe('encolado', () => {
    it('solo encola workflows activos de la org con ese disparador', async () => {
        const activo = await workflow(A, 'quote.approved', [task('tsk1', 'x')]);
        await workflow(A, 'quote.approved', [task('tsk2', 'x')], 'paused');
        await workflow(A, 'quote.sent', [task('tsk3', 'x')]);
        await workflow(B, 'quote.approved', [task('tsk4', 'x')]);
        await quoteEvent();
        const runs = await q('select workflow_id, org_id, depth, status from workflow_runs');
        expect(runs).toEqual([{ workflow_id: activo, org_id: A, depth: 0, status: 'queued' }]);
        expect(m.pending.length).toBe(1);
    });

    it('un borrador nunca se ejecuta aunque tenga disparador', async () => {
        await m.db.exec(`insert into workflows (org_id, nombre, definicion) values ('${A}', 'Borrador', '{"trigger":"quote.approved","steps":[]}')`);
        await quoteEvent();
        expect(await q('select * from workflow_runs')).toEqual([]);
    });
});

describe('ejecución', () => {
    const condicion = (then: unknown[], otherwise: unknown[] = []) => ({
        id: 'cond1', type: 'condition', match: 'all',
        conditions: [{ field: 'total', op: 'gte', value: 100000 }], then, else: otherwise,
    });

    it('sigue la rama que se cumple y renderiza la plantilla como texto', async () => {
        await workflow(A, 'quote.approved', [condicion([task('tsk1', 'Kickoff {{folio}} con {{cliente}}', { dias: 2 })], [task('tsk2', 'No debería')])]);
        await quoteEvent();
        await flush();
        const [run] = await q('select status, log from workflow_runs');
        expect(run.status).toBe('succeeded');
        expect(run.log.map((e: any) => `${e.step}:${e.resultado}`)).toEqual(['cond1:si', 'tsk1:ok']);
        const [t] = await q('select titulo, due_date, cotizacion_id from tareas where titulo like $1', ['Kickoff%']);
        expect(t.titulo).toBe('Kickoff COT-7 con ACME <script>');
        expect(t.cotizacion_id).toBe(QUOTE);
    });

    it('toma la otra rama cuando no se cumple', async () => {
        await workflow(A, 'quote.approved', [condicion([task('tsk1', 'Grande')], [task('tsk2', 'Chica')])]);
        await quoteEvent(A, { total: 50 });
        await flush();
        expect((await q('select titulo from tareas')).map((r: any) => r.titulo)).toEqual(['Chica']);
    });

    it('espera días, se reanuda y reevalúa el estado actual de la cotización', async () => {
        await workflow(A, 'quote.approved', [
            { id: 'wait1', type: 'wait', days: 3 },
            { id: 'cond2', type: 'condition', match: 'all', conditions: [{ field: 'estado_actual', op: 'eq', value: 'sent' }], then: [task('tsk1', 'Llamar')], else: [] },
        ]);
        await quoteEvent();
        await flush();
        const [esperando] = await q(`select status, cursor, extract(epoch from run_at - now()) / 86400 as dias from workflow_runs`);
        expect(esperando.status).toBe('waiting');
        expect(esperando.cursor).toEqual([1]);
        expect(Number(esperando.dias)).toBeGreaterThan(2.9);

        expect(await processOrgRuns(A)).toBe(0);
        await m.db.exec(`update cotizaciones set status = 'viewed'; update workflow_runs set run_at = now() - interval '1 minute'`);
        expect(await processOrgRuns(A)).toBe(1);
        const [run] = await q('select status, log from workflow_runs');
        expect(run.status).toBe('succeeded');
        expect(run.log.map((e: any) => `${e.step}:${e.resultado}`)).toEqual(['wait1:esperando', 'cond2:no']);
        expect(await q('select * from tareas')).toEqual([]);
    });

    it('reintenta un paso fallido y lo marca como fallido al tercer intento', async () => {
        await workflow(A, 'quote.approved', [{ id: 'slk1', type: 'action', action: 'slack_message', params: { mensaje: 'Hola' } }]);
        await quoteEvent();
        await flush();
        let [run] = await q('select status, attempts, error from workflow_runs');
        expect(run).toMatchObject({ status: 'queued', attempts: 1 });
        expect(run.error).toContain('Conecta Slack');
        for (let i = 0; i < 2; i++) {
            await m.db.exec(`update workflow_runs set run_at = now() - interval '1 minute'`);
            await processOrgRuns(A);
        }
        [run] = await q('select status, attempts from workflow_runs');
        expect(run).toMatchObject({ status: 'failed', attempts: 3 });
    });

    it('un fallo pasajero se reintenta en la misma ejecución sin gastar intento', async () => {
        await m.db.exec(`update orgs set slack_webhook_url = 'https://hooks.slack.com/services/T/B/X' where id = '${A}'`);
        m.slack.mockResolvedValueOnce({ ok: false });
        await workflow(A, 'quote.approved', [{ id: 'slk2', type: 'action', action: 'slack_message', params: { mensaje: 'Hola' } }]);
        await quoteEvent();
        await flush();
        const [run] = await q('select status, attempts from workflow_runs');
        expect(run).toMatchObject({ status: 'succeeded', attempts: 0 });
        expect(m.slack).toHaveBeenCalledTimes(2);
    });

    it('avisa solo a miembros activos y escapa el HTML del contenido', async () => {
        await workflow(A, 'quote.approved', [{ id: 'mail1', type: 'action', action: 'notify_team', params: { destinatarios: 'all', asunto: 'Aprobada\n{{folio}}', mensaje: 'Cliente: {{cliente}}' } }]);
        await quoteEvent();
        await flush();
        const destinatarios = m.email.mock.calls.map((c) => c[0].to).sort();
        expect(destinatarios).toEqual(['member@a.test', 'owner@a.test']);
        expect(m.email.mock.calls[0][0].subject).toBe('Aprobada COT-7');
        expect(m.email.mock.calls[0][0].html).toContain('ACME &#60;script&#62;');
        expect(m.email.mock.calls[0][0].html).not.toContain('<script>');
    });

    it('si el workflow se pausa antes de ejecutarse, la ejecución se cancela', async () => {
        const id = await workflow(A, 'quote.approved', [task('tsk1', 'x')]);
        await quoteEvent();
        await m.db.exec(`update workflows set estado = 'paused' where id = '${id}'`);
        await flush();
        const [run] = await q('select status, error from workflow_runs');
        expect(run.status).toBe('canceled');
        expect(await q('select * from tareas')).toEqual([]);
    });
});

describe('anti-bucle', () => {
    it('un workflow no se dispara con sus propios eventos y la cadena se corta en profundidad 3', async () => {
        const self = await workflow(A, 'task.created', [task('tsk1', 'Otra tarea')], 'active', 'Se llama a sí mismo');
        await recordDomainEvent(A, 'task.created', { id: QUOTE, titulo: 'manual' }, 'user:x');
        await flush();
        const runs = await q('select workflow_id, depth, status from workflow_runs order by depth');
        expect(runs).toEqual([{ workflow_id: self, depth: 0, status: 'succeeded' }]);
        expect(await q(`select depth, actor from domain_events where type = 'task.created' order by created_at`))
            .toEqual([{ depth: 0, actor: 'user:x' }, { depth: 1, actor: `workflow:${self}` }]);
    });

    it('dos workflows que se disparan entre sí se detienen en la profundidad máxima', async () => {
        await workflow(A, 'task.created', [task('tska', 'de A')], 'active', 'A');
        await workflow(A, 'task.created', [task('tskb', 'de B')], 'active', 'B');
        await recordDomainEvent(A, 'task.created', { id: QUOTE, titulo: 'semilla' }, 'user:x');
        for (let i = 0; i < 6; i++) await flush();
        const depths = (await q('select max(depth)::int as d, count(*)::int as n from workflow_runs'))[0];
        expect(depths.d).toBeLessThanOrEqual(2);
        expect((await q('select max(depth)::int as d from domain_events'))[0].d).toBeLessThanOrEqual(3);
    });
});

describe('plan y aislamiento', () => {
    it('tras un downgrade solo corre el workflow más antiguo que cabe en el plan', async () => {
        const viejo = await workflow(A, 'quote.approved', [task('tsk1', 'viejo')]);
        await m.db.exec(`update workflows set created_at = now() - interval '1 day' where id = '${viejo}'`);
        const nuevo = await workflow(A, 'quote.approved', [task('tsk2', 'nuevo')]);
        await m.db.exec(`update test_plan set plan = 'free'`);
        await quoteEvent();
        expect((await q('select workflow_id from workflow_runs')).map((r: any) => r.workflow_id)).toEqual([viejo]);
        expect(nuevo).toBeTruthy();
    });

    it('el trigger de la base impide activar más workflows de los que permite el plan', async () => {
        await m.db.exec(`update test_plan set plan = 'free'`);
        await workflow(A, 'quote.approved', [task('tsk1', 'x')]);
        await expect(workflow(A, 'quote.sent', [task('tsk2', 'x')])).rejects.toThrow(/cord_limit:active_workflows:1/);
        await expect(workflow(A, 'quote.sent', [task('tsk3', 'x')], 'draft')).resolves.toBeTruthy();
    });

    it('una ejecución no puede apuntar al workflow o al evento de otra org', async () => {
        const deB = await workflow(B, 'quote.approved', [task('tsk1', 'x')]);
        const eventoA = await quoteEvent();
        await expect(m.db.query(
            `insert into workflow_runs (org_id, workflow_id, version, publicado, event_id) values ($1, $2, 1, '{}', $3)`,
            [A, deB, eventoA])).rejects.toThrow(/foreign key/);
    });
});

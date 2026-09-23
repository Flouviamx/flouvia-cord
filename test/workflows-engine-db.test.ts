import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';

const m = vi.hoisted(() => ({
    db: null as any,
    pending: [] as Promise<unknown>[],
    email: vi.fn(),
    slack: vi.fn(),
    hsNote: vi.fn(),
    clientQuoteEmail: vi.fn(),
    clientInvoiceEmail: vi.fn(),
    expireQuote: vi.fn(),
    approveRequest: vi.fn(),
    safeFetch: vi.fn(),
    reserve: vi.fn(),
    cancelUsage: vi.fn(),
    runDataset: vi.fn(),
    shopifyPedido: vi.fn(),
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
vi.mock('../src/lib/email', () => ({
    siteOrigin: () => 'https://cordhq.app', sendEmail: m.email,
    sendClientQuoteMessage: m.clientQuoteEmail, sendClientInvoiceMessage: m.clientInvoiceEmail,
}));
vi.mock('../src/lib/actions/quotes', () => ({ expireQuote: m.expireQuote, decideApprovalRequest: m.approveRequest }));
vi.mock('../src/lib/ssrf', () => ({ safeFetch: m.safeFetch }));
vi.mock('../src/lib/billing', () => ({ reserveUsage: m.reserve, cancelUsage: m.cancelUsage }));
vi.mock('../src/lib/slack', () => ({ postSlackText: m.slack, escapeSlack: (v: string) => v.replace(/[<>&]/g, '_') }));
vi.mock('../src/lib/ratelimit', () => ({ strictRateLimit: async () => ({ ok: true }) }));
vi.mock('../src/lib/workflows/datasets-run', () => ({ runDataset: m.runDataset }));
vi.mock('../src/lib/integraciones/queue', () => ({ integrationQueueStatement: () => null }));
vi.mock('../src/lib/integraciones/shopify/orders', () => ({ onQuoteEvent: m.shopifyPedido }));
vi.mock('../src/lib/integraciones/hubspot/actions', () => ({
    addHubSpotNote: m.hsNote,
    HubSpotActionError: class extends Error { constructor(message: string, readonly final = true) { super(message); } },
}));
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
        create table orgs(id uuid primary key, owner_id uuid, slack_webhook_url text, teams_webhook_url text,
            idioma text default 'es-MX', nombre text default 'Acme', email_contacto text default 'hola@acme.test',
            telefono text default '555-0100', moneda text default 'MXN', zona_horaria text default 'America/Mexico_City');
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
    // Programados, consultas y esperas condicionadas. Se corre dos veces a
    // propósito: una migración que no es idempotente rompe el segundo deploy.
    await m.db.exec(readFileSync(new URL('../db/migrations/2026-09-20-workflows-programados.sql', import.meta.url), 'utf8'));
    await m.db.exec(readFileSync(new URL('../db/migrations/2026-09-20-workflows-programados.sql', import.meta.url), 'utf8'));
}, 20000);

beforeEach(async () => {
    vi.clearAllMocks();
    m.pending.length = 0;
    m.email.mockResolvedValue({ sent: true });
    m.clientQuoteEmail.mockResolvedValue({ sent: true });
    m.clientInvoiceEmail.mockResolvedValue({ sent: true });
    m.expireQuote.mockResolvedValue({ status: 200, body: { ok: true } });
    m.approveRequest.mockResolvedValue({ status: 200, body: { ok: true } });
    m.safeFetch.mockResolvedValue({ ok: true, status: 200, body: '', error: null, ms: 5 });
    m.reserve.mockResolvedValue({ ok: true, id: 'res-1' });
    m.runDataset.mockResolvedValue({ vencido_total: 125000, vencido_cantidad: 4, vencido_dias_max: 31 });
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
        // Dos carriles diferidos: el motor de workflows y la consulta de Shopify.
        expect(m.pending.length).toBe(2);
        expect(m.shopifyPedido).toHaveBeenCalledWith(A, 'quote.approved', QUOTE);
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

    it('en los textos, el estado actual se consulta al ejecutar y las opciones salen con su nombre', async () => {
        await m.db.exec(`update cotizaciones set status = 'paid'`);
        await workflow(A, 'quote.approved', [task('tsk1', '{{folio}}: {{estado_actual}} por {{actor_tipo}}, {{total}}')]);
        await quoteEvent();
        await flush();
        expect((await q('select titulo from tareas')).map((r: any) => r.titulo)).toEqual(['COT-7: Pagada por Alguien del equipo, 150,000']);
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
        // El error se guarda como CÓDIGO: el idioma se resuelve al leerlo (regla 36).
        expect(run.error).toBe('wf.err.slack_sin_conexion');
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

    it('nota en HubSpot: va al Deal de la cotización del evento con el HTML escapado', async () => {
        m.hsNote.mockResolvedValue('deal');
        await workflow(A, 'quote.approved', [{ id: 'nota1', type: 'action', action: 'hubspot_note', params: { mensaje: 'Aprobó {{cliente}}' } }]);
        await quoteEvent();
        await flush();
        const [run] = await q('select status, log from workflow_runs');
        expect(run.status).toBe('succeeded');
        expect(run.log.at(-1)).toMatchObject({ step: 'nota1', resultado: 'ok', detalle: 'deal' });
        expect(m.hsNote).toHaveBeenCalledWith(A, { quoteId: QUOTE, clientId: null }, 'Aprobó ACME &#60;script&#62;');
    });

    it('nota en HubSpot: si el registro aún no se sincroniza reintenta; sin conexión no insiste', async () => {
        const { HubSpotActionError } = await import('../src/lib/integraciones/hubspot/actions') as any;
        m.hsNote.mockRejectedValue(new HubSpotActionError('Este registro todavía no está en HubSpot.', false));
        await workflow(A, 'quote.approved', [{ id: 'nota2', type: 'action', action: 'hubspot_note', params: { mensaje: 'x' } }]);
        await quoteEvent();
        await flush();
        expect(m.hsNote).toHaveBeenCalledTimes(2);
        let [run] = await q('select status, attempts, error from workflow_runs');
        expect(run).toMatchObject({ status: 'queued', attempts: 1 });

        await m.db.exec('delete from workflow_runs; delete from workflows; delete from domain_events;');
        m.hsNote.mockReset().mockRejectedValue(new HubSpotActionError('hs.err.sin_conexion'));
        await workflow(A, 'quote.approved', [{ id: 'nota3', type: 'action', action: 'hubspot_note', params: { mensaje: 'x' } }]);
        await quoteEvent();
        await flush();
        expect(m.hsNote).toHaveBeenCalledTimes(1);
        [run] = await q('select error from workflow_runs');
        expect(run.error).toBe('wf.err.hubspot_datos');
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

describe('acciones sobre el propio Cord', () => {
    it('le escribe al cliente de la cotización del evento y consume la cuota de envíos', async () => {
        await workflow(A, 'quote.approved', [{
            id: 'mail9', type: 'action', action: 'send_client_email',
            params: { asunto: 'Gracias {{cliente}}', mensaje: 'Aprobaste {{folio}} por {{total}}' },
        }]);
        await quoteEvent();
        await flush();
        expect(m.reserve).toHaveBeenCalledWith(A, 'envios', 1);
        expect(m.clientQuoteEmail).toHaveBeenCalledWith(A, QUOTE, expect.objectContaining({
            asunto: 'Gracias ACME <script>',
            mensaje: 'Aprobaste COT-7 por 150,000',
            locale: 'es',
        }));
        expect((await q('select status from workflow_runs'))[0].status).toBe('succeeded');
    });

    it('si el cliente no tiene correo libera la reserva y no insiste en el mismo intento', async () => {
        m.clientQuoteEmail.mockResolvedValue({ sent: false, reason: 'sin_correo' });
        await workflow(A, 'quote.approved', [{
            id: 'mailx', type: 'action', action: 'send_client_email', params: { asunto: 'Hola', mensaje: 'Texto' },
        }]);
        await quoteEvent();
        await flush();
        expect(m.clientQuoteEmail).toHaveBeenCalledTimes(1);
        expect(m.cancelUsage).toHaveBeenCalledWith(A, 'res-1');
        expect((await q('select error from workflow_runs'))[0].error).toBe('wf.err.cliente_sin_correo');
    });

    it('caduca la cotización del evento, nunca un id escrito en el paso', async () => {
        await workflow(A, 'quote.approved', [{ id: 'exp1', type: 'action', action: 'expire_quote', params: { cotizacion_id: B } }]);
        await quoteEvent();
        await flush();
        expect(m.expireQuote).toHaveBeenCalledWith(expect.objectContaining({ orgId: A }), QUOTE);
        expect((await q('select status from workflow_runs'))[0].status).toBe('succeeded');
    });

    it('un estado que ya no admite la acción se reporta con su código', async () => {
        m.expireQuote.mockResolvedValue({ status: 409, body: { error: 'x' } });
        await workflow(A, 'quote.approved', [{ id: 'exp2', type: 'action', action: 'expire_quote', params: {} }]);
        await quoteEvent();
        await flush();
        expect((await q('select error from workflow_runs'))[0].error).toBe('wf.err.cotizacion_estado');
    });
});

describe('POST a una URL', () => {
    const paso = (url: string) => ({ id: 'http1', type: 'action', action: 'http_webhook', params: { url, mensaje: 'Aprobada {{folio}}' } });

    it('manda el evento y sus datos en JSON', async () => {
        await workflow(A, 'quote.approved', [paso('https://hooks.ejemplo.com/cord')]);
        await quoteEvent();
        await flush();
        const [url, init] = m.safeFetch.mock.calls[0];
        expect(url).toBe('https://hooks.ejemplo.com/cord');
        expect(init.method).toBe('POST');
        const body = JSON.parse(init.body);
        expect(body).toMatchObject({ evento: 'quote.approved', objeto: 'quote', objeto_id: QUOTE, mensaje: 'Aprobada COT-7' });
        expect(body.datos.folio).toBe('COT-7');
        expect((await q('select status from workflow_runs'))[0].status).toBe('succeeded');
    });

    it('una URL interna o sin https no llega a la red', async () => {
        await workflow(A, 'quote.approved', [paso('http://169.254.169.254/latest/meta-data')]);
        await quoteEvent();
        await flush();
        expect(m.safeFetch).not.toHaveBeenCalled();
        expect((await q('select error from workflow_runs'))[0].error).toBe('wf.err.url_invalida');
    });

    it('si el destino rechaza el envío, el paso falla con su código', async () => {
        m.safeFetch.mockResolvedValue({ ok: false, status: 500, body: '', error: 'HTTP 500', ms: 5 });
        await workflow(A, 'quote.approved', [paso('https://hooks.ejemplo.com/cord')]);
        await quoteEvent();
        await flush();
        expect((await q('select error from workflow_runs'))[0].error).toBe('wf.err.http_rechazo');
    });
});

describe('datos del negocio', () => {
    it('cualquier plantilla puede usar el nombre y el contacto del negocio', async () => {
        await workflow(A, 'quote.approved', [{
            id: 'mailneg', type: 'action', action: 'notify_team',
            params: { destinatarios: 'owner', asunto: '{{negocio}}', mensaje: 'Escríbenos a {{negocio_correo}} o al {{negocio_telefono}}. Hoy es {{hoy}}.' },
        }]);
        await quoteEvent();
        await flush();
        const [call] = m.email.mock.calls.at(-1)!;
        expect(call.subject).toBe('Acme');
        expect(call.html).toContain('Escríbenos a hola@acme.test o al 555-0100.');
        expect(call.html).toMatch(/Hoy es \d{4}-\d{2}-\d{2}\./);
    });
});

describe('consultas y esperas condicionadas', () => {
    it('una consulta deja sus valores disponibles para los pasos siguientes', async () => {
        await workflow(A, 'quote.approved', [
            { id: 'cons1', type: 'query', dataset: 'cartera_vencida', params: {} },
            { id: 'mail1', type: 'action', action: 'notify_team', params: { destinatarios: 'owner', asunto: 'Cartera', mensaje: 'Deben {{vencido_total}} en {{vencido_cantidad}} documentos' } },
        ]);
        await quoteEvent();
        await flush();
        expect(m.runDataset).toHaveBeenCalledWith('cartera_vencida', A, expect.objectContaining({ clienteId: null }));
        expect(m.email).toHaveBeenCalledWith(expect.objectContaining({ html: expect.stringContaining('Deben 125,000 en 4 documentos') }));
        const [run] = await q('select status, datos from workflow_runs');
        expect(run.status).toBe('succeeded');
        expect(run.datos).toMatchObject({ vencido_total: 125000 });
    });

    it('una condición puede decidir con el dato que trajo la consulta', async () => {
        m.runDataset.mockResolvedValue({ vencido_total: 10, vencido_cantidad: 1, vencido_dias_max: 2 });
        await workflow(A, 'quote.approved', [
            { id: 'cons2', type: 'query', dataset: 'cartera_vencida', params: {} },
            {
                id: 'cond2', type: 'condition', match: 'all',
                conditions: [{ field: 'vencido_total', op: 'gte', value: 100000 }],
                then: [task('tsk1', 'No debería')], else: [task('tsk2', 'Cartera sana')],
            },
        ]);
        await quoteEvent();
        await flush();
        expect((await q('select titulo from tareas')).map((r: any) => r.titulo)).toEqual(['Cartera sana']);
    });

    it('la espera condicionada sigue esperando, y al cumplirse toma la rama de sí', async () => {
        await workflow(A, 'quote.approved', [{
            id: 'esp1', type: 'wait_until', match: 'all', days: 7,
            conditions: [{ field: 'estado_actual', op: 'eq', value: 'paid' }],
            then: [task('tsk1', 'Ya pagó')], else: [task('tsk2', 'Nunca pagó')],
        }]);
        await quoteEvent();
        await flush();

        let [run] = await q('select status, run_at, datos from workflow_runs');
        expect(run.status).toBe('waiting');
        expect(await q('select id from tareas')).toEqual([]);
        // El plazo se fija una sola vez y queda guardado.
        const vence = (run.datos as any).__vence.esp1;
        expect(Date.parse(vence)).toBeGreaterThan(Date.now());

        await m.db.exec(`update cotizaciones set status = 'paid'; update workflow_runs set run_at = now() - interval '1 minute'`);
        await processOrgRuns(A);
        [run] = await q('select status, datos from workflow_runs');
        expect(run.status).toBe('succeeded');
        expect((run.datos as any).__vence.esp1).toBe(vence);
        expect((await q('select titulo from tareas')).map((r: any) => r.titulo)).toEqual(['Ya pagó']);
    });

    it('cuando se acaba el plazo toma la rama de no, sin quedarse esperando para siempre', async () => {
        await workflow(A, 'quote.approved', [{
            id: 'esp2', type: 'wait_until', match: 'all', days: 1,
            conditions: [{ field: 'estado_actual', op: 'eq', value: 'paid' }],
            then: [task('tsk1', 'Ya pagó')], else: [task('tsk2', 'Nunca pagó')],
        }]);
        await quoteEvent();
        await flush();
        expect((await q('select status from workflow_runs'))[0].status).toBe('waiting');

        // El plazo ya pasó: la siguiente revisión no vuelve a esperar.
        await m.db.exec(`update workflow_runs
            set run_at = now() - interval '1 minute',
                datos = jsonb_build_object('__vence', jsonb_build_object('esp2', to_char(now() - interval '1 hour', 'YYYY-MM-DD"T"HH24:MI:SSZ')))`);
        await processOrgRuns(A);
        const [run] = await q('select status from workflow_runs');
        expect(run.status).toBe('succeeded');
        expect((await q('select titulo from tareas')).map((r: any) => r.titulo)).toEqual(['Nunca pagó']);
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

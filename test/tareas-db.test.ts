import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// Tareas contra Postgres real: la migración aditiva de db/tareas-seguimiento.sql
// (la misma que corre en cada build), las acciones, el read-model y el cron del
// recordatorio con su dedup.

const m = vi.hoisted(() => ({
    db: null as any, org: '', failTo: '',
    sent: [] as { to: string; subject: string; html: string }[],
    events: [] as { orgId: string; type: string; data: Record<string, unknown> }[],
}));
const run = (queries: Array<{ text: string; values: unknown[] }>, orgId = '') => m.db.transaction(async (tx: any) => {
    await tx.query("select set_config('app.org_id', $1, true)", [orgId]);
    const out = [];
    for (const q of queries) out.push((await tx.query(q.text, q.values)).rows);
    return out;
});
vi.mock('../src/lib/db', () => ({
    sql: (s: TemplateStringsArray, ...values: unknown[]) => ({ text: s.reduce((out, part, i) => out + (i ? `$${i}` : '') + part, ''), values }),
    withOrgTx: (orgId: string, ...queries: Array<{ text: string; values: unknown[] }>) => run(queries, orgId),
    withSystemTx: (...queries: Array<{ text: string; values: unknown[] }>) => run(queries),
    getActiveOrgId: async () => m.org,
    logAudit: async () => {},
}));
vi.mock('../src/lib/webhooks', () => ({
    dispatchEvent: async (orgId: string, type: string, data: Record<string, unknown>) => { m.events.push({ orgId, type, data }); },
}));
vi.mock('../src/lib/after', () => ({ after: () => {} }));
vi.mock('../src/lib/email', () => ({
    siteOrigin: () => 'https://cordhq.app',
    sendEmail: async (o: { to: string; subject: string; html: string }) => {
        if (o.to === m.failTo) return { sent: false, error: 'x' };
        m.sent.push({ to: o.to, subject: o.subject, html: o.html });
        return { sent: true };
    },
}));

import { reqContext } from '../src/lib/context';
import {
    createTask, emitTaskCreated, orgTaskProfile, setTaskDone, systemTaskInsert, systemTaskTitle, updateTask,
} from '../src/lib/actions/tasks';
import { listTasks, taskBadge } from '../src/lib/tasks-db';
import { localClock } from '../src/lib/task-reminders';
import { addDays } from '../src/lib/tasks';
import { GET as cronTareas } from '../src/pages/api/cron/tareas';

const ORG = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
const OTRA = 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb';
const ANA = '11111111-1111-4111-8111-111111111111';
const BETO = '22222222-2222-4222-8222-222222222222';
const EXTRA = '33333333-3333-4333-8333-333333333333'; // miembro de OTRA, no de ORG
const COT = '44444444-4444-4444-8444-444444444444';
const FAC = '66666666-6666-4666-8666-666666666666';
const FAC_OTRA = '77777777-7777-4777-8777-777777777777';
const ZONA = 'America/Mexico_City';

const as = <T>(userId: string, fn: () => Promise<T>, locale: 'es' | 'en' = 'es') => reqContext.run({ userId, timeZone: ZONA, locale } as any, fn);
const ctx = (userId: string | null = ANA) => ({ orgId: ORG, origin: 'https://cordhq.app', userId });
const migration = () => readFileSync('db/tareas-seguimiento.sql', 'utf8')
    .replace(/^--.*$/gm, '').split(';').map((s) => s.trim()).filter(Boolean);

beforeAll(async () => {
    m.db = new PGlite();
    await m.db.exec(`
        create table users (id uuid primary key);
        create table orgs (id uuid primary key, nombre text, zona_horaria text, idioma text, owner_id uuid, country_code text default 'MX',
                           notif_prefs jsonb default '{}'::jsonb, sandbox_of uuid, is_demo boolean default false);
        create table org_members (org_id uuid, user_id uuid, nombre text, email text, estado text,
                                  rol text not null default 'miembro', permisos jsonb not null default '{}'::jsonb);
        create table clientes (id uuid primary key, empresa text);
        create table cotizaciones (id uuid primary key, org_id uuid, folio text, cliente_id uuid);
        create table documentos_fiscales (id uuid primary key, org_id uuid, invoice_number text, cliente_id uuid, cotizacion_id uuid);
        create table tareas (
          id uuid default gen_random_uuid() primary key, org_id uuid not null, cotizacion_id uuid references cotizaciones(id),
          titulo text not null, due_date date, done boolean not null default false, created_at timestamptz default now());
        alter table tareas add column documento_id uuid references documentos_fiscales(id);
        create table domain_events (id uuid default gen_random_uuid() primary key, org_id uuid, type text, data jsonb, created_at timestamptz default now());
        insert into users values ('${ANA}'), ('${BETO}'), ('${EXTRA}');
        insert into orgs (id, nombre, zona_horaria, idioma, owner_id) values
          ('${ORG}', 'Gama', '${ZONA}', 'es-MX', '${ANA}'), ('${OTRA}', 'Otra', 'UTC', 'es-MX', '${EXTRA}');
        insert into org_members (org_id, user_id, nombre, email, estado, rol, permisos) values
          ('${ORG}', '${ANA}', 'Ana López', 'ana@gama.mx', 'activo', 'owner', '{}'),
          ('${ORG}', '${BETO}', 'Beto Ruiz', 'beto@gama.mx', 'activo', 'vendedor', '{"cotizar": true}'),
          ('${OTRA}', '${EXTRA}', 'Extra', 'extra@otra.mx', 'activo', 'owner', '{}');
        insert into clientes values ('55555555-5555-4555-8555-555555555555', 'Acme');
        insert into cotizaciones values ('${COT}', '${ORG}', 'COT-0149', '55555555-5555-4555-8555-555555555555');
        insert into documentos_fiscales values
          ('${FAC}', '${ORG}', 'F-0012', '55555555-5555-4555-8555-555555555555', null),
          ('${FAC_OTRA}', '${OTRA}', 'F-9999', null, null);
    `);
    // La migración es idempotente: corre en CADA build.
    for (let i = 0; i < 2; i++) for (const stmt of migration()) await m.db.query(stmt);
    m.org = ORG;
}, 30000);
afterAll(async () => { await m.db?.close(); });
beforeEach(async () => {
    await m.db.exec('delete from tareas; update org_members set tareas_avisadas_el = null');
    m.sent = []; m.failTo = ''; m.events = [];
});

describe('migración de despliegue', () => {
    it('corre en el build antes de compilar y cada sentencia es espejo de db/schema.sql', () => {
        const build = JSON.parse(readFileSync('vercel.json', 'utf8')).buildCommand as string;
        const steps = build.split('&&').map((s) => s.trim());
        expect(steps.indexOf('node scripts/migrate-tareas.mjs')).toBeGreaterThan(-1);
        expect(steps.indexOf('node scripts/migrate-tareas.mjs')).toBeLessThan(steps.indexOf('npm run build'));
        const squash = (s: string) => s.replace(/\s+/g, ' ').trim();
        const schema = squash(readFileSync('db/schema.sql', 'utf8'));
        for (const stmt of migration()) expect(schema, stmt).toContain(squash(stmt));
    });
});

describe('acciones', () => {
    it('crea con prioridad, notas y responsable, y guarda quién la creó', async () => {
        const out = await createTask(ctx(), { titulo: '  Llamar a Luis  ', prioridad: 'alta', notas: 'tel 55', asignado_a: BETO, cotizacion_id: COT });
        expect(out.status).toBe(200);
        const { rows: [t] } = await m.db.query('select * from tareas where id = $1', [out.body.id]);
        expect(t).toMatchObject({ titulo: 'Llamar a Luis', prioridad: 'alta', notas: 'tel 55', asignado_a: BETO, creado_por: ANA });
    });

    it('rechaza un responsable que no es miembro activo de ESTA organización', async () => {
        expect((await createTask(ctx(), { titulo: 'x', asignado_a: EXTRA })).status).toBe(400);
        expect((await createTask(ctx(), { titulo: 'x', prioridad: 'urgente' })).status).toBe(400);
        expect((await createTask(ctx(), { titulo: 'x', due_date: '2026-02-30' })).status).toBe(400);
    });

    it('sin responsable elegido, el quick-add la deja a quien la escribe; la API no', async () => {
        const q = await createTask(ctx(), { titulo: 'quick', asignar_a_creador: true });
        const a = await createTask(ctx(null), { titulo: 'api' });
        const { rows } = await m.db.query('select titulo, asignado_a from tareas order by titulo');
        expect(rows).toEqual([{ titulo: 'api', asignado_a: null }, { titulo: 'quick', asignado_a: ANA }]);
        expect(q.status).toBe(200); expect(a.status).toBe(200);
    });

    it('editar es parcial, y reprogramar vuelve a habilitar el recordatorio', async () => {
        const { body } = await createTask(ctx(), { titulo: 'x', due_date: '2026-10-08', notas: 'n' });
        await m.db.query(`update tareas set recordada_el = '2026-10-08' where id = $1`, [body.id]);
        expect((await updateTask(ctx(), body.id as string, { due_date: '2026-10-12' })).status).toBe(200);
        let { rows: [t] } = await m.db.query(`select to_char(due_date,'YYYY-MM-DD') as due, recordada_el, notas, titulo from tareas where id = $1`, [body.id]);
        expect(t).toMatchObject({ due: '2026-10-12', recordada_el: null, notas: 'n', titulo: 'x' });
        await updateTask(ctx(), body.id as string, { due_date: null, asignado_a: BETO, notas: '' });
        ({ rows: [t] } = await m.db.query('select due_date, asignado_a, notas from tareas where id = $1', [body.id]));
        expect(t).toEqual({ due_date: null, asignado_a: BETO, notas: null });
        expect((await updateTask(ctx(), body.id as string, { titulo: '   ' })).status).toBe(400);
    });

    it('completar deja rastro de quién y cuándo; reabrir lo limpia', async () => {
        const { body } = await createTask(ctx(), { titulo: 'x' });
        await setTaskDone(ctx(BETO), body.id as string, true);
        let { rows: [t] } = await m.db.query('select done, completed_by, completed_at from tareas where id = $1', [body.id]);
        expect(t.done).toBe(true); expect(t.completed_by).toBe(BETO); expect(t.completed_at).toBeTruthy();
        await setTaskDone(ctx(), body.id as string, false);
        ({ rows: [t] } = await m.db.query('select done, completed_by, completed_at from tareas where id = $1', [body.id]));
        expect(t).toEqual({ done: false, completed_by: null, completed_at: null });
    });

    it('no toca tareas de otra organización', async () => {
        const { rows: [t] } = await m.db.query(`insert into tareas (org_id, titulo) values ('${OTRA}', 'ajena') returning id`);
        expect((await updateTask(ctx(), t.id, { titulo: 'mía' })).status).toBe(404);
        expect((await setTaskDone(ctx(), t.id, true)).status).toBe(404);
    });
});

describe('vínculos y tareas automáticas', () => {
    it('liga una factura de la organización y emite task.created con ella', async () => {
        const out = await createTask(ctx(), { titulo: 'Cobrar', documento_id: FAC, cotizacion_id: COT });
        expect(out.status).toBe(200);
        const { rows: [t] } = await m.db.query('select documento_id, cotizacion_id from tareas where id = $1', [out.body.id]);
        expect(t).toEqual({ documento_id: FAC, cotizacion_id: COT });
        expect(m.events).toEqual([expect.objectContaining({ type: 'task.created', data: expect.objectContaining({ factura_id: FAC, cotizacion_id: COT }) })]);
        const list = await as(ANA, () => listTasks({ scope: 'todas' }));
        expect(list.items[0].ref).toMatchObject({ tipo: 'factura', label: 'F-0012', cliente: 'Acme', href: `/app/facturas/${FAC}` });
    });

    it('una factura o cotización de otra cuenta responde 404, con el texto en el idioma de la cuenta', async () => {
        const en = (input: Record<string, unknown>) => as(ANA, () => createTask(ctx(), { titulo: 'x', ...input }), 'en');
        expect(await en({ documento_id: FAC_OTRA })).toMatchObject({ status: 404, body: { error: 'Invoice not found' } });
        expect(await en({ documento_id: 'no-es-uuid' })).toMatchObject({ status: 404, body: { error: 'Invoice not found' } });
        expect(await en({ cotizacion_id: OTRA })).toMatchObject({ status: 404, body: { error: 'Quote not found' } });
        expect((await createTask(ctx(), { titulo: 'x', cotizacion_id: OTRA })).body.error).toBe('Cotización no encontrada');
        const { rows } = await m.db.query('select id from tareas');
        expect(rows).toEqual([]);
    });

    it('las automáticas (contracargo, reembolso SPEI) usan el mismo INSERT, el idioma de la org y emiten task.created', async () => {
        await m.db.query(`update orgs set idioma = 'en-US' where id = $1`, [ORG]);
        const perfil = await orgTaskProfile(ORG);
        await m.db.query(`update orgs set idioma = 'es-MX' where id = $1`, [ORG]);
        expect(perfil).toEqual({ locale: 'en', zona: ZONA });
        const [[row]] = await m.db.transaction(async (tx: any) => {
            const q = systemTaskInsert(ORG, {
                titulo: systemTaskTitle('contracargo', perfil.locale, 1500, 'MXN'),
                due_date: '2026-10-09', prioridad: 'alta', cotizacion_id: COT,
            }) as unknown as { text: string; values: unknown[] };
            return [(await tx.query(q.text, q.values)).rows];
        });
        emitTaskCreated(ORG, row);
        expect(row).toMatchObject({ titulo: 'Respond to the $1,500.00 MXN chargeback', prioridad: 'alta', cotizacion_id: COT });
        expect(m.events).toEqual([expect.objectContaining({ type: 'task.created', data: expect.objectContaining({ id: row.id, titulo: 'Respond to the $1,500.00 MXN chargeback' }) })]);
        // Una reentrega del mismo aviso (el evento ya se emitió) no duplica la tarea.
        await m.db.query(`insert into domain_events (org_id, type, data) values ($1, 'dispute.created', '{"referencia":"dp_1"}')`, [ORG]);
        const guarded = systemTaskInsert(ORG, { titulo: 'x' }, { unlessEvent: { type: 'dispute.created', referencia: 'dp_1' } }) as unknown as { text: string; values: unknown[] };
        const fresh = systemTaskInsert(ORG, { titulo: 'y' }, { unlessEvent: { type: 'dispute.created', referencia: 'dp_2' } }) as unknown as { text: string; values: unknown[] };
        expect((await m.db.query(guarded.text, guarded.values)).rows).toEqual([]);
        expect((await m.db.query(fresh.text, fresh.values)).rows).toHaveLength(1);
        await m.db.query('delete from domain_events');
        expect(systemTaskTitle('reembolso_spei', 'es', 3500, 'mxn')).toBe('Transferir reembolso SPEI por $3,500.00 MXN');
        expect(systemTaskTitle('reembolso_spei', 'en', 3500, 'MXN')).toBe('Send the $3,500.00 MXN SPEI refund');
        // Sin decimales inventados en una divisa que no los tiene.
        expect(systemTaskTitle('contracargo', 'es', 12000, 'JPY')).toBe('Responder contracargo de ¥12,000 JPY');
    });

    it('las rutas de dinero ya no insertan tareas a mano', () => {
        for (const f of ['src/pages/api/stripe/webhook.ts', 'src/pages/api/cobros/[cobroId]/reembolso.ts']) {
            const src = readFileSync(f, 'utf8');
            expect(src, f).not.toMatch(/insert\s+into\s+tareas/i);
            expect(src, f).toContain('systemTaskInsert(');
            expect(src, f).toContain('emitTaskCreated(');
        }
    });
});

describe('lista', () => {
    it('agrupa con el día del negocio, filtra por responsable y cuenta lo que no cabe', async () => {
        const today = localClock(ZONA).day;
        await createTask(ctx(), { titulo: 'vencida', due_date: addDays(today, -2), asignado_a: ANA });
        await createTask(ctx(), { titulo: 'hoy', due_date: today, asignado_a: BETO, cotizacion_id: COT });
        await createTask(ctx(), { titulo: 'sin fecha' });
        const all = await as(ANA, () => listTasks({ scope: 'todas', limit: 2 }));
        expect(all.items.map((i) => [i.titulo, i.bucket])).toEqual([['vencida', 'vencidas'], ['hoy', 'hoy']]);
        expect(all.total).toBe(3);
        expect(all.counts).toMatchObject({ vencidas: 1, hoy: 1, pendientes: 3, mias: 1, sinAsignar: 1 });
        // La fecha viaja como día civil: nada de medianoche UTC corrida un día.
        expect(all.items[1].due).toBe(today);
        expect(all.items[1].ref).toMatchObject({ tipo: 'cotizacion', label: 'COT-0149', cliente: 'Acme', href: `/app/cotizaciones/${COT}` });
        expect(all.items[1].asignado).toMatchObject({ nombre: 'Beto Ruiz', inicial: 'BR' });

        const mias = await as(ANA, () => listTasks({ scope: 'mias' }));
        expect(mias.items.map((i) => i.titulo)).toEqual(['vencida']);
        const libres = await as(ANA, () => listTasks({ scope: 'sin_asignar' }));
        expect(libres.items.map((i) => i.titulo)).toEqual(['sin fecha']);

        // El badge de Ana: lo suyo o sin dueño que vence hoy o antes. Lo de Beto no.
        expect(await as(ANA, () => taskBadge())).toEqual({ n: 1, vencidas: 1 });
    });
});

describe('lista larga', () => {
    it('pasa de 200 con "Mostrar más" y el total también cuenta las completadas', async () => {
        await m.db.query(`insert into tareas (org_id, titulo) select $1, 'p' || g from generate_series(1, 230) g`, [ORG]);
        await m.db.query(`insert into tareas (org_id, titulo, done, completed_at) select $1, 'c' || g, true, now() from generate_series(1, 5) g`, [ORG]);
        const first = await as(ANA, () => listTasks({ scope: 'todas', limit: 200 }));
        expect([first.items.length, first.total, first.limit]).toEqual([200, 230, 200]);
        const more = await as(ANA, () => listTasks({ scope: 'todas', limit: 400 }));
        expect(more.items.length).toBe(230);
        const done = await as(ANA, () => listTasks({ estado: 'completadas', scope: 'todas', limit: 2 }));
        expect([done.items.length, done.total]).toEqual([2, 5]);
        expect(done.counts.pendientes).toBe(230);
    });
});

describe('cron del recordatorio', () => {
    const call = () => cronTareas({ request: new Request('https://cordhq.app/api/cron/tareas', { headers: { authorization: 'Bearer s3cret' } }) } as any);
    beforeAll(() => {
        process.env.CRON_SECRET = 's3cret';
        // 10:00 en Ciudad de México del día UTC real (el `current_date` de Postgres no se finge).
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(new Date(`${new Date().toISOString().slice(0, 10)}T16:00:00Z`));
    });
    afterAll(() => { vi.useRealTimers(); });

    it('antes de las 8:00 locales no manda nada', async () => {
        vi.setSystemTime(new Date(`${new Date().toISOString().slice(0, 10)}T12:00:00Z`)); // 6:00 CDMX
        await createTask(ctx(), { titulo: 'temprano', due_date: localClock(ZONA).day, asignado_a: ANA });
        const res = await (await call()).json();
        expect(res).toMatchObject({ correos: 0, fueraDeHora: 1 });
        vi.setSystemTime(new Date(`${new Date().toISOString().slice(0, 10)}T16:00:00Z`));
    });

    it('manda un correo por responsable y no repite el mismo día', async () => {
        const today = localClock(ZONA).day;
        await createTask(ctx(), { titulo: 'de Ana', due_date: today, asignado_a: ANA });
        await createTask(ctx(), { titulo: 'de Beto', due_date: addDays(today, -1), asignado_a: BETO });
        await createTask(ctx(), { titulo: 'futura', due_date: addDays(today, 3), asignado_a: ANA });
        await createTask(ctx(BETO), { titulo: 'sin dueño', due_date: today });

        await call();
        expect(m.sent.map((s) => s.to).sort()).toEqual(['ana@gama.mx', 'beto@gama.mx']);
        // "sin dueño" va a quien la creó (Beto), junto con la suya.
        expect(m.sent.find((s) => s.to === 'beto@gama.mx')!.subject).toBe('Tienes 1 tarea vencida y 1 para hoy · Gama');
        const again = await (await call()).json();
        expect(again.correos).toBe(0);
        expect(m.sent).toHaveLength(2);
    });

    it('si el correo falla, libera la marca para reintentar; si la org lo apagó, no manda', async () => {
        const today = localClock(ZONA).day;
        await createTask(ctx(), { titulo: 'x', due_date: today, asignado_a: ANA });
        m.failTo = 'ana@gama.mx';
        expect((await (await call()).json()).fallidos).toBe(1);
        const { rows: [t] } = await m.db.query('select recordada_el from tareas');
        expect(t.recordada_el).toBeNull();

        m.failTo = '';
        await m.db.query(`update orgs set notif_prefs = '{"task_due":{"email":false}}' where id = $1`, [ORG]);
        expect((await (await call()).json()).correos).toBe(0);
        await m.db.query(`update orgs set notif_prefs = '{}' where id = $1`, [ORG]);
        expect((await (await call()).json()).correos).toBe(1);
    });

    it('a lo sumo un correo por persona al día: lo que entra a "hoy" después espera a mañana', async () => {
        const today = localClock(ZONA).day;
        await createTask(ctx(), { titulo: 'mañana temprano', due_date: today, asignado_a: ANA });
        await call();
        expect(m.sent.map((s) => s.to)).toEqual(['ana@gama.mx']);

        // A media mañana entra otra tarea para hoy, de Ana y de Beto (que no recibió nada hoy).
        await createTask(ctx(), { titulo: 'de media mañana', due_date: today, asignado_a: ANA });
        await createTask(ctx(), { titulo: 'de Beto', due_date: today, asignado_a: BETO });
        const second = await (await call()).json();
        expect(second).toMatchObject({ correos: 1, pospuestas: 1 });
        expect(m.sent.map((s) => s.to)).toEqual(['ana@gama.mx', 'beto@gama.mx']);
        // La de Ana queda libre para el correo de mañana, no marcada como avisada.
        const { rows: [t] } = await m.db.query(`select recordada_el from tareas where titulo = 'de media mañana'`);
        expect(t.recordada_el).toBeNull();

        // "Mañana": la marca de la persona es de ayer, así que vuelve a recibir — con la pendiente incluida.
        await m.db.query(`update org_members set tareas_avisadas_el = $1::date where user_id = $2`, [addDays(today, -1), ANA]);
        await m.db.query(`update tareas set recordada_el = $1::date where recordada_el is not null`, [addDays(today, -1)]);
        await call();
        expect(m.sent).toHaveLength(3);
        expect(m.sent[2].html).toContain('de media mañana');
    });

    it('si el envío falla, también libera la marca de la persona', async () => {
        await createTask(ctx(), { titulo: 'x', due_date: localClock(ZONA).day, asignado_a: BETO });
        m.failTo = 'beto@gama.mx';
        await call();
        const { rows: [b] } = await m.db.query('select tareas_avisadas_el from org_members where user_id = $1', [BETO]);
        expect(b.tareas_avisadas_el).toBeNull();
        m.failTo = '';
        expect((await (await call()).json()).correos).toBe(1);
    });

    it('el pie sólo le pide apagarlo a quien tiene permiso de Ajustes; el formato sigue al país', async () => {
        const today = localClock(ZONA).day;
        await createTask(ctx(), { titulo: 'de Ana', due_date: today, asignado_a: ANA });
        await createTask(ctx(), { titulo: 'de Beto', due_date: today, asignado_a: BETO });
        await call();
        const html = (to: string) => m.sent.find((s) => s.to === to)!.html;
        expect(html('ana@gama.mx')).toContain('Puedes apagarlo para todo el equipo en Ajustes');
        expect(html('beto@gama.mx')).toContain('pide a quien administra la cuenta');
        expect(html('beto@gama.mx')).not.toContain('Puedes apagarlo');
    });

    it('sin el secreto no corre', async () => {
        const res = await cronTareas({ request: new Request('https://cordhq.app/api/cron/tareas') } as any);
        expect(res.status).toBe(401);
    });
});

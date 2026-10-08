import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// Tareas contra Postgres real: la migración aditiva de db/tareas-seguimiento.sql
// (la misma que corre en cada build), las acciones, el read-model y el cron del
// recordatorio con su dedup.

const m = vi.hoisted(() => ({ db: null as any, org: '', sent: [] as { to: string; subject: string }[], failTo: '' }));
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
vi.mock('../src/lib/webhooks', () => ({ dispatchEvent: async () => {} }));
vi.mock('../src/lib/after', () => ({ after: () => {} }));
vi.mock('../src/lib/email', () => ({
    siteOrigin: () => 'https://cordhq.app',
    sendEmail: async (o: { to: string; subject: string }) => {
        if (o.to === m.failTo) return { sent: false, error: 'x' };
        m.sent.push({ to: o.to, subject: o.subject });
        return { sent: true };
    },
}));

import { reqContext } from '../src/lib/context';
import { createTask, setTaskDone, updateTask } from '../src/lib/actions/tasks';
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
const ZONA = 'America/Mexico_City';

const as = <T>(userId: string, fn: () => Promise<T>) => reqContext.run({ userId, timeZone: ZONA } as any, fn);
const ctx = (userId: string | null = ANA) => ({ orgId: ORG, origin: 'https://cordhq.app', userId });
const migration = () => readFileSync('db/tareas-seguimiento.sql', 'utf8')
    .replace(/^--.*$/gm, '').split(';').map((s) => s.trim()).filter(Boolean);

beforeAll(async () => {
    m.db = new PGlite();
    await m.db.exec(`
        create table users (id uuid primary key);
        create table orgs (id uuid primary key, nombre text, zona_horaria text, idioma text, owner_id uuid,
                           notif_prefs jsonb default '{}'::jsonb, sandbox_of uuid, is_demo boolean default false);
        create table org_members (org_id uuid, user_id uuid, nombre text, email text, estado text);
        create table clientes (id uuid primary key, empresa text);
        create table cotizaciones (id uuid primary key, org_id uuid, folio text, cliente_id uuid);
        create table documentos_fiscales (id uuid primary key, org_id uuid, invoice_number text, cliente_id uuid, cotizacion_id uuid);
        create table tareas (
          id uuid default gen_random_uuid() primary key, org_id uuid not null, cotizacion_id uuid references cotizaciones(id),
          titulo text not null, due_date date, done boolean not null default false, created_at timestamptz default now());
        alter table tareas add column documento_id uuid references documentos_fiscales(id);
        insert into users values ('${ANA}'), ('${BETO}'), ('${EXTRA}');
        insert into orgs (id, nombre, zona_horaria, idioma, owner_id) values
          ('${ORG}', 'Gama', '${ZONA}', 'es-MX', '${ANA}'), ('${OTRA}', 'Otra', 'UTC', 'es-MX', '${EXTRA}');
        insert into org_members values
          ('${ORG}', '${ANA}', 'Ana López', 'ana@gama.mx', 'activo'),
          ('${ORG}', '${BETO}', 'Beto Ruiz', 'beto@gama.mx', 'activo'),
          ('${OTRA}', '${EXTRA}', 'Extra', 'extra@otra.mx', 'activo');
        insert into clientes values ('55555555-5555-4555-8555-555555555555', 'Acme');
        insert into cotizaciones values ('${COT}', '${ORG}', 'COT-0149', '55555555-5555-4555-8555-555555555555');
    `);
    // La migración es idempotente: corre en CADA build.
    for (let i = 0; i < 2; i++) for (const stmt of migration()) await m.db.query(stmt);
    m.org = ORG;
}, 30000);
afterAll(async () => { await m.db?.close(); });
beforeEach(async () => { await m.db.exec('delete from tareas'); m.sent = []; m.failTo = ''; });

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

    it('sin el secreto no corre', async () => {
        const res = await cronTareas({ request: new Request('https://cordhq.app/api/cron/tareas') } as any);
        expect(res.status).toBe(401);
    });
});

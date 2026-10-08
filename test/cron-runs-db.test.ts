import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { splitStatements } from '../scripts/migrate-cron-runs.mjs';
import { dueEndpoints, parseSchedule, scheduleTable, EN_CADA_CORRIDA, NO_LLAMAR } from '../scripts/cron-schedule.mjs';

// El reloj de los crons contra Postgres real: la tabla `cron_runs` (la misma
// migración que corre en cada build), su política de carril de sistema con un
// rol sin bypass, y `runCronOnce`, que es lo que impide que los dos relojes
// (vercel.json y cord-crons.yml) dupliquen trabajo y lo que deja recuperar una
// corrida perdida o fallida.

const m = vi.hoisted(() => {
    process.env.CRON_SECRET = 'secreto-de-prueba';
    return { db: null as any, role: 'cron_tester' };
});
const run = (queries: Array<{ text: string; values: unknown[] }>, scope: string) => m.db.transaction(async (tx: any) => {
    await tx.query(`set local role ${m.role}`);
    await tx.query("select set_config('app.scope', $1, true)", [scope]);
    const out = [];
    for (const q of queries) out.push((await tx.query(q.text, q.values)).rows);
    return out;
});
vi.mock('../src/lib/db', () => ({
    sql: (s: TemplateStringsArray, ...values: unknown[]) => ({ text: s.reduce((out, part, i) => out + (i ? `$${i}` : '') + part, ''), values }),
    withSystemTx: async (...queries: Array<{ text: string; values: unknown[] }>) => {
        // Igual que el real: el carril de sistema exige el contexto de cron.
        const { reqContext } = await import('../src/lib/context');
        if (!reqContext.getStore()?.cronScope) throw new Error('withSystemTx sin cronScope');
        return run(queries, 'system');
    },
}));

import { cronPeriod, runCronOnce, STALE_MINUTES } from '../src/lib/cron-runs';

const migration = () => splitStatements(readFileSync('db/cron-runs.sql', 'utf8'));
const req = (qs = '', auth = 'Bearer secreto-de-prueba') =>
    new Request(`https://cordhq.app/api/cron/prueba${qs}`, { headers: { authorization: auth } });
const ok = (body: unknown = { ok: true }, status = 200) => async () =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const fila = async (periodo = '2026-10-08') =>
    (await m.db.query("select estado, intentos, resultado from cron_runs where endpoint = '/api/cron/prueba' and periodo = $1", [periodo])).rows[0];

beforeAll(async () => {
    m.db = new PGlite();
    // Idempotente: corre en CADA build.
    for (let i = 0; i < 2; i++) for (const stmt of migration()) await m.db.query(stmt);
    await m.db.exec(`create role ${m.role} nologin; grant select, insert, update, delete on cron_runs to ${m.role};`);
}, 30000);
afterAll(async () => { await m.db?.close(); });
beforeEach(async () => { await m.db.exec('delete from cron_runs'); });

describe('migración de despliegue', () => {
    it('corre en el build antes de compilar y cada sentencia es espejo de db/schema.sql', () => {
        const build = JSON.parse(readFileSync('vercel.json', 'utf8')).buildCommand as string;
        const steps = build.split('&&').map((s) => s.trim());
        expect(steps.indexOf('node scripts/migrate-cron-runs.mjs')).toBeGreaterThan(-1);
        expect(steps.indexOf('node scripts/migrate-cron-runs.mjs')).toBeLessThan(steps.indexOf('npm run build'));
        const squash = (s: string) => s.replace(/\s+/g, ' ').trim();
        const schema = squash(readFileSync('db/schema.sql', 'utf8'));
        const stmts = migration();
        expect(stmts.length).toBeGreaterThanOrEqual(6);
        for (const stmt of stmts) expect(schema, stmt).toContain(squash(stmt));
    });

    it('sin el carril de sistema, un rol sin bypass no lee ni escribe la tabla (regla 30)', async () => {
        await m.db.query("insert into cron_runs (endpoint, periodo, estado) values ('/api/cron/prueba', '2026-10-08', 'ok')");
        const [visto] = await run([{ text: 'select * from cron_runs', values: [] }], '');
        expect(visto).toHaveLength(0);
        await expect(run([{ text: "insert into cron_runs (endpoint, periodo) values ('x', 'y')", values: [] }], ''))
            .rejects.toThrow(/row-level security/);
        const [conCarril] = await run([{ text: 'select * from cron_runs', values: [] }], 'system');
        expect(conCarril).toHaveLength(1);
    });
});

describe('runCronOnce', () => {
    const P = '2026-10-08';

    it('sin el secreto no reclama ni corre', async () => {
        const fn = vi.fn(ok());
        const res = await runCronOnce(req('', 'Bearer otro'), '/api/cron/prueba', P, fn);
        expect(res.status).toBe(401);
        expect(fn).not.toHaveBeenCalled();
        expect(await fila()).toBeUndefined();
    });

    it('corre una vez por periodo: el segundo disparo responde omitido sin trabajar', async () => {
        const fn = vi.fn(ok({ enviados: 3 }));
        const primera = await runCronOnce(req(), '/api/cron/prueba', P, fn);
        expect(primera.status).toBe(200);
        expect(await primera.json()).toEqual({ enviados: 3 });
        const segunda = await runCronOnce(req(), '/api/cron/prueba', P, fn);
        expect(segunda.status).toBe(200);
        expect(await segunda.json()).toMatchObject({ omitido: true, motivo: 'ya_corrio', periodo: P });
        expect(fn).toHaveBeenCalledTimes(1);
        expect(await fila()).toMatchObject({ estado: 'ok', intentos: 1, resultado: { status: 200, body: { enviados: 3 } } });
        // Otro periodo es otra corrida.
        await runCronOnce(req(), '/api/cron/prueba', '2026-10-09', fn);
        expect(fn).toHaveBeenCalledTimes(2);
    });

    it('dos disparos simultáneos: solo uno trabaja', async () => {
        let soltar!: () => void;
        const lento = vi.fn(() => new Promise<Response>((r) => { soltar = () => r(new Response('{}')); }));
        const a = runCronOnce(req(), '/api/cron/prueba', P, lento);
        await vi.waitFor(() => expect(lento).toHaveBeenCalledTimes(1));
        const b = await runCronOnce(req(), '/api/cron/prueba', P, lento);
        expect(await b.json()).toMatchObject({ omitido: true, motivo: 'en_curso' });
        soltar();
        expect((await a).status).toBe(200);
        expect(lento).toHaveBeenCalledTimes(1);
    });

    it('un 5xx o una excepción dejan el periodo en error y la siguiente corrida lo recupera', async () => {
        const res = await runCronOnce(req(), '/api/cron/prueba', P, ok({ error: 'x' }, 500));
        expect(res.status).toBe(500);
        expect(await fila()).toMatchObject({ estado: 'error', intentos: 1 });

        const truena = await runCronOnce(req(), '/api/cron/prueba', P, async () => { throw new Error('detalle interno'); });
        expect(truena.status).toBe(500);
        // Regla 14: el mensaje interno no sale en la respuesta.
        expect(await truena.text()).not.toContain('detalle interno');
        expect(await fila()).toMatchObject({ estado: 'error', intentos: 2 });

        const fn = vi.fn(ok());
        expect((await runCronOnce(req(), '/api/cron/prueba', P, fn)).status).toBe(200);
        expect(fn).toHaveBeenCalledTimes(1);
        expect(await fila()).toMatchObject({ estado: 'ok', intentos: 3 });
    });

    it(`un running de más de ${STALE_MINUTES} minutos se considera muerto y se vuelve a reclamar`, async () => {
        await m.db.query("insert into cron_runs (endpoint, periodo, estado, started_at) values ('/api/cron/prueba', $1, 'running', now() - interval '29 minutes')", [P]);
        const fn = vi.fn(ok());
        await runCronOnce(req(), '/api/cron/prueba', P, fn);
        expect(fn).not.toHaveBeenCalled();
        await m.db.query("update cron_runs set started_at = now() - interval '31 minutes'");
        await runCronOnce(req(), '/api/cron/prueba', P, fn);
        expect(fn).toHaveBeenCalledTimes(1);
        expect(await fila()).toMatchObject({ estado: 'ok', intentos: 2 });
    });

    it('?force=1 repite un periodo ya terminado, pero nunca uno en curso', async () => {
        const fn = vi.fn(ok());
        await runCronOnce(req(), '/api/cron/prueba', P, fn);
        await runCronOnce(req('?force=1'), '/api/cron/prueba', P, fn);
        expect(fn).toHaveBeenCalledTimes(2);
        await m.db.query("update cron_runs set estado = 'running', started_at = now()");
        await runCronOnce(req('?force=1'), '/api/cron/prueba', P, fn);
        expect(fn).toHaveBeenCalledTimes(2);
    });

    it('una corrida muerta que termina tarde no pisa el registro de la que la recuperó', async () => {
        let soltar!: () => void;
        const vieja = runCronOnce(req(), '/api/cron/prueba', P,
            () => new Promise<Response>((r) => { soltar = () => r(new Response('{"vieja":true}', { status: 500 })); }));
        await vi.waitFor(() => expect(soltar).toBeTypeOf('function'));
        await m.db.query("update cron_runs set started_at = now() - interval '31 minutes'");
        await runCronOnce(req(), '/api/cron/prueba', P, ok({ nueva: true }));
        soltar();
        await vieja;
        expect(await fila()).toMatchObject({ estado: 'ok', resultado: { body: { nueva: true } } });
    });

    it('sin la tabla, el cron corre igual (falla abierto)', async () => {
        await m.db.exec('drop table cron_runs');
        try {
            const fn = vi.fn(ok());
            expect((await runCronOnce(req(), '/api/cron/prueba', P, fn)).status).toBe(200);
            expect((await runCronOnce(req(), '/api/cron/prueba', P, fn)).status).toBe(200);
            expect(fn).toHaveBeenCalledTimes(2);
        } finally {
            for (const stmt of migration()) await m.db.query(stmt);
            await m.db.exec(`grant select, insert, update, delete on cron_runs to ${m.role};`);
        }
    });

    it('cronPeriod usa el día, mes u hora UTC', () => {
        const d = new Date('2026-10-08T23:30:00-06:00'); // ya es 9 de oct en UTC
        expect(cronPeriod('dia', d)).toBe('2026-10-09');
        expect(cronPeriod('mes', d)).toBe('2026-10');
        expect(cronPeriod('hora', d)).toBe('2026-10-09T05');
    });
});

describe('tabla de cord-crons.yml', () => {
    const crons = JSON.parse(readFileSync('vercel.json', 'utf8')).crons as { path: string; schedule: string }[];
    const table = scheduleTable(crons);

    it('sale de vercel.json: todo cron programado ahí se llama o tiene motivo para no llamarse', () => {
        for (const c of crons) {
            expect(table.some((e: { path: string }) => e.path === c.path) || NO_LLAMAR.has(c.path), c.path).toBe(true);
        }
        // Los de cada corrida no se repiten como diarios.
        for (const path of EN_CADA_CORRIDA.keys()) {
            expect(table.filter((e: { path: string }) => e.path === path), path).toHaveLength(1);
        }
    });

    it('cada endpoint llamado existe como ruta', () => {
        for (const e of table) {
            const file = `src/pages${e.path}.ts`;
            expect(() => readFileSync(file), file).not.toThrow();
        }
    });

    it('a las 21:56 UTC recupera todo diario cuya hora ya pasó; a las 00:49 solo los de cada corrida', () => {
        const tarde = dueEndpoints(table, new Date('2026-10-08T21:56:00Z'));
        expect(tarde).toEqual(expect.arrayContaining(['/api/cron/recordatorios', '/api/cron/cobranza', '/api/cron/expirar-cotizaciones', '/api/cron/intereses', '/api/cron/comisiones-mensuales']));
        expect(tarde).not.toContain('/api/health');
        const temprano = dueEndpoints(table, new Date('2026-10-01T00:49:00Z'));
        expect(temprano.sort()).toEqual([...EN_CADA_CORRIDA.keys()].sort());
    });

    it('los mensuales solo cuando su día y hora ya pasaron en el mes', () => {
        const at = (iso: string) => dueEndpoints(table, new Date(iso));
        expect(at('2026-10-01T05:59:00Z')).not.toContain('/api/cron/intereses');
        expect(at('2026-10-01T06:00:00Z')).toContain('/api/cron/intereses');
        expect(at('2026-10-01T23:00:00Z')).not.toContain('/api/cron/comisiones-mensuales');
        expect(at('2026-10-02T08:10:00Z')).toContain('/api/cron/comisiones-mensuales');
        expect(at('2026-10-30T01:00:00Z')).toContain('/api/cron/comisiones-mensuales');
    });

    it('rechaza horarios que la tabla no sabe recuperar', () => {
        expect(() => parseSchedule('0 * * * *')).toThrow();
        expect(() => parseSchedule('0 6 31 * *')).toThrow();
        expect(() => parseSchedule('0 6 * * 1')).toThrow();
        expect(parseSchedule('45 13 * * *')).toEqual({ minute: 45, hour: 13, day: '*' });
    });
});

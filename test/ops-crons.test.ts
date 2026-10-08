import { describe, expect, it, vi } from 'vitest';

vi.mock('../src/lib/db', () => ({ sql: () => ({}) }));

const { opsCronDefs, opsCronStatus, opsCronResult, opsCadenceLabel, OPS_CRON_GRACE_HOURS } = await import('../src/lib/ops-crons');

const NOW = new Date('2026-10-08T18:00:00Z');
const daily = { endpoint: '/api/cron/recordatorios', cadence: { kind: 'daily', hour: 15, minute: 0 } } as const;
const run = (periodo: string, estado: 'ok' | 'error' | 'running', started = `${periodo}T15:02:00Z`) =>
    ({ endpoint: daily.endpoint, periodo, estado, intentos: 1, started_at: started, finished_at: started, resultado: { status: estado === 'ok' ? 200 : 500 } });
const days = (n: number) => Array.from({ length: n }, (_, i) => new Date(NOW.getTime() - (n - 1 - i) * 86_400_000).toISOString().slice(0, 10));

describe('tabla de crons esperados', () => {
    it('sale de vercel.json, del reloj de cada corrida y de las rutas que existen', () => {
        const defs = opsCronDefs(
            [{ path: '/api/cron/recordatorios', schedule: '0 15 * * *' }, { path: '/api/cron/intereses', schedule: '0 6 1 * *' }, { path: '/api/health', schedule: '0 10 * * *' }],
            ['/api/cron/recordatorios', '/api/cron/comisiones-emitir', '/api/cron/olvidado'],
            new Set(['/api/cron/recordatorios']),
            new Set(['/api/cron/comisiones-emitir']),
        );
        const by = Object.fromEntries(defs.map((d) => [d.endpoint, d.cadence.kind]));
        expect(by['/api/cron/recordatorios']).toBe('daily');
        expect(by['/api/cron/intereses']).toBe('monthly');
        expect(by['/api/health']).toBe('external');
        expect(by['/api/cron/workflows']).toBe('each_run');
        // Una ruta sin GET se corre a mano a propósito; una con GET y sin
        // horario es un cron que nunca corre, y se ve.
        expect(by['/api/cron/comisiones-emitir']).toBe('manual');
        expect(by['/api/cron/olvidado']).toBe('unscheduled');
        expect(opsCadenceLabel({ kind: 'daily', hour: 6, minute: 5 })).toBe('Diario 06:05 UTC');
    });
});

describe('estado de un cron', () => {
    it('al día cuando corrió cada periodo', () => {
        const s = opsCronStatus(daily, days(14).map((d) => run(d, 'ok')), NOW);
        expect(s.health).toBe('ok');
        expect(s.history).toHaveLength(14);
        expect(s.history.every((h) => h.estado === 'ok')).toBe(true);
    });

    it('falló si la última corrida terminó en error', () => {
        const all = days(14);
        const s = opsCronStatus(daily, [...all.slice(0, 13).map((d) => run(d, 'ok')), run(all[13], 'error')], NOW);
        expect(s.health).toBe('error');
    });

    it('colgado si sigue corriendo después del margen de recuperación', () => {
        const today = days(1)[0];
        const s = opsCronStatus(daily, [run(days(2)[0], 'ok'), run(today, 'running', `${today}T15:00:00Z`)], NOW);
        expect(s.health).toBe('stuck');
    });

    it('no corrió si falta el último periodo vencido; un hueco viejo ya recuperado no lo es', () => {
        const all = days(14);
        const withoutYesterday = all.filter((d) => d !== all[12]).map((d) => run(d, 'ok')).filter((r) => r.periodo !== all[13]);
        expect(opsCronStatus(daily, withoutYesterday, NOW).health).toBe('missed');
        const oldGap = all.filter((d) => d !== all[3]).map((d) => run(d, 'ok'));
        const s = opsCronStatus(daily, oldGap, NOW);
        expect(s.health).toBe('ok');
        expect(s.history[3].estado).toBe('missing');
    });

    it('dentro del margen del día no es una falla: queda pendiente', () => {
        const at = new Date(`${days(1)[0]}T${String(15 + OPS_CRON_GRACE_HOURS - 1).padStart(2, '0')}:00:00Z`);
        const s = opsCronStatus(daily, days(14).slice(0, 13).map((d) => run(d, 'ok')), at);
        expect(s.health).toBe('pending');
    });

    it('antes de su primera corrida registrada no hay "faltó"', () => {
        const s = opsCronStatus(daily, [run(days(1)[0], 'ok')], NOW);
        expect(s.health).toBe('ok');
        expect(s.history.filter((h) => h.estado === 'missing')).toHaveLength(0);
    });

    it('un cron que reclama periodo y no aparece en la bitácora no corrió', () => {
        const tracked = { ...daily, endpoint: '/api/cron/intereses-diario', tracked: true };
        // La bitácora existe desde hace 5 días (por otro cron) y este nunca apareció.
        const other = days(5).map((d) => ({ ...run(d, 'ok'), endpoint: '/api/cron/otro' }));
        const s = opsCronStatus(tracked, other, NOW);
        expect(s.health).toBe('missed');
        // Recién desplegado: un solo periodo vencido no basta para acusarlo.
        const yesterdayOnly = days(2).map((d) => ({ ...run(d, 'ok'), endpoint: '/api/cron/otro' }));
        expect(opsCronStatus(tracked, yesterdayOnly, NOW).health).toBe('pending');
        expect(s.history.filter((h) => h.estado === 'missing').length).toBeGreaterThan(0);
        // Sin bitácora de nadie todavía, no se acusa a nadie.
        expect(opsCronStatus(tracked, [], NOW).health).toBe('pending');
    });

    it('la tabla sabe qué crons reclaman su periodo leyendo su código', () => {
        const defs = opsCronDefs();
        expect(defs.find((d) => d.endpoint === '/api/cron/recordatorios')?.tracked).toBe(true);
        expect(defs.find((d) => d.endpoint === '/api/cron/workflows')?.tracked).toBe(false);
    });

    it('un cron de cada corrida sin correr en un día está caído', () => {
        const each = { endpoint: '/api/cron/verifactu-submit', cadence: { kind: 'each_run' }, tracked: true } as const;
        const old = { ...run('2026-10-05T10', 'ok', '2026-10-05T10:00:00Z'), endpoint: each.endpoint };
        expect(opsCronStatus(each, [old], NOW).health).toBe('missed');
        const fresh = { ...run('2026-10-08T16', 'ok', '2026-10-08T16:00:00Z'), endpoint: each.endpoint };
        expect(opsCronStatus(each, [fresh], NOW).health).toBe('ok');
    });

    it('un cron sin bitácora lo dice en vez de inventar un estado', () => {
        expect(opsCronStatus({ endpoint: '/api/cron/tareas', cadence: { kind: 'each_run' } }, [], NOW).health).toBe('untracked');
        expect(opsCronStatus({ endpoint: '/api/cron/x', cadence: { kind: 'unscheduled' } }, [], NOW).health).toBe('unscheduled');
    });

    it('resume el resultado guardado sin volcar el cuerpo', () => {
        expect(opsCronResult({ status: 200, body: { ok: true, enviados: 3, omitidos: 1 } })).toBe('HTTP 200 · enviados 3 · omitidos 1');
        expect(opsCronResult({ status: 500, body: { error: 'excepcion' } })).toBe('HTTP 500 · excepcion');
        expect(opsCronResult(null)).toBe('—');
    });
});

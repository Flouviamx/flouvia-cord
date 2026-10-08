import { describe, expect, it, vi } from 'vitest';

vi.mock('../src/lib/db', () => ({ sql: () => ({}) }));
const { evaluateOpsAlerts, OPS_ALERT_METRICS, parseOpsThreshold, opsAlertValue } = await import('../src/lib/ops-alerts');

const NOW = new Date('2026-10-08T12:00:00Z');
const get = (rows: any[], id: string) => rows.find((r) => r.metric.id === id);

describe('alertas de Ops', () => {
    it('sin regla guardada usa el umbral por defecto y queda encendida', () => {
        const rows = evaluateOpsAlerts(new Map([['stripe_events_stuck', 2]]), [], [], NOW);
        const r = get(rows, 'stripe_events_stuck');
        expect(r).toMatchObject({ enabled: true, threshold: 1, firing: true, transition: 'fired' });
        expect(r.since).toEqual(NOW);
    });

    it('avisa solo al cambiar de estado, y conserva desde cuándo está disparada', () => {
        const since = '2026-10-08T09:00:00Z';
        const still = evaluateOpsAlerts(new Map([['stripe_events_stuck', 3]]), [], [{ metric: 'stripe_events_stuck', firing: true, since }], NOW);
        expect(get(still, 'stripe_events_stuck')).toMatchObject({ firing: true, transition: null });
        expect(get(still, 'stripe_events_stuck').since).toEqual(new Date(since));
        const resolved = evaluateOpsAlerts(new Map([['stripe_events_stuck', 0]]), [], [{ metric: 'stripe_events_stuck', firing: true, since }], NOW);
        expect(get(resolved, 'stripe_events_stuck')).toMatchObject({ firing: false, transition: 'resolved', since: null });
    });

    it('una regla apagada no dispara, y apagarla resuelve la alerta abierta', () => {
        const rows = evaluateOpsAlerts(new Map([['api_5xx_1h', 500]]), [{ metric: 'api_5xx_1h', enabled: false, threshold: 20 }], [{ metric: 'api_5xx_1h', firing: true, since: NOW }], NOW);
        expect(get(rows, 'api_5xx_1h')).toMatchObject({ firing: false, transition: 'resolved' });
    });

    it('respeta el umbral guardado (que llega como texto desde numeric)', () => {
        const rows = evaluateOpsAlerts(new Map([['webhook_fail_pct_24h', 30]]), [{ metric: 'webhook_fail_pct_24h', enabled: true, threshold: '35' }], [], NOW);
        expect(get(rows, 'webhook_fail_pct_24h').firing).toBe(false);
    });

    it('sin dato no se inventa un problema', () => {
        const rows = evaluateOpsAlerts(new Map(), [], [], NOW);
        expect(rows.every((r) => !r.firing && r.value === null)).toBe(true);
        expect(rows).toHaveLength(OPS_ALERT_METRICS.length);
    });

    it('valida el umbral del formulario', () => {
        const pct = OPS_ALERT_METRICS.find((m) => m.unit === 'pct')!;
        const count = OPS_ALERT_METRICS.find((m) => m.unit === 'count')!;
        expect(parseOpsThreshold(pct, '12,5')).toBe(12.5);
        expect(parseOpsThreshold(pct, 101)).toBeNull();
        expect(parseOpsThreshold(count, -1)).toBeNull();
        expect(parseOpsThreshold(count, 'abc')).toBeNull();
        expect(parseOpsThreshold(count, '3')).toBe(3);
        expect(opsAlertValue(pct, 34.1)).toBe('34.1%');
    });

    it('cada métrica del catálogo existe en la función de la base o se calcula en código', () => {
        const fn = require('node:fs').readFileSync('db/migrations/2026-10-08-ops-fase4.sql', 'utf8');
        for (const m of OPS_ALERT_METRICS) {
            if (m.id === 'crons_problem') continue;
            expect(fn, m.id).toContain(`'${m.id}'`);
        }
    });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ sql: vi.fn(), tx: vi.fn(), track: vi.fn() }));
vi.mock('../src/lib/db', () => ({ sql: m.sql, withOrgTx: m.tx }));
vi.mock('../src/lib/posthog-server', () => ({ trackServer: m.track }));
import { emitSetupSteps } from '../src/lib/setup-analytics';
import type { EventProps } from '../src/lib/analytics-events';
const steps: EventProps<'setup_step_completed'>[] = ['marca', 'fiscal'].map(task => ({
    event_id: `org:${task}`, group: 'negocio', task_id: task as 'marca' | 'fiscal', done_count: 2, total: 10,
}));
beforeEach(() => { vi.resetAllMocks(); m.track.mockResolvedValue(true); m.tx.mockResolvedValue([]); });
describe('marcadores de entrega de setup', () => {
    it('marca cada paso solamente después de confirmar su envío', async () => {
        await emitSetupSteps('org', steps, true, false);
        expect(m.track).toHaveBeenCalledTimes(2);
        expect(m.tx).toHaveBeenCalledTimes(2);
        for (let i = 0; i < 2; i++) {
            expect(m.track.mock.invocationCallOrder[i]).toBeLessThan(m.tx.mock.invocationCallOrder[i]);
            expect(m.sql.mock.calls[i][1]).toEqual([steps[i].task_id]);
            expect(m.tx.mock.calls[i][0]).toBe('org');
        }
        expect(m.track).toHaveBeenCalledWith('setup_step_completed', 'org', steps[0], true, false);
    });
    it('no consume marcadores cuando la captura está apagada', async () => {
        m.track.mockResolvedValue(false);
        await emitSetupSteps('org', steps, false, false);
        expect(m.tx).not.toHaveBeenCalled();
    });
    it('deja pendiente el paso fallido y continúa con los demás; reintenta con el mismo ID', async () => {
        m.track.mockRejectedValueOnce(new Error('offline'));
        await emitSetupSteps('org', steps, false, false);
        expect(m.tx).toHaveBeenCalledTimes(1);
        expect(m.sql.mock.calls[0][1]).toEqual(['fiscal']);
        await emitSetupSteps('org', [steps[0]], false, false);
        expect(m.track.mock.calls[2][2].event_id).toBe(m.track.mock.calls[0][2].event_id);
        expect(m.sql.mock.calls[1][1]).toEqual(['marca']);
    });
    it('un fallo al guardar no inventa otra identidad de evento en el reintento', async () => {
        m.tx.mockRejectedValueOnce(new Error('database offline'));
        await emitSetupSteps('org', [steps[0]], false, false);
        await emitSetupSteps('org', [steps[0]], false, false);
        expect(m.track.mock.calls[0]).toEqual(m.track.mock.calls[1]);
    });
});

import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ capture: vi.fn(), flush: vi.fn(), groupIdentify: vi.fn() }));
vi.mock('posthog-node', () => ({ PostHog: function () { return m; } }));
vi.mock('../src/lib/analytics-internal', () => ({ isInternalAnalyticsOrg: vi.fn().mockResolvedValue(false), isInternalAnalyticsEmail: () => false }));
const step = { event_id: 'org:marca', group: 'negocio', task_id: 'marca', done_count: 1, total: 10 } as const;
beforeEach(() => {
    vi.resetModules(); vi.clearAllMocks();
    vi.stubEnv('DEV', false);
    vi.stubEnv('PUBLIC_POSTHOG_KEY', 'phc_local_fixture');
    vi.stubEnv('POSTHOG_DISABLE_CAPTURE', 'false');
    m.flush.mockResolvedValue(undefined);
});
afterEach(() => vi.unstubAllEnvs());
it('confirma entrega sólo después del flush y conserva el ID estable', async () => {
    const { trackServer } = await import('../src/lib/posthog-server');
    expect(await trackServer('setup_step_completed', 'org', step, false, false)).toBe(true);
    expect(m.capture).toHaveBeenCalledWith(expect.objectContaining({ properties: expect.objectContaining({ $insert_id: 'setup_step_completed:org:marca' }) }));
    expect(m.flush).toHaveBeenCalledTimes(1);
});
it('no confirma una entrega fallida', async () => {
    m.flush.mockRejectedValueOnce(new Error('offline'));
    const { trackServer } = await import('../src/lib/posthog-server');
    await expect(trackServer('setup_step_completed', 'org', step, false, false)).rejects.toThrow('offline');
});
it.each(['dev', 'kill-switch', 'missing-key'])('no confirma capturas deshabilitadas: %s', async mode => {
    if (mode === 'dev') vi.stubEnv('DEV', true);
    if (mode === 'kill-switch') vi.stubEnv('POSTHOG_DISABLE_CAPTURE', 'true');
    if (mode === 'missing-key') vi.stubEnv('PUBLIC_POSTHOG_KEY', '');
    const { trackServer } = await import('../src/lib/posthog-server');
    expect(await trackServer('setup_step_completed', 'org', step, false, false)).toBe(false);
    expect(m.capture).not.toHaveBeenCalled();
});

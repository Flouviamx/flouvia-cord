import { describe, expect, it } from 'vitest';
import {
    CORE_HEALTH_SERVICES,
    derivePlatformState,
    HEALTH_SERVICES,
    persistHealthResults,
    probePlatformHealth,
    publicHealthResults,
    type HealthProbeDependencies,
    type HealthService,
} from '../src/lib/platform-health';

const allOk = (called: string[] = []): HealthProbeDependencies => Object.fromEntries(
    HEALTH_SERVICES.map((service) => [service, async () => { called.push(service); }]),
) as unknown as HealthProbeDependencies;

describe('platform health', () => {
    it('ejecuta todas las sondas configuradas y conserva una sola marca temporal', async () => {
        const called: string[] = [];
        const results = await probePlatformHealth({
            ...allOk(called),
            now: () => new Date('2026-08-29T12:00:00.000Z'),
        });

        expect(new Set(called)).toEqual(new Set(HEALTH_SERVICES));
        expect(results.map((result) => result.service)).toEqual([...HEALTH_SERVICES]);
        expect(results.every((result) => result.ok)).toBe(true);
        expect(results.every((result) => result.checkedAt === '2026-08-29T12:00:00.000Z')).toBe(true);
    });

    it('omite las sondas sin credencial en vez de registrarlas como caídas', async () => {
        const results = await probePlatformHealth({ ...allOk(), fiscal: null, email: null, ai: null });
        const services = results.map((result) => result.service);

        expect(services).not.toContain('fiscal');
        expect(services).not.toContain('email');
        expect(services).not.toContain('ai');
        expect(new Set(services)).toEqual(new Set(CORE_HEALTH_SERVICES));
        expect(results.every((result) => result.ok)).toBe(true);
    });

    it('expone el fallo sin filtrar detalles internos', async () => {
        const results = await probePlatformHealth({
            ...allOk(),
            stripe: async () => { throw new Error('sk_live_secret must never leave the server'); },
        });
        const publicResults = publicHealthResults(results);

        expect(publicResults.find((result) => result.service === 'stripe')?.ok).toBe(false);
        expect(JSON.stringify(publicResults)).not.toContain('sk_live');
        expect(JSON.stringify(publicResults)).not.toContain('errorCode');
    });

    it('deriva estados sin presumir éxito ante muestras faltantes u obsoletas', () => {
        const snap = (overrides: Partial<Record<HealthService, { ok: boolean; stale: boolean }>> = {}, services: readonly HealthService[] = HEALTH_SERVICES) =>
            services.map((service) => ({ service, ok: true, stale: false, ...overrides[service] }));

        expect(derivePlatformState(snap())).toBe('operational');
        expect(derivePlatformState(snap({}, CORE_HEALTH_SERVICES))).toBe('operational');
        expect(derivePlatformState(snap({}, CORE_HEALTH_SERVICES.slice(1)))).toBe('unknown');
        expect(derivePlatformState(snap({ ai: { ok: false, stale: false } }))).toBe('degraded');
        expect(derivePlatformState(snap({ database: { ok: true, stale: true } }))).toBe('unknown');
        expect(derivePlatformState(HEALTH_SERVICES.map((service) => ({ service, ok: false, stale: false })))).toBe('outage');
    });

    it('rechaza persistir una muestra vacía o sin los servicios base', async () => {
        await expect(persistHealthResults([])).rejects.toThrow('muestra parcial');
        const sinBase = await probePlatformHealth({ ...allOk(), database: null });
        await expect(persistHealthResults(sinBase)).rejects.toThrow('muestra parcial');
    });
});

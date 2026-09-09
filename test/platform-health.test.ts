import { describe, expect, it } from 'vitest';
import {
    derivePlatformState,
    HEALTH_SERVICES,
    persistHealthResults,
    probePlatformHealth,
    publicHealthResults,
} from '../src/lib/platform-health';

describe('platform health', () => {
    it('ejecuta las tres sondas y conserva una sola marca temporal', async () => {
        const called: string[] = [];
        const results = await probePlatformHealth({
            database: async () => { called.push('database'); },
            stripe: async () => { called.push('stripe'); },
            publicLink: async () => { called.push('public_link'); },
            now: () => new Date('2026-08-29T12:00:00.000Z'),
        });

        expect(new Set(called)).toEqual(new Set(HEALTH_SERVICES));
        expect(results.map((result) => result.service)).toEqual(HEALTH_SERVICES);
        expect(results.every((result) => result.ok)).toBe(true);
        expect(results.every((result) => result.checkedAt === '2026-08-29T12:00:00.000Z')).toBe(true);
    });

    it('expone el fallo sin filtrar detalles internos', async () => {
        const results = await probePlatformHealth({
            database: async () => undefined,
            stripe: async () => { throw new Error('sk_live_secret must never leave the server'); },
            publicLink: async () => undefined,
        });
        const publicResults = publicHealthResults(results);

        expect(publicResults.find((result) => result.service === 'stripe')?.ok).toBe(false);
        expect(JSON.stringify(publicResults)).not.toContain('sk_live');
        expect(JSON.stringify(publicResults)).not.toContain('errorCode');
    });

    it('deriva estados sin presumir éxito ante muestras faltantes u obsoletas', () => {
        expect(derivePlatformState([{ ok: true, stale: false }, { ok: true, stale: false }])).toBe('unknown');
        expect(derivePlatformState(HEALTH_SERVICES.map(() => ({ ok: true, stale: false })))).toBe('operational');
        expect(derivePlatformState([{ ok: true, stale: false }, { ok: false, stale: false }, { ok: true, stale: false }])).toBe('degraded');
        expect(derivePlatformState(HEALTH_SERVICES.map(() => ({ ok: false, stale: false })))).toBe('outage');
        expect(derivePlatformState([{ ok: true, stale: true }, { ok: true, stale: false }, { ok: true, stale: false }])).toBe('unknown');
    });

    it('rechaza persistir una muestra parcial', async () => {
        await expect(persistHealthResults([])).rejects.toThrow('muestra parcial');
    });
});

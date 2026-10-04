import { describe, expect, it } from 'vitest';
import { isDatabaseUnavailable, databaseUnavailableResponse } from '../src/lib/database-unavailable';
describe('database unavailable boundary', () => {
    it('only matches Neon transport failures, never SQL or unrelated fetch errors', () => {
        expect(isDatabaseUnavailable({name:'NeonDbError',message:'Error connecting to database: fetch failed',sourceError:new TypeError('fetch failed')})).toBe(true);
        expect(isDatabaseUnavailable({name:'NeonDbError',message:'permission denied'})).toBe(false);
        expect(isDatabaseUnavailable(new TypeError('fetch failed'))).toBe(false);
        expect(isDatabaseUnavailable(null)).toBe(false);
    });
    it('returns an uncached 503 with a manual retry and no sensitive details', async () => {
        const response = databaseUnavailableResponse(false);
        expect(response.status).toBe(503);
        expect(response.headers.get('cache-control')).toBe('no-store');
        expect(response.headers.get('retry-after')).toBe('5');
        const body = await response.text();
        expect(body).toContain('Volver a intentar');
        expect(body).not.toMatch(/Neon|DATABASE_URL|sourceError|http-equiv="refresh"/);
        expect(await databaseUnavailableResponse(true).text()).toContain('Try again');
    });
});

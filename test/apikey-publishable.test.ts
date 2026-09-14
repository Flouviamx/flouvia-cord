import { describe, expect, it, vi } from 'vitest';

vi.mock('../src/lib/db', () => ({ sql: vi.fn(), resolveSandboxOrgId: vi.fn() }));
vi.mock('../src/lib/context', () => ({ reqContext: { run: (_: unknown, fn: () => unknown) => fn() } }));
vi.mock('../src/lib/billing', () => ({ flushUsageReservation: vi.fn(), reserveUsage: vi.fn() }));
vi.mock('../src/lib/ratelimit', () => ({ rateLimit: vi.fn(), tooMany: vi.fn() }));
vi.mock('../src/lib/permissions', () => ({ apiKeyLimit: () => 2 }));

const { publishableKeyAllows } = await import('../src/lib/apikey');

describe('llave publicable (pk_): allowlist exacta de método + ruta', () => {
    it.each([
        ['GET', '/api/v1/productos'],
        ['POST', '/api/v1/cotizaciones'],
        ['post', '/api/v1/cotizaciones/'],
    ])('permite %s %s (Cord Elements)', (method, path) => {
        expect(publishableKeyAllows(method, path)).toBe(true);
    });

    it.each([
        // Rutas bajo el mismo prefijo: con `includes` habrían pasado.
        ['POST', '/api/v1/cotizaciones/abc'],
        ['DELETE', '/api/v1/cotizaciones/abc'],
        ['PATCH', '/api/v1/cotizaciones/abc'],
        ['GET', '/api/v1/productos/abc'],
        ['POST', '/api/v1/productos'],
        // Listar cotizaciones o leer el directorio de clientes nunca.
        ['GET', '/api/v1/cotizaciones'],
        ['GET', '/api/v1/clientes'],
        ['GET', '/api/v1/facturas'],
        ['POST', '/api/v1/facturas/cotizaciones'],
        ['POST', '/api/mcp'],
        ['GET', '/api/v1/events'],
        ['POST', '/api/v1/webhooks'],
        ['DELETE', '/api/v1/webhooks/abc'],
        // Variantes que no son la ruta canónica fallan cerradas.
        ['POST', '/api/v1/cotizaciones-extra'],
        ['POST', '//api/v1/cotizaciones'],
        ['POST', '/api/v1/%63otizaciones'],
    ])('rechaza %s %s', (method, path) => {
        expect(publishableKeyAllows(method, path)).toBe(false);
    });
});

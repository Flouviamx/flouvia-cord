import { describe, expect, it, vi } from 'vitest';

vi.mock('../src/lib/db', () => ({ sql: vi.fn(), resolveSandboxOrgId: vi.fn() }));
vi.mock('../src/lib/context', () => ({ reqContext: { run: (_: unknown, fn: () => unknown) => fn() } }));
vi.mock('../src/lib/billing', () => ({ flushUsageReservation: vi.fn(), reserveUsage: vi.fn() }));
vi.mock('../src/lib/ratelimit', () => ({ rateLimit: vi.fn(), tooMany: vi.fn() }));
vi.mock('../src/lib/permissions', () => ({ apiKeyLimit: () => 2 }));

const { publishableKeyAllows, publishableOriginCheck, isBrowserRequest } = await import('../src/lib/apikey');

describe('llave publicable (pk_): allowlist exacta de método + ruta', () => {
    it.each([
        ['GET', '/api/v1/productos'],
        ['POST', '/api/v1/cotizaciones'],
        ['post', '/api/v1/cotizaciones/'],
        ['GET', '/api/v1/elements/config'],
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
        ['POST', '/api/v1/elements/config'],
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

describe('llave publicable (pk_): origen', () => {
    it('en vivo exige allowlist configurada', () => {
        expect(publishableOriginCheck('live', '', 'https://tienda.com')?.code).toBe('origin_allowlist_required');
        expect(publishableOriginCheck('live', null, 'https://tienda.com')?.code).toBe('origin_allowlist_required');
    });

    it('en prueba acepta cualquier origen sin allowlist', () => {
        expect(publishableOriginCheck('test', '', 'http://localhost:3000')).toBeNull();
    });

    it('siempre exige Origin o Referer', () => {
        expect(publishableOriginCheck('test', '', null)?.code).toBe('missing_origin');
    });

    it('acepta el dominio exacto y sus subdominios, y nada más', () => {
        const allow = 'tienda.com, *.socio.mx';
        expect(publishableOriginCheck('live', allow, 'https://tienda.com')).toBeNull();
        expect(publishableOriginCheck('live', allow, 'https://www.tienda.com')).toBeNull();
        expect(publishableOriginCheck('live', allow, 'https://app.socio.mx')).toBeNull();
        expect(publishableOriginCheck('live', allow, 'https://tienda.com.evil.io')?.code).toBe('unauthorized_origin');
        expect(publishableOriginCheck('live', allow, 'https://eviltienda.com')?.code).toBe('unauthorized_origin');
        expect(publishableOriginCheck('live', allow, 'no-es-url')?.code).toBe('invalid_origin');
    });
});

describe('secret key desde un navegador', () => {
    const req = (headers: Record<string, string>) => new Request('https://cordhq.app/api/v1/clientes', { headers });

    it('detecta un fetch de navegador por Sec-Fetch-Site', () => {
        expect(isBrowserRequest(req({ 'sec-fetch-site': 'cross-site' }))).toBe(true);
        expect(isBrowserRequest(req({ 'sec-fetch-site': 'same-origin' }))).toBe(true);
    });

    it('deja pasar servidores y navegación directa', () => {
        expect(isBrowserRequest(req({}))).toBe(false);
        expect(isBrowserRequest(req({ 'sec-fetch-site': 'none' }))).toBe(false);
    });
});

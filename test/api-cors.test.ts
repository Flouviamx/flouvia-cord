import { describe, it, expect } from 'vitest';
import { apiPreflight, decorateApiResponse, newRequestId } from '../src/lib/api-cors';

const preflight = (path: string, method: string, origin = 'https://tienda.com') =>
    apiPreflight(new Request(`https://cordhq.app${path}`, {
        method: 'OPTIONS',
        headers: { origin, 'access-control-request-method': method },
    }));

describe('preflight de /api/v1', () => {
    it('autoriza solo las rutas que acepta una pk_', () => {
        const ok = preflight('/api/v1/cotizaciones', 'POST');
        expect(ok?.status).toBe(204);
        expect(ok?.headers.get('access-control-allow-origin')).toBe('https://tienda.com');
        expect(ok?.headers.get('access-control-allow-credentials')).toBeNull();
        expect(preflight('/api/v1/productos', 'GET')?.status).toBe(204);
    });

    it('niega las rutas de secret key', () => {
        for (const [path, method] of [['/api/v1/clientes', 'GET'], ['/api/v1/cotizaciones', 'GET'], ['/api/v1/webhooks', 'POST']]) {
            const res = preflight(path, method);
            expect(res?.status, path).toBe(403);
            expect(res?.headers.get('access-control-allow-origin'), path).toBeNull();
        }
    });

    it('niega un Origin opaco', () => {
        expect(preflight('/api/v1/cotizaciones', 'POST', 'null')?.status).toBe(403);
    });

    it('no intercepta otras rutas ni otros métodos', () => {
        expect(apiPreflight(new Request('https://cordhq.app/api/q/abc', { method: 'OPTIONS' }))).toBeNull();
        expect(apiPreflight(new Request('https://cordhq.app/api/v1/productos'))).toBeNull();
    });
});

describe('decorateApiResponse', () => {
    const json = (body: unknown, status: number) =>
        new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

    it('agrega request id y doc_url a los errores', async () => {
        const req = new Request('https://cordhq.app/api/v1/clientes');
        const res = await decorateApiResponse(req, json({ error: 'x', code: 'invalid_key' }, 401), 'req_abc');
        expect(res.status).toBe(401);
        expect(res.headers.get('cord-request-id')).toBe('req_abc');
        const body = await res.json();
        expect(body).toMatchObject({ error: 'x', code: 'invalid_key', request_id: 'req_abc' });
        expect(body.doc_url).toMatch(/errores#invalid_key$/);
    });

    it('no toca el cuerpo de un éxito', async () => {
        const req = new Request('https://cordhq.app/api/v1/productos');
        const res = await decorateApiResponse(req, json({ data: [1] }, 200), 'req_1');
        expect(await res.json()).toEqual({ data: [1] });
    });

    it('expone CORS solo a rutas de pk_ y solo con Origin', async () => {
        const conOrigin = (path: string, method = 'GET') => new Request(`https://cordhq.app${path}`, { method, headers: { origin: 'https://tienda.com' } });
        const pk = await decorateApiResponse(conOrigin('/api/v1/productos'), json({ data: [] }, 200), 'req_1');
        expect(pk.headers.get('access-control-allow-origin')).toBe('https://tienda.com');
        expect(pk.headers.get('access-control-expose-headers')).toContain('Cord-Request-Id');
        const sk = await decorateApiResponse(conOrigin('/api/v1/clientes'), json({ data: [] }, 200), 'req_2');
        expect(sk.headers.get('access-control-allow-origin')).toBeNull();
    });

    it('genera ids distintos con prefijo', () => {
        const a = newRequestId();
        expect(a).toMatch(/^req_[0-9a-f]{24}$/);
        expect(a).not.toBe(newRequestId());
    });
});

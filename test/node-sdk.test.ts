import { describe, it, expect, vi } from 'vitest';
import { Cord, CordError, constructEvent, signPayload, CordWebhookSignatureError, createElementsProxy } from '../packages/node/src/index';

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });

describe('Cord (cliente de servidor)', () => {
    it('exige una secret key', () => {
        expect(() => new Cord('pk_live_x')).toThrow(/secret key/);
        expect(() => new Cord('')).toThrow();
        expect(new Cord('sk_test_x').mode).toBe('test');
        expect(new Cord('rk_test_x').mode).toBe('test');
        expect(new Cord('rk_live_x').mode).toBe('live');
    });

    it('manda la misma Idempotency-Key en cada reintento de una mutación', async () => {
        const seen: string[] = [];
        const fetch = vi.fn(async (_u: URL, init: RequestInit) => {
            seen.push((init.headers as Record<string, string>)['Idempotency-Key']);
            return seen.length === 1 ? json({ error: 'x' }, 502, { 'retry-after': '0' }) : json({ data: { id: 'q1', folio: 'COT-1' } });
        });
        const cord = new Cord('sk_test_x', { fetch: fetch as any, maxRetries: 1 });
        await cord.quotes.create({ items: [{ descripcion: 'X', cantidad: 1, precio_unitario: 1 }] });
        expect(seen).toHaveLength(2);
        expect(seen[0]).toBe(seen[1]);
    });

    it('no manda Idempotency-Key en lecturas y expone request id en errores', async () => {
        const fetch = vi.fn(async () => json({ error: 'No', code: 'not_found' }, 404, { 'cord-request-id': 'req_9' }));
        const cord = new Cord('sk_test_x', { fetch: fetch as any });
        const err = await cord.quotes.retrieve('abc').catch((e) => e);
        expect(err).toBeInstanceOf(CordError);
        expect(err).toMatchObject({ status: 404, code: 'not_found', requestId: 'req_9' });
        expect((fetch.mock.calls[0] as any)[1].headers['Idempotency-Key']).toBeUndefined();
    });

    it('autopagina siempre por cursor, también en las listas que aceptan offset', async () => {
        const fetch = vi.fn(async (u: URL) => {
            if (u.pathname.endsWith('/clientes')) {
                expect(u.searchParams.get('offset')).toBeNull();
                const cursor = u.searchParams.get('cursor');
                return json({ data: cursor ? [{ id: 3 }] : [{ id: 1 }, { id: 2 }], meta: { limit: 200, offset: cursor ? null : 0, total: 3, next_cursor: cursor ? null : 'k2' } });
            }
            const cursor = u.searchParams.get('cursor');
            return json({ data: cursor ? [{ id: 'b' }] : [{ id: 'a' }], meta: { next_cursor: cursor ? null : 'c1' } });
        });
        const cord = new Cord('sk_test_x', { fetch: fetch as any });
        const clientes = [];
        for await (const c of cord.clients.listAll()) clientes.push(c);
        expect(clientes.map((c: any) => c.id)).toEqual([1, 2, 3]);
        const facturas = [];
        for await (const f of cord.invoices.listAll()) facturas.push(f);
        expect(facturas.map((f: any) => f.id)).toEqual(['a', 'b']);
    });
});

describe('testHelpers', () => {
    it('falla antes de la red con una llave en vivo', () => {
        const fetch = vi.fn();
        const cord = new Cord('sk_live_x', { fetch: fetch as any });
        expect(() => cord.testHelpers.fiscal.setNextOutcome('pac_caido')).toThrow(/sk_test_/);
        expect(fetch).not.toHaveBeenCalled();
    });

    it('con llave de prueba llama al simulador', async () => {
        const fetch = vi.fn(async () => json({ data: { object: 'test_helper' } }));
        const cord = new Cord('sk_test_x', { fetch: fetch as any });
        await cord.testHelpers.webhooks.trigger('invoice.paid');
        const [url, init] = fetch.mock.calls[0] as unknown as [URL, RequestInit];
        expect(String(url)).toBe('https://cordhq.app/api/v1/test_helpers/webhooks');
        expect(JSON.parse(String(init.body))).toEqual({ evento: 'invoice.paid' });
    });
});

describe('constructEvent', () => {
    const secret = 'whsec_test';
    const body = JSON.stringify({ id: 'evt_1', event: 'quote.approved', created_at: '2026-10-04T00:00:00Z', data: { id: 'q1' } });
    const now = 1_790_000_000;

    it('acepta una firma V1 válida', async () => {
        const headers = { 'X-Cord-Signature-V1': await signPayload(body, secret, now) };
        const evt = await constructEvent(body, headers, secret, { now: () => now });
        expect(evt.event).toBe('quote.approved');
    });

    it('acepta durante una rotación si una de las dos firmas cuadra', async () => {
        const good = (await signPayload(body, secret, now)).split(',')[1];
        const headers = new Headers({ 'x-cord-signature-v1': `t=${now},v1=${'0'.repeat(64)},${good}` });
        await expect(constructEvent(body, headers, secret, { now: () => now })).resolves.toBeTruthy();
    });

    it.each([
        ['timestamp_out_of_tolerance', async () => ({ 'x-cord-signature-v1': await signPayload(body, secret, now - 301) })],
        ['signature_mismatch', async () => ({ 'x-cord-signature-v1': await signPayload(body, 'otro', now) })],
        ['invalid_signature_header', async () => ({ 'x-cord-signature-v1': 'basura' })],
        ['missing_signature', async () => ({})],
        ['legacy_signature_rejected', async () => ({ 'x-cord-signature': 'sha256=' + 'a'.repeat(64) })],
    ])('rechaza %s', async (code, mk) => {
        const err = await constructEvent(body, await mk(), secret, { now: () => now }).catch((e) => e);
        expect(err).toBeInstanceOf(CordWebhookSignatureError);
        expect(err.code).toBe(code);
    });

    it('rechaza un cuerpo alterado después de firmar', async () => {
        const headers = { 'x-cord-signature-v1': await signPayload(body, secret, now) };
        const err = await constructEvent(body.replace('q1', 'q2'), headers, secret, { now: () => now }).catch((e) => e);
        expect(err.code).toBe('signature_mismatch');
    });
});

describe('createElementsProxy', () => {
    const origin = 'https://tienda.com';
    const make = (extra: Parameters<typeof createElementsProxy>[0] extends infer O ? Partial<O> : never = {}) => {
        const fetch = vi.fn(async () => json({ data: { id: 'q1' } }));
        return { fetch, proxy: createElementsProxy({ secretKey: 'sk_test_x', fetch: fetch as any, ...extra }) };
    };
    const req = (path: string, init: RequestInit & { headers?: Record<string, string> } = {}) =>
        new Request(`${origin}/api/cord${path}`, { ...init, headers: { origin, 'sec-fetch-site': 'same-origin', ...(init.headers ?? {}) } });

    it('niega otros orígenes', async () => {
        const { proxy, fetch } = make();
        const res = await proxy(new Request(`${origin}/api/cord/productos`, { headers: { origin: 'https://evil.io', 'sec-fetch-site': 'cross-site' } }));
        expect(res.status).toBe(403);
        expect(fetch).not.toHaveBeenCalled();
    });

    it('niega rutas fuera de Elements', async () => {
        const { proxy } = make();
        expect((await proxy(req('/facturas'))).status).toBe(404);
        expect((await proxy(req('/cotizaciones'))).status).toBe(404);
    });

    it('no expone el CRM sin autorización', async () => {
        const { proxy, fetch } = make();
        expect((await proxy(req('/clientes'))).status).toBe(403);
        expect(fetch).not.toHaveBeenCalled();
        const ok = make({ authorizeClients: () => true });
        expect((await ok.proxy(req('/clientes'))).status).toBe(200);
    });

    it('sanea la cotización como una pk_ y reenvía la Idempotency-Key', async () => {
        const { proxy, fetch } = make();
        const res = await proxy(req('/cotizaciones', {
            method: 'POST',
            headers: { 'content-type': 'application/json', 'idempotency-key': 'abc12345-key' },
            body: JSON.stringify({ send: true, cliente_id: 'x', items: [{ descripcion: 'X', cantidad: 1, precio_unitario: 5, costo_unitario: 1, precio_negociado: 1 }] }),
        }));
        expect(res.status).toBe(200);
        const [, init] = fetch.mock.calls[0] as unknown as [URL, RequestInit];
        const sent = JSON.parse(String(init.body));
        expect(sent.send).toBe(false);
        expect(sent.cliente_id).toBeUndefined();
        expect(sent.items[0]).not.toHaveProperty('costo_unitario');
        expect((init.headers as Record<string, string>)['Idempotency-Key']).toBe('abc12345-key');
    });

    it('reenvía la IA como stream con la sk_ y sin exponerla', async () => {
        const fetch = vi.fn(async () => new Response('event: done\ndata: {"count":0}\n\n', { headers: { 'Content-Type': 'text/event-stream', 'cord-request-id': 'req_ai' } }));
        const proxy = createElementsProxy({ secretKey: 'sk_test_secreta', fetch: fetch as any });
        const form = new FormData();
        form.set('texto', 'pedido');
        const res = await proxy(new Request(`${origin}/api/cord/elements/ai-draft`, { method: 'POST', body: form, headers: { origin, 'sec-fetch-site': 'same-origin' } }));
        expect(res.headers.get('content-type')).toContain('text/event-stream');
        expect(res.headers.get('cord-request-id')).toBe('req_ai');
        expect(await res.text()).toContain('event: done');
        const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
        expect(url).toBe('https://cordhq.app/api/v1/elements/ai-draft');
        expect((init.headers as Record<string, string>).Authorization).toBe('Bearer sk_test_secreta');
    });
});


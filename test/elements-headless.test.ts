import { describe, it, expect, vi } from 'vitest';
import { createCordClient } from '../packages/elements/src/headless/client';
import { createQuoteBuilder } from '../packages/elements/src/headless/quote-builder';
import { createFiscalForm } from '../packages/elements/src/headless/fiscal-form';
import { reduceQuoteView, INITIAL_QUOTE_VIEW } from '../packages/elements/src/headless/quote-view';
import type { CordElementsConfig } from '../packages/elements/src/contract/elements-config';

const CONFIG: CordElementsConfig = {
    object: 'elements_config',
    org: { nombre: 'Taller', pais: 'MX', locale: 'es', moneda: 'MXN', color_primario: null, logo_url: null },
    monedas: ['MXN', 'USD'],
    impuestos: {
        etiqueta: 'IVA',
        opciones: [{ id: null, label: 'Exento', rate: 0, kind: 'exento' }, { id: 'a', label: 'IVA 16%', rate: 0.16, kind: 'consumo' }],
        tasa_default: 0.16,
        retenciones: [],
        precios_incluyen_impuesto: false,
    },
    terminos: ['contado', 'net30', 'net60'],
    terminos_default: 'contado',
    vigencia_dias_default: 30,
    fiscal: { pais: 'MX', reglas_propias: true },
};

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });

describe('createCordClient', () => {
    it('rechaza una secret key y exige exactamente un modo', () => {
        expect(() => createCordClient({ publishableKey: 'sk_live_x' })).toThrow(/pk_/);
        expect(() => createCordClient({})).toThrow();
        expect(() => createCordClient({ publishableKey: 'pk_test_x', proxyUrl: '/api/cord' })).toThrow();
    });

    it('reintenta un POST con la MISMA clave de idempotencia', async () => {
        const keys: string[] = [];
        const fetch = vi.fn(async (_url: string, init: RequestInit) => {
            keys.push((init.headers as Record<string, string>)['Idempotency-Key']);
            return keys.length === 1 ? json({ error: 'x' }, 503, { 'retry-after': '0' }) : json({ data: { id: 'q1', folio: 'COT-1' } });
        });
        const client = createCordClient({ publishableKey: 'pk_test_x', fetch: fetch as any, maxRetries: 1 });
        const r = await client.createQuote({ items: [] });
        expect(r.folio).toBe('COT-1');
        expect(keys).toHaveLength(2);
        expect(keys[0]).toBe(keys[1]);
    });

    it('no reintenta un error de validación y conserva request_id', async () => {
        const fetch = vi.fn(async () => json({ error: 'malo', code: 'invalid_request', request_id: 'req_1' }, 400, { 'cord-request-id': 'req_1' }));
        const client = createCordClient({ publishableKey: 'pk_test_x', fetch: fetch as any });
        await expect(client.createQuote({ items: [] })).rejects.toMatchObject({ code: 'invalid_request', requestId: 'req_1' });
        expect(fetch).toHaveBeenCalledTimes(1);
    });

    it('cachea la configuración con ETag', async () => {
        const fetch = vi.fn()
            .mockResolvedValueOnce(json({ data: CONFIG }, 200, { etag: '"v1"' }))
            .mockResolvedValueOnce(new Response(null, { status: 304, headers: { etag: '"v1"' } }));
        const client = createCordClient({ publishableKey: 'pk_test_x', fetch: fetch as any });
        await client.config();
        expect((await client.config()).org.moneda).toBe('MXN');
        expect(fetch.mock.calls[1][1].headers['If-None-Match']).toBe('"v1"');
    });

    it('en modo proxy no manda llave y habla con tu backend', async () => {
        const fetch = vi.fn(async () => json({ data: [] }));
        await createCordClient({ proxyUrl: '/api/cord/', fetch: fetch as any }).products();
        const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
        expect(url).toBe('/api/cord/productos');
        expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
    });
});

function fakeClient() {
    const createQuote = vi.fn(async () => ({ id: 'q1', folio: 'COT-0001' }));
    return {
        createQuote,
        client: { mode: 'publishable' as const, config: async () => CONFIG, products: async () => [{ id: 'p1', nombre: 'Tornillo', precio: 100 }], createQuote },
    };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('createQuoteBuilder', () => {
    it('dibuja desde la configuración y calcula por línea', async () => {
        const { client } = fakeClient();
        const b = createQuoteBuilder({ client });
        await flush();
        expect(b.get().status).toBe('ready');
        expect(b.get().moneda).toBe('MXN');
        const [first] = b.get().items;
        b.updateItem(first.key, { descripcion: 'Servicio', cantidad: 1, precio_unitario: 100, tax_rate: 0 });
        b.addProduct(b.searchProducts('torn')[0], 2);
        expect(b.get().totals.subtotal).toBe(300);
        expect(b.get().totals.impuestos).toBe(32);
        expect(b.get().totals.total).toBe(332);
    });

    it('no acepta una tasa que la organización no ofrece ni una divisa fuera del set', async () => {
        const { client } = fakeClient();
        const b = createQuoteBuilder({ client });
        await flush();
        b.setCliente({ empresa: 'Acme' });
        b.updateItem(b.get().items[0].key, { descripcion: 'X', precio_unitario: 10, tax_rate: 0.07 });
        b.setMoneda('JPY');
        const codes = b.validate().map((i) => i.code);
        expect(codes).toContain('invalid_tax_rate');
        expect(codes).toContain('unsupported_currency');
    });

    it('un doble clic crea una sola cotización, y un reintento reusa la clave', async () => {
        const { client, createQuote } = fakeClient();
        const b = createQuoteBuilder({ client });
        await flush();
        b.setCliente({ empresa: 'Acme' });
        b.updateItem(b.get().items[0].key, { descripcion: 'X', precio_unitario: 10 });
        createQuote.mockRejectedValueOnce(new Error('red'));
        await Promise.all([b.submit(), b.submit()]);
        expect(createQuote).toHaveBeenCalledTimes(1);
        expect(b.get().status).toBe('error');
        await b.submit();
        const keys = createQuote.mock.calls.map((c: any[]) => c[1].idempotencyKey);
        expect(keys[0]).toBe(keys[1]);
        expect(b.get().result?.folio).toBe('COT-0001');
    });

    it('valida los datos fiscales antes de enviar', async () => {
        const { client, createQuote } = fakeClient();
        const b = createQuoteBuilder({ client });
        await flush();
        b.updateItem(b.get().items[0].key, { descripcion: 'X', precio_unitario: 10 });
        b.setFiscal({ country: 'MX', tax_id: 'EKU9003173C8', legal_name: 'Kemper', regimen_fiscal: '601', uso_cfdi: 'G03', cp_fiscal: '86991' });
        expect(await b.submit()).toBeNull();
        expect(createQuote).not.toHaveBeenCalled();
        expect(b.get().issues).toContainEqual({ field: 'fiscal.tax_id', code: 'invalid_tax_id' });
    });
});

describe('createFiscalForm', () => {
    it('filtra regímenes por tipo de RFC y solo muestra errores tocados', () => {
        const f = createFiscalForm({ country: 'MX' });
        f.set('tax_id', 'GODE561231GR8');
        expect(f.get().regimenes.every((r) => r.personas.includes('fisica'))).toBe(true);
        expect(f.get().visibleErrors).toEqual([]);
        expect(f.submit()).toBeNull();
        expect(f.get().visibleErrors.length).toBeGreaterThan(0);
    });

    it('fija 616 y S01 para público en general', () => {
        const f = createFiscalForm({ country: 'MX' });
        f.set('tax_id', 'XAXX010101000');
        expect(f.get().values).toMatchObject({ regimen_fiscal: '616', uso_cfdi: 'S01' });
    });
});

describe('reduceQuoteView', () => {
    it('sigue el ciclo de la cotización', () => {
        let s = reduceQuoteView(INITIAL_QUOTE_VIEW, { type: 'cord:ready', detail: { status: 'sent', total: 100, moneda: 'MXN', folio: 'COT-1' } });
        expect(s).toMatchObject({ ready: true, status: 'sent', total: 100 });
        s = reduceQuoteView(s, { type: 'cord:approved', detail: { signed_by: 'Ana', hash: 'h' } });
        expect(s).toMatchObject({ approved: true, signedBy: 'Ana', paid: false });
        s = reduceQuoteView(s, { type: 'cord:status_changed', detail: { status: 'paid' } });
        expect(s).toMatchObject({ paid: true, approved: true });
    });
});

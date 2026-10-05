// Proxy de Cord Elements para el modo `proxyUrl`: tu backend llama a Cord con la
// sk_ y el navegador nunca la ve. Al ser un endpoint público de TU sitio, se
// trata como hostil: solo cuatro rutas, solo desde tu propio origen, el mismo
// saneamiento que una pk_ y el CRM solo con tu autorización.
//
//   // app/api/cord/[...path]/route.ts (Next.js)
//   const proxy = createElementsProxy({ secretKey: process.env.CORD_SECRET_KEY! });
//   export const GET = proxy;
//   export const POST = proxy;
//
//   <CordProvider proxyUrl="/api/cord">
import { HttpClient, CordError } from './http.js';

export interface ElementsProxyOptions {
    secretKey: string;
    baseUrl?: string;
    /** Orígenes que pueden usar el proxy. Default: solo el origen de la propia petición. */
    allowedOrigins?: string[];
    /**
     * Autoriza leer clientes del CRM (GET /clientes). Sin esta función, se niega
     * siempre: tu proxy no puede exponer tu CRM a cualquier visitante.
     */
    authorizeClients?: (request: Request) => boolean | Promise<boolean>;
    /**
     * Autoriza crear cotizaciones con datos de vendedor (envío por correo,
     * cliente_id, costo y precio negociado). Default: nunca, como una pk_.
     */
    authorizeSellerFields?: (request: Request) => boolean | Promise<boolean>;
    fetch?: typeof fetch;
}

const MAX_BODY = 1_000_000;
const AI_MAX_BODY = 4 * 1024 * 1024 + 64 * 1024;
const IDEMPOTENCY_RE = /^[A-Za-z0-9_-]{8,255}$/;

const json = (status: number, body: unknown, extra: Record<string, string> = {}) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...extra } });

function routeOf(pathname: string): string | null {
    const p = pathname.replace(/\/+$/, '');
    for (const r of ['/elements/config', '/elements/ai-draft', '/productos', '/cotizaciones', '/clientes']) {
        if (p.endsWith(r)) return r;
    }
    return null;
}

function sanitizeQuote(body: any, seller: boolean): any {
    if (!body || typeof body !== 'object') return body;
    const items = Array.isArray(body.items)
        ? body.items.map((it: any) => (it && typeof it === 'object'
            ? {
                producto_id: it.producto_id, descripcion: it.descripcion, cantidad: it.cantidad,
                precio_unitario: it.precio_unitario, tax_rate: it.tax_rate,
                ...(seller ? { precio_negociado: it.precio_negociado, costo_unitario: it.costo_unitario } : {}),
            }
            : it))
        : body.items;
    return {
        cliente: body.cliente,
        terminos: body.terminos,
        vigencia_dias: body.vigencia_dias,
        notas: body.notas,
        base_currency: body.base_currency,
        iva_incluido: body.iva_incluido,
        items,
        ...(seller ? { cliente_id: body.cliente_id, send: !!body.send, fiscal_currency: body.fiscal_currency } : { send: false }),
    };
}

export function createElementsProxy(opts: ElementsProxyOptions): (request: Request) => Promise<Response> {
    const http = new HttpClient(opts.secretKey, { baseUrl: opts.baseUrl, fetch: opts.fetch, maxRetries: 0 });
    const apiBase = `${(opts.baseUrl ?? 'https://cordhq.app').replace(/\/+$/, '')}/api/v1`;
    const doFetch = opts.fetch ?? ((...a: Parameters<typeof fetch>) => fetch(...a));

    // La IA responde en streaming: se reenvía el multipart y se devuelve el
    // stream tal cual, sin guardarlo. Tope de 4 MB por archivo, como Cord.
    async function forwardAiDraft(request: Request): Promise<Response> {
        if (Number(request.headers.get('content-length') || 0) > AI_MAX_BODY) {
            return json(413, { error: 'El archivo es demasiado pesado (máx 4 MB).', code: 'payload_too_large' });
        }
        let form: FormData;
        try { form = await request.formData(); } catch { return json(400, { error: 'No se pudo leer el formulario.', code: 'invalid_request' }); }
        const out = new FormData();
        const texto = form.get('texto');
        const archivo = form.get('archivo');
        if (typeof texto === 'string') out.set('texto', texto.slice(0, 4000));
        if (archivo instanceof Blob) {
            if (archivo.size > AI_MAX_BODY) return json(413, { error: 'El archivo es demasiado pesado (máx 4 MB).', code: 'payload_too_large' });
            out.set('archivo', archivo);
        }
        const res = await doFetch(`${apiBase}/elements/ai-draft`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${opts.secretKey}`, Accept: 'text/event-stream' },
            body: out,
            signal: request.signal,
        });
        const headers: Record<string, string> = { 'Content-Type': res.headers.get('content-type') || 'application/json', 'Cache-Control': 'no-store, no-transform' };
        const requestId = res.headers.get('cord-request-id');
        if (requestId) headers['Cord-Request-Id'] = requestId;
        const retryAfter = res.headers.get('retry-after');
        if (retryAfter) headers['Retry-After'] = retryAfter;
        return new Response(res.body, { status: res.status, headers });
    }

    return async function handle(request: Request): Promise<Response> {
        const url = new URL(request.url);
        const route = routeOf(url.pathname);
        const method = request.method.toUpperCase();
        const allowed = ((route === '/cotizaciones' || route === '/elements/ai-draft') && method === 'POST')
            || ((route === '/elements/config' || route === '/productos' || route === '/clientes') && method === 'GET');
        if (!route || !allowed) return json(404, { error: 'Ruta no disponible en el proxy de Cord Elements.', code: 'not_found' });

        // Solo tu propio sitio: un proxy con tu sk_ abierto a cualquier origen
        // es una sk_ publicada.
        const origin = request.headers.get('origin');
        const site = request.headers.get('sec-fetch-site');
        const origins = opts.allowedOrigins ?? [url.origin];
        if (site && site !== 'same-origin' && site !== 'none' && !(origin && origins.includes(origin))) {
            return json(403, { error: 'Origen no permitido.', code: 'unauthorized_origin' });
        }
        if (origin && !origins.includes(origin)) return json(403, { error: 'Origen no permitido.', code: 'unauthorized_origin' });

        try {
            if (route === '/clientes') {
                if (!opts.authorizeClients || !(await opts.authorizeClients(request))) {
                    return json(403, { error: 'Leer clientes requiere autorización de tu servidor.', code: 'clients_require_proxy' });
                }
                const r = await http.request<unknown>('GET', '/clientes', { query: { limit: 200 } });
                return json(200, { data: r.data }, r.requestId ? { 'Cord-Request-Id': r.requestId } : {});
            }
            if (method === 'GET') {
                const r = await http.request<unknown>('GET', route);
                return json(200, { data: r.data }, r.requestId ? { 'Cord-Request-Id': r.requestId } : {});
            }

            if (route === '/elements/ai-draft') return forwardAiDraft(request);

            const length = Number(request.headers.get('content-length') || 0);
            if (length > MAX_BODY) return json(413, { error: 'El cuerpo es demasiado grande.', code: 'payload_too_large' });
            const text = await request.text();
            if (text.length > MAX_BODY) return json(413, { error: 'El cuerpo es demasiado grande.', code: 'payload_too_large' });
            let body: unknown;
            try { body = JSON.parse(text); } catch { return json(400, { error: 'JSON inválido.', code: 'invalid_json' }); }
            const seller = !!opts.authorizeSellerFields && (await opts.authorizeSellerFields(request));
            const key = request.headers.get('idempotency-key');
            if (key && !IDEMPOTENCY_RE.test(key)) return json(400, { error: 'Idempotency-Key inválida.', code: 'invalid_idempotency_key' });
            const r = await http.request<unknown>('POST', '/cotizaciones', { body: sanitizeQuote(body, seller), idempotencyKey: key ?? undefined });
            return json(200, { data: r.data }, r.requestId ? { 'Cord-Request-Id': r.requestId } : {});
        } catch (err) {
            if (err instanceof CordError) {
                const extra: Record<string, string> = err.requestId ? { 'Cord-Request-Id': err.requestId } : {};
                return json(err.status || 502, { error: err.message, code: err.code, request_id: err.requestId, doc_url: err.docUrl }, extra);
            }
            return json(502, { error: 'No se pudo contactar a Cord.', code: 'provider_error' });
        }
    };
}

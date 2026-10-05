// Cliente HTTP del navegador para Cord Elements. Dos modos y nunca los dos:
//   · publishableKey: directo a Cord con una pk_ (solo las rutas que una pk_ puede usar);
//   · proxyUrl: tu backend, que llama a Cord con la sk_ (ver createElementsProxy en
//     @flouviahq/node). Las rutas se piden en la misma forma que /api/v1.
import { CordError } from '../api.js';
import { resolveApiBase } from '../config.js';
import type { CordElementsConfig } from '../contract/elements-config.js';
import type { CordProduct, CreateQuoteInput, CreateQuoteResponse } from '../types.js';

export interface CordClientOptions {
    publishableKey?: string;
    proxyUrl?: string;
    /** Origen de Cord (self-host/staging). Default https://cordhq.app. */
    baseUrl?: string;
    /** Corta cada intento después de este tiempo. Default 15 s. */
    timeoutMs?: number;
    /** Reintentos ante red caída, 429 o 5xx. Default 2. */
    maxRetries?: number;
    /** Registra cada petición con su request id en la consola. */
    debug?: boolean;
    fetch?: typeof fetch;
}

export interface AiDraftItem {
    index: number;
    /** Producto del catálogo; null si es una línea libre. */
    id: string | null;
    nombre: string;
    unidad: string;
    /** Precio de lista del catálogo (nunca el que inventa el modelo). */
    lista: number;
    /** Precio que mencionó el cliente, solo si es menor al de lista. */
    negociado: number | null;
    cantidad: number;
}

export interface AiDraftInput {
    texto?: string;
    /** Foto (JPG/PNG) o PDF de la orden de compra, máx 4 MB. */
    archivo?: Blob;
}

export interface CordClient {
    readonly mode: 'publishable' | 'proxy';
    /** Emite cada línea en cuanto la IA la termina de leer. */
    aiDraft(input: AiDraftInput, onItem: (item: AiDraftItem) => void, opts?: { signal?: AbortSignal }): Promise<{ count: number }>;
    config(opts?: { force?: boolean }): Promise<CordElementsConfig>;
    products(): Promise<CordProduct[]>;
    createQuote(input: CreateQuoteInput, opts?: { idempotencyKey?: string }): Promise<CreateQuoteResponse>;
}

export function newIdempotencyKey(): string {
    const c = (globalThis as any).crypto;
    if (c?.randomUUID) return c.randomUUID();
    const bytes = new Uint8Array(16);
    c.getRandomValues(bytes);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

const unwrap = <T>(body: any): T => (body && typeof body === 'object' && 'data' in body ? body.data : body) as T;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const RETRYABLE = new Set([408, 425, 429, 500, 502, 503, 504]);

export function createCordClient(opts: CordClientOptions): CordClient {
    const { publishableKey, proxyUrl } = opts;
    if (!!publishableKey === !!proxyUrl) {
        throw new Error('[Cord] createCordClient necesita publishableKey O proxyUrl, uno de los dos.');
    }
    if (publishableKey && !publishableKey.startsWith('pk_')) {
        throw new Error('[Cord] La llave del navegador debe ser publicable (pk_). Una sk_ nunca va en el navegador: usa proxyUrl.');
    }
    const base = proxyUrl ? proxyUrl.replace(/\/+$/, '') : resolveApiBase(opts.baseUrl);
    const timeoutMs = opts.timeoutMs ?? 15000;
    const maxRetries = Math.max(0, Math.min(5, opts.maxRetries ?? 2));
    const doFetch = opts.fetch ?? ((...a: Parameters<typeof fetch>) => fetch(...a));
    let cachedConfig: { etag: string | null; value: CordElementsConfig } | null = null;

    async function request<T>(method: 'GET' | 'POST', path: string, body?: unknown, extra: Record<string, string> = {}): Promise<{ status: number; data: T | null; etag: string | null }> {
        const headers: Record<string, string> = { Accept: 'application/json', ...extra };
        if (publishableKey) headers.Authorization = `Bearer ${publishableKey}`;
        if (body !== undefined) headers['Content-Type'] = 'application/json';

        let attempt = 0;
        for (;;) {
            const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
            const timer = ctrl ? setTimeout(() => ctrl.abort(), timeoutMs) : null;
            let res: Response;
            try {
                res = await doFetch(base + path, {
                    method,
                    headers,
                    body: body === undefined ? undefined : JSON.stringify(body),
                    signal: ctrl?.signal,
                    credentials: proxyUrl ? 'same-origin' : 'omit',
                });
            } catch (err: any) {
                if (timer) clearTimeout(timer);
                if (attempt < maxRetries) { await sleep(backoff(attempt++)); continue; }
                throw new CordError(0, { error: err?.name === 'AbortError' ? 'La petición tardó demasiado.' : 'Error de red' }, 'network_error');
            }
            if (timer) clearTimeout(timer);
            const requestId = res.headers.get('cord-request-id');
            if (opts.debug) console.info(`[Cord] ${method} ${path} → ${res.status}${requestId ? ` (${requestId})` : ''}`);
            if (res.status === 304) return { status: 304, data: null, etag: res.headers.get('etag') };

            if (!res.ok && RETRYABLE.has(res.status) && attempt < maxRetries) {
                const retryAfter = Number(res.headers.get('retry-after'));
                await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter, 30) * 1000 : backoff(attempt));
                attempt++;
                continue;
            }
            let payload: any = null;
            try { payload = await res.json(); } catch { payload = { error: res.statusText }; }
            if (!res.ok) throw new CordError(res.status, payload, undefined, requestId);
            return { status: res.status, data: unwrap<T>(payload), etag: res.headers.get('etag') };
        }
    }

    async function aiDraft(input: AiDraftInput, onItem: (item: AiDraftItem) => void, { signal }: { signal?: AbortSignal } = {}) {
        const form = new FormData();
        if (input.texto) form.set('texto', input.texto.slice(0, 4000));
        if (input.archivo) form.set('archivo', input.archivo);
        const headers: Record<string, string> = { Accept: 'text/event-stream' };
        if (publishableKey) headers.Authorization = `Bearer ${publishableKey}`;
        let res: Response;
        try {
            res = await doFetch(`${base}/elements/ai-draft`, { method: 'POST', headers, body: form, signal, credentials: proxyUrl ? 'same-origin' : 'omit' });
        } catch {
            throw new CordError(0, { error: 'Error de red' }, 'network_error');
        }
        const requestId = res.headers.get('cord-request-id');
        if (!res.ok || !res.body) {
            const payload = await res.json().catch(() => ({ error: res.statusText }));
            throw new CordError(res.status, payload, undefined, requestId);
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let count = 0;
        for (;;) {
            const { value, done } = await reader.read();
            if (value) buffer += decoder.decode(value, { stream: true });
            let sep: number;
            while ((sep = buffer.indexOf('\n\n')) >= 0) {
                const chunk = buffer.slice(0, sep);
                buffer = buffer.slice(sep + 2);
                let event = 'message';
                let data = '';
                for (const line of chunk.split('\n')) {
                    if (line.startsWith('event:')) event = line.slice(6).trim();
                    else if (line.startsWith('data:')) data += line.slice(5).trim();
                }
                let parsed: any = null;
                try { parsed = data ? JSON.parse(data) : null; } catch { continue; }
                if (event === 'item' && parsed) { count++; onItem(parsed as AiDraftItem); }
                else if (event === 'error') throw new CordError(422, parsed ?? {}, undefined, requestId);
                else if (event === 'done') return { count: Number(parsed?.count) || count };
            }
            if (done) return { count };
        }
    }

    return {
        mode: proxyUrl ? 'proxy' : 'publishable',
        aiDraft,
        async config({ force = false } = {}) {
            const extra: Record<string, string> = {};
            if (cachedConfig?.etag && !force) extra['If-None-Match'] = cachedConfig.etag;
            const r = await request<CordElementsConfig>('GET', '/elements/config', undefined, extra);
            if (r.status === 304 && cachedConfig) return cachedConfig.value;
            cachedConfig = { etag: r.etag, value: r.data as CordElementsConfig };
            return cachedConfig.value;
        },
        async products() {
            return ((await request<CordProduct[]>('GET', '/productos')).data ?? []) as CordProduct[];
        },
        async createQuote(input, { idempotencyKey } = {}) {
            const r = await request<CreateQuoteResponse>('POST', '/cotizaciones', input, { 'Idempotency-Key': idempotencyKey ?? newIdempotencyKey() });
            return r.data as CreateQuoteResponse;
        },
    };
}

function backoff(attempt: number): number {
    const base = Math.min(8000, 400 * 2 ** attempt);
    return base / 2 + Math.random() * (base / 2);
}

import { CORD_API_VERSION } from '../../elements/src/contract/api-version.js';
// Transporte HTTP del SDK de servidor: autenticación, idempotencia automática,
// reintentos con backoff y Retry-After, timeouts y errores tipados con request id.

export class CordError extends Error {
    readonly status: number;
    readonly code: string;
    readonly requestId: string | null;
    readonly docUrl: string | null;
    readonly raw: unknown;

    constructor(status: number, body: any, requestId: string | null) {
        super(typeof body?.error === 'string' ? body.error : `Cord API error (${status})`);
        this.name = 'CordError';
        this.status = status;
        this.code = typeof body?.code === 'string' ? body.code : status === 0 ? 'network_error' : 'unknown';
        this.requestId = requestId ?? (typeof body?.request_id === 'string' ? body.request_id : null);
        this.docUrl = typeof body?.doc_url === 'string' ? body.doc_url : null;
        this.raw = body;
    }
}

export interface CordOptions {
    /** Origen de Cord. Default https://cordhq.app. */
    baseUrl?: string;
    /** Corta cada intento. Default 30 s. */
    timeoutMs?: number;
    /** Reintentos ante red caída, 409 de idempotencia en curso, 429 o 5xx. Default 2. */
    maxRetries?: number;
    fetch?: typeof fetch;
    /** Versión de la API (Cord-Version). Default: la versión con la que se construyó este SDK. */
    apiVersion?: string;
    /** Agrega tu app al User-Agent, útil para soporte. */
    appInfo?: { name: string; version?: string };
}

export interface RequestOptions {
    /** Clave propia; si no se pasa, el SDK genera una por llamada y la reusa en sus reintentos. */
    idempotencyKey?: string;
    timeoutMs?: number;
    signal?: AbortSignal;
}

export interface ApiResponse<T> {
    data: T;
    meta?: Record<string, unknown>;
    requestId: string | null;
}

const SDK_VERSION = '1.1.0';
const RETRYABLE = new Set([408, 425, 429, 500, 502, 503, 504]);

export function newIdempotencyKey(): string {
    return globalThis.crypto.randomUUID();
}

export class HttpClient {
    readonly mode: 'live' | 'test';
    private readonly base: string;
    private readonly timeoutMs: number;
    private readonly maxRetries: number;
    private readonly doFetch: typeof fetch;
    private readonly userAgent: string;
    readonly apiVersion: string;

    constructor(private readonly apiKey: string, opts: CordOptions = {}) {
        if (!apiKey || typeof apiKey !== 'string') throw new Error('[Cord] Falta la API key (sk_live_…, sk_test_… o una restringida rk_…).');
        if (apiKey.startsWith('pk_')) throw new Error('[Cord] @flouviahq/node usa una secret key (sk_ o rk_). La pk_ es para el navegador.');
        if (typeof window !== 'undefined' && typeof document !== 'undefined') {
            throw new Error('[Cord] @flouviahq/node corre solo en tu servidor: una secret key en el navegador queda expuesta.');
        }
        this.mode = /^(sk|rk)_test_/.test(apiKey) ? 'test' : 'live';
        this.apiVersion = opts.apiVersion ?? CORD_API_VERSION;
        this.base = `${(opts.baseUrl ?? 'https://cordhq.app').replace(/\/+$/, '')}/api/v1`;
        this.timeoutMs = opts.timeoutMs ?? 30000;
        this.maxRetries = Math.max(0, Math.min(5, opts.maxRetries ?? 2));
        this.doFetch = opts.fetch ?? ((...a: Parameters<typeof fetch>) => fetch(...a));
        this.userAgent = `cord-node/${SDK_VERSION}${opts.appInfo ? ` ${opts.appInfo.name}/${opts.appInfo.version ?? '0'}` : ''}`;
    }

    async request<T>(method: 'GET' | 'POST' | 'PATCH' | 'DELETE', path: string, opts: { query?: Record<string, unknown>; body?: unknown } & RequestOptions = {}): Promise<ApiResponse<T>> {
        const url = new URL(this.base + path);
        for (const [k, v] of Object.entries(opts.query ?? {})) {
            if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
        }
        const headers: Record<string, string> = {
            Authorization: `Bearer ${this.apiKey}`,
            Accept: 'application/json',
            'User-Agent': this.userAgent,
            'Cord-Version': this.apiVersion,
        };
        if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
        // Toda mutación lleva clave: un reintento nunca duplica una cotización, una factura ni un pago.
        if (method !== 'GET') headers['Idempotency-Key'] = opts.idempotencyKey ?? newIdempotencyKey();
        const body = opts.body === undefined ? undefined : JSON.stringify(opts.body);

        for (let attempt = 0; ; attempt++) {
            const ctrl = new AbortController();
            const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? this.timeoutMs);
            const onAbort = () => ctrl.abort();
            opts.signal?.addEventListener('abort', onAbort, { once: true });
            let res: Response;
            try {
                res = await this.doFetch(url, { method, headers, body, signal: ctrl.signal });
            } catch (err: any) {
                clearTimeout(timer);
                opts.signal?.removeEventListener('abort', onAbort);
                if (opts.signal?.aborted) throw err;
                if (attempt < this.maxRetries) { await sleep(backoff(attempt)); continue; }
                throw new CordError(0, { error: err?.name === 'AbortError' ? 'La petición a Cord tardó demasiado.' : `Error de red: ${err?.message ?? err}` }, null);
            }
            clearTimeout(timer);
            opts.signal?.removeEventListener('abort', onAbort);
            const requestId = res.headers.get('cord-request-id');
            const parsed: any = await res.json().catch(() => ({ error: res.statusText }));

            if (res.ok) return { data: parsed?.data as T, meta: parsed?.meta, requestId };
            const retryable = RETRYABLE.has(res.status) || (res.status === 409 && parsed?.code === 'idempotency_in_progress');
            if (retryable && attempt < this.maxRetries) {
                const retryAfter = Number(res.headers.get('retry-after'));
                await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter, 60) * 1000 : backoff(attempt));
                continue;
            }
            throw new CordError(res.status, parsed, requestId);
        }
    }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function backoff(attempt: number): number {
    const base = Math.min(10000, 500 * 2 ** attempt);
    return base / 2 + Math.random() * (base / 2);
}

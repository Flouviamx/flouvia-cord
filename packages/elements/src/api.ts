import type {
    CreateQuoteInput,
    CreateQuoteResponse,
    CreateClientInput,
    CreateProductInput,
    CreateResponse,
    PaginatedResponse,
    CordProduct
} from './types.js';
import { resolveApiBase } from './config.js';

// Códigos reales que devuelve el servidor (src/lib/apiv1.ts, src/lib/apikey.ts,
// src/lib/api-idempotency.ts). Manejar errores por código, nunca por el mensaje.
export type CordErrorCode =
    | 'invalid_json'
    | 'invalid_request'
    | 'unsupported_media_type'
    | 'payload_too_large'
    | 'missing_key'
    | 'invalid_key'
    | 'token_expired'
    | 'insufficient_scope'
    | 'insufficient_permissions'
    | 'ip_not_allowed'
    | 'key_expired'
    | 'secret_key_in_browser'
    | 'missing_origin'
    | 'unauthorized_origin'
    | 'invalid_origin'
    | 'origin_allowlist_required'
    | 'subscription_key_limit'
    | 'subscription_verification_unavailable'
    | 'api_quota_exceeded'
    | 'payment_required'
    | 'rate_limited'
    | 'invalid_idempotency_key'
    | 'idempotency_key_reused'
    | 'idempotency_in_progress'
    | 'idempotency_unavailable'
    | 'not_found'
    | 'missing_id'
    | 'invalid_cliente_id'
    | 'invalid_state'
    | 'missing_text'
    | 'text_too_long'
    | 'fx_unavailable'
    | 'tax_catalog_unavailable'
    | 'send_failed'
    | 'provider_error'
    | 'unavailable'
    | 'server_error'
    | 'network_error'
    | 'clients_require_proxy'
    | 'unknown';

export class CordError extends Error {
    readonly status: number;
    readonly code: CordErrorCode;
    readonly payload: any;
    /** `req_…` del header `Cord-Request-Id`. Inclúyelo al pedir soporte. */
    readonly requestId: string | null;
    /** Página de la documentación que explica este código. */
    readonly docUrl: string | null;

    constructor(status: number, payload: any, code?: CordErrorCode, requestId?: string | null) {
        const resolvedCode: CordErrorCode = code ?? (typeof payload?.code === 'string' ? payload.code : 'unknown');
        super(payload?.error || `Cord API error (${status})`);
        this.name = 'CordError';
        this.status = status;
        this.code = resolvedCode;
        this.payload = payload;
        this.requestId = requestId ?? (typeof payload?.request_id === 'string' ? payload.request_id : null);
        this.docUrl = typeof payload?.doc_url === 'string' ? payload.doc_url : null;
    }
}

const IS_BROWSER = typeof window !== 'undefined' && typeof document !== 'undefined';

/** El servidor envuelve TODA respuesta en `{ data }` (ver src/lib/apiv1.ts `ok()`).
 * Desenvuelve defensivamente: si no hay `.data`, devuelve el body tal cual
 * (no rompe contra un proxy propio que no envuelva sus respuestas). */
function unwrapEnvelope<T>(body: any): T {
    return (body && typeof body === 'object' && 'data' in body ? body.data : body) as T;
}

export class CordAPI {
    private readonly baseUrl: string;
    private readonly apiKey: string;

    constructor(apiKey?: string, baseUrl?: string) {
        const key = apiKey || (typeof process !== 'undefined' ? process.env.CORD_API_KEY : undefined);
        if (!key) {
            throw new Error('Cord API Key is required. Pass it to the constructor or set CORD_API_KEY environment variable.');
        }
        if (IS_BROWSER && /^(sk|rk)_/.test(key)) {
            throw new Error(
                '[Cord] CordAPI recibió una secret key (sk_ o rk_) en el navegador. Ya quedó expuesta en el código de la página: revócala en Ajustes › Developers y usa CordAPI solo en tu servidor.',
            );
        }
        this.apiKey = key;
        this.baseUrl = resolveApiBase(baseUrl);
    }

    /**
     * `unwrap: false` para endpoints de LISTA — su forma real YA ES
     * `PaginatedResponse` (`{ data: T[], meta }`), que coincide con el sobre
     * del servidor; desenvolverla dos veces perdería `meta`. Los endpoints de
     * creación sí necesitan desenvolver (esperan el objeto plano).
     */
    private async fetch<T>(path: string, init?: RequestInit, opts: { unwrap?: boolean } = {}): Promise<T> {
        const { unwrap = true } = opts;
        let response: Response;
        try {
            response = await fetch(`${this.baseUrl}${path}`, {
                ...init,
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json',
                    ...init?.headers,
                },
            });
        } catch (err: any) {
            throw new CordError(0, { error: err?.message || 'Error de red' }, 'network_error');
        }

        if (!response.ok) {
            let payload;
            try {
                payload = await response.json();
            } catch (e) {
                payload = { error: response.statusText };
            }
            throw new CordError(response.status, payload, undefined, response.headers.get('cord-request-id'));
        }

        const body = await response.json();
        return unwrap ? unwrapEnvelope<T>(body) : (body as T);
    }

    // ==== Quotes (Cotizaciones) ====
    public readonly quotes = {
        create: (data: CreateQuoteInput): Promise<CreateQuoteResponse> => {
            return this.fetch<CreateQuoteResponse>('/cotizaciones', {
                method: 'POST',
                body: JSON.stringify(data),
            });
        },
        list: (options?: { limit?: number; offset?: number; status?: string }): Promise<PaginatedResponse<unknown>> => {
            const params = new URLSearchParams();
            if (options?.limit) params.append('limit', options.limit.toString());
            if (options?.offset) params.append('offset', options.offset.toString());
            if (options?.status) params.append('status', options.status);
            const query = params.toString() ? `?${params.toString()}` : '';
            return this.fetch<PaginatedResponse<unknown>>(`/cotizaciones${query}`, undefined, { unwrap: false });
        }
    };

    // ==== Clients (Clientes) ====
    public readonly clients = {
        create: (data: CreateClientInput): Promise<CreateResponse> => {
            return this.fetch<CreateResponse>('/clientes', {
                method: 'POST',
                body: JSON.stringify(data),
            });
        },
        list: (options?: { limit?: number; offset?: number }): Promise<PaginatedResponse<unknown>> => {
            const params = new URLSearchParams();
            if (options?.limit) params.append('limit', options.limit.toString());
            if (options?.offset) params.append('offset', options.offset.toString());
            const query = params.toString() ? `?${params.toString()}` : '';
            return this.fetch<PaginatedResponse<unknown>>(`/clientes${query}`, undefined, { unwrap: false });
        }
    };

    // ==== Products (Productos) ====
    public readonly products = {
        create: (data: CreateProductInput): Promise<CreateResponse> => {
            return this.fetch<CreateResponse>('/productos', {
                method: 'POST',
                body: JSON.stringify(data),
            });
        },
        list: (options?: { limit?: number; offset?: number }): Promise<PaginatedResponse<CordProduct>> => {
            const params = new URLSearchParams();
            if (options?.limit) params.append('limit', options.limit.toString());
            if (options?.offset) params.append('offset', options.offset.toString());
            const query = params.toString() ? `?${params.toString()}` : '';
            return this.fetch<PaginatedResponse<CordProduct>>(`/productos${query}`, undefined, { unwrap: false });
        }
    };
}

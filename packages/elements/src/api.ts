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

// Códigos reales que devuelve el servidor (ver src/lib/apiv1.ts `fail()` y
// src/lib/apikey.ts) — enumerarlos permite manejar errores por código en vez
// de parsear el mensaje en español.
export type CordErrorCode =
    | 'invalid_json'
    | 'invalid_request'
    | 'missing_key'
    | 'invalid_key'
    | 'insufficient_scope'
    | 'missing_origin'
    | 'unauthorized_origin'
    | 'invalid_origin'
    | 'rate_limited'
    | 'server_error'
    | 'network_error'
    | 'clients_require_proxy'
    | 'unknown';

export class CordError extends Error {
    readonly status: number;
    readonly code: CordErrorCode;
    readonly payload: any;

    constructor(status: number, payload: any, code?: CordErrorCode) {
        const resolvedCode: CordErrorCode = code ?? (typeof payload?.code === 'string' ? payload.code : 'unknown');
        super(payload?.error || `Cord API error (${status})`);
        this.name = 'CordError';
        this.status = status;
        this.code = resolvedCode;
        this.payload = payload;
    }
}

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
            throw new CordError(response.status, payload);
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

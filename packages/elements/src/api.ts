import type {
    CreateQuoteInput,
    CreateQuoteResponse,
    CreateClientInput,
    CreateProductInput,
    CreateResponse,
    PaginatedResponse,
    CordProduct
} from './types';

export class CordError extends Error {
    constructor(public status: number, public payload: any) {
        super(`Flouvia Cord API Error (${status}): ${payload?.error || 'Unknown error'}`);
        this.name = 'CordError';
    }
}

export class CordAPI {
    private readonly baseUrl: string;
    private readonly apiKey: string;
    public readonly testMode: boolean;

    constructor(apiKey?: string, baseUrl: string = 'https://cord.flouvia.com/api/v1') {
        const key = apiKey || (typeof process !== 'undefined' ? process.env.CORD_API_KEY : undefined);
        if (!key) {
            throw new Error('Cord API Key is required. Pass it to the constructor or set CORD_API_KEY environment variable.');
        }
        this.apiKey = key;
        this.testMode = key.startsWith('sk_test_');
        this.baseUrl = baseUrl.replace(/\/$/, ''); // Remove trailing slash
    }

    private async fetch<T>(path: string, init?: RequestInit): Promise<T> {
        const response = await fetch(`${this.baseUrl}${path}`, {
            ...init,
            headers: {
                'Authorization': `Bearer ${this.apiKey}`,
                'Content-Type': 'application/json',
                ...(this.testMode ? { 'X-Cord-Mode': 'test' } : {}),
                ...init?.headers,
            },
        });

        if (!response.ok) {
            let payload;
            try {
                payload = await response.json();
            } catch (e) {
                payload = { error: response.statusText };
            }
            throw new CordError(response.status, payload);
        }

        return response.json();
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
            return this.fetch<PaginatedResponse<unknown>>(`/cotizaciones${query}`);
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
            return this.fetch<PaginatedResponse<unknown>>(`/clientes${query}`);
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
            return this.fetch<PaginatedResponse<CordProduct>>(`/productos${query}`);
        }
    };
}

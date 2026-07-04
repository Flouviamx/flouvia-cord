// Tipos públicos de @flouviahq/elements (escritos a mano).

export interface CordEventDetail {
    token?: string;
    folio?: string;
    [key: string]: unknown;
}

export interface CordElementOptions {
    token: string;
    baseUrl?: string;
    minHeight?: number;
    onReady?: () => void;
    onApproved?: (detail: CordEventDetail) => void;
    onRejected?: (detail: CordEventDetail) => void;
    onMessage?: (detail: CordEventDetail) => void;
    onPay?: (detail: CordEventDetail) => void;
    onEvent?: (type: string, detail: CordEventDetail) => void;
}

export interface CordController {
    destroy(): void;
    readonly el: HTMLElement;
}

/** Monta el cotizador dentro de `target`. Devuelve un controller con destroy(). */
export declare function mountCotizador(target: HTMLElement, opts: CordElementOptions): CordController;

/** Web Component <cord-cotizador>. Atributos: token, base-url, min-height. */
export declare class CordCotizadorElement extends HTMLElement {
    static get observedAttributes(): string[];
    connectedCallback(): void;
    disconnectedCallback(): void;
    attributeChangedCallback(): void;
}

/** Registra el custom element (idempotente). Se llama solo al importar el paquete. */
export declare function defineCordElements(tag?: string): void;

// ==== API Client (SDK) ====
export declare type QuoteStatus = 'draft' | 'sent' | 'approved' | 'paid' | 'rejected';
export declare type Terminos = 'contado' | 'net30' | 'net60';
export declare type NivelCliente = 'estandar' | 'plata' | 'oro' | 'distribuidor';

export interface QuoteItemInput {
    descripcion: string;
    cantidad: number;
    precio_unitario: number;
    producto_id?: string;
}

export interface CreateQuoteInput {
    send?: boolean;
    notas?: string;
    cliente_id?: string;
    terminos?: Terminos;
    vigencia_dias?: number;
    base_currency?: string;
    fiscal_currency?: string;
    fx_buffer_pct?: number;
    iva_incluido?: boolean;
    items: QuoteItemInput[];
}

export interface CreateQuoteResponse {
    id: string;
    folio?: string;
    link_publico?: string;
    needs_approval?: boolean;
    motivo?: string;
    email?: { sent: boolean };
}

export interface CreateClientInput {
    empresa: string;
    contacto?: string;
    email?: string;
    telefono?: string;
    rfc?: string;
    terminos?: Terminos;
    limite?: number;
    nivel?: NivelCliente;
    descuento_pct?: number;
}

export interface CreateProductInput {
    nombre: string;
    sku?: string;
    unidad?: string;
    precio?: number;
    activo?: boolean;
}

export interface CreateResponse {
    id: string;
}

export interface PaginatedResponse<T> {
    data: T[];
    meta: {
        limit: number;
        offset: number;
        total: number;
    };
}

export declare class CordError extends Error {
    status: number;
    payload: any;
    constructor(status: number, payload: any);
}

export declare class CordAPI {
    constructor(apiKey?: string, baseUrl?: string);
    readonly quotes: {
        create(data: CreateQuoteInput): Promise<CreateQuoteResponse>;
        list(options?: { limit?: number; offset?: number; status?: string }): Promise<PaginatedResponse<any>>;
    };
    readonly clients: {
        create(data: CreateClientInput): Promise<CreateResponse>;
        list(options?: { limit?: number; offset?: number }): Promise<PaginatedResponse<any>>;
    };
    readonly products: {
        create(data: CreateProductInput): Promise<CreateResponse>;
        list(options?: { limit?: number; offset?: number }): Promise<PaginatedResponse<any>>;
    };
}

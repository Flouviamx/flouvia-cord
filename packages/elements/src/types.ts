// Tipos públicos de @flouviahq/elements. Superficie mínima a propósito.

/** Payload que viaja con cada evento del cotizador. */
export interface CordEventDetail {
    /** token público de la cotización */
    token?: string;
    /** folio legible, ej. "COT-0148" */
    folio?: string;
    /** campos extra según el evento (comentario, propuesta, url de pago…) */
    [key: string]: unknown;
}

export interface CordElementOptions {
    /** Token público de la cotización (de /q/{token} o la API). REQUERIDO. */
    token: string;
    /** Origen de Cord. Default: https://cord.flouvia.com (cambiar para self-host/staging). */
    baseUrl?: string;
    /** Alto inicial del skeleton en px mientras carga. Default 420. */
    minHeight?: number;
    /** El cotizador terminó de cargar. */
    onReady?: () => void;
    /** El cliente aprobó la cotización. */
    onApproved?: (detail: CordEventDetail) => void;
    /** El cliente rechazó la cotización. */
    onRejected?: (detail: CordEventDetail) => void;
    /** El cliente envió un comentario o contraoferta. */
    onMessage?: (detail: CordEventDetail) => void;
    /** El cliente inició el pago en línea. */
    onPay?: (detail: CordEventDetail) => void;
    /** Catch-all: cualquier evento `cord:*` (incluye los anteriores). */
    onEvent?: (type: string, detail: CordEventDetail) => void;
}

/** Handle devuelto por mountCotizador() para limpiar la instancia. */
export interface CordController {
    /** Quita el iframe, los listeners y el skeleton. */
    destroy(): void;
    /** El elemento contenedor. */
    readonly el: HTMLElement;
}

// ==== API Types ====
export type QuoteStatus = 'draft' | 'sent' | 'approved' | 'paid' | 'rejected';
export type Terminos = 'contado' | 'net30' | 'net60';
export type NivelCliente = 'estandar' | 'plata' | 'oro' | 'distribuidor';

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

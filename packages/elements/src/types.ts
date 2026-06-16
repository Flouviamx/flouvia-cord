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

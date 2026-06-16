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

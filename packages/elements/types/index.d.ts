// Tipos públicos de @flouviahq/elements (escritos a mano).

export interface TratoEventDetail {
    token?: string;
    folio?: string;
    [key: string]: unknown;
}

export interface TratoElementOptions {
    token: string;
    baseUrl?: string;
    minHeight?: number;
    onReady?: () => void;
    onApproved?: (detail: TratoEventDetail) => void;
    onRejected?: (detail: TratoEventDetail) => void;
    onMessage?: (detail: TratoEventDetail) => void;
    onPay?: (detail: TratoEventDetail) => void;
    onEvent?: (type: string, detail: TratoEventDetail) => void;
}

export interface TratoController {
    destroy(): void;
    readonly el: HTMLElement;
}

/** Monta el cotizador dentro de `target`. Devuelve un controller con destroy(). */
export declare function mountCotizador(target: HTMLElement, opts: TratoElementOptions): TratoController;

/** Web Component <trato-cotizador>. Atributos: token, base-url, min-height. */
export declare class TratoCotizadorElement extends HTMLElement {
    static get observedAttributes(): string[];
    connectedCallback(): void;
    disconnectedCallback(): void;
    attributeChangedCallback(): void;
}

/** Registra el custom element (idempotente). Se llama solo al importar el paquete. */
export declare function defineTratoElements(tag?: string): void;

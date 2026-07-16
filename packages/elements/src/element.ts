// Web Component <cord-cotizador> — funciona en HTML plano, Vue, Svelte, Angular,
// Astro… cualquier framework que renderice DOM. Envuelve el core y re-emite los
// eventos del cotizador como CustomEvents NATIVOS (sin el prefijo `cord:`), para
// que en Vue sea `@approved`, en HTML `addEventListener('approved', …)`.
import { mountCotizador } from './core.js';
import type { CordController } from './types.js';

// `extends HTMLElement` se evalúa al DEFINIR la clase, no al instanciarla —
// en Node (SSR, scripts, este mismo check-exports) `HTMLElement` no existe y
// el import de este módulo tronaría con un ReferenceError. Base segura: en
// Node cae a una clase vacía (nunca se instancia fuera del navegador, porque
// `defineCordElements()` ya no-opea sin `customElements`).
const ElementBase: typeof HTMLElement =
    typeof HTMLElement !== 'undefined' ? HTMLElement : (class {} as unknown as typeof HTMLElement);

export class CordCotizadorElement extends ElementBase {
    private controller: CordController | null = null;

    static get observedAttributes() {
        return ['token', 'base-url', 'min-height'];
    }

    connectedCallback() {
        this.render();
    }

    disconnectedCallback() {
        this.controller?.destroy();
        this.controller = null;
    }

    attributeChangedCallback() {
        // Re-montar si cambia un atributo después de conectado.
        if (this.isConnected) this.render();
    }

    private render() {
        const token = this.getAttribute('token');
        if (!token) {
            console.warn('[Cord] <cord-cotizador> requiere el atributo token');
            return;
        }
        this.controller?.destroy();

        const minAttr = this.getAttribute('min-height');
        const emit = (name: string, detail: unknown) =>
            this.dispatchEvent(new CustomEvent(name, { detail, bubbles: true, composed: true }));

        this.controller = mountCotizador(this, {
            token,
            baseUrl: this.getAttribute('base-url') || undefined,
            minHeight: minAttr ? parseInt(minAttr, 10) : undefined,
            // Re-emite cada evento sin el prefijo: cord:approved → 'approved'.
            onEvent: (event) => emit(event.type.replace(/^cord:/, ''), event.detail),
        });
    }
}

/** Registra el custom element (idempotente). Llamado automáticamente al importar. */
export function defineCordElements(tag = 'cord-cotizador') {
    if (typeof customElements === 'undefined') return;
    if (!customElements.get(tag)) customElements.define(tag, CordCotizadorElement);
}

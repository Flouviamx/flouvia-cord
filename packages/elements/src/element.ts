// Web Components de Cord Elements. Funcionan en HTML plano, Vue, Svelte, Angular,
// Astro, Laravel o Rails. Viven en un Shadow DOM: sus estilos no tocan tu página
// y los tuyos no los rompen; se personalizan con ::part(frame), ::part(skeleton)
// y las variables --cord-*. La sombra aísla estilos, no es una frontera de
// seguridad: firmar y pagar siguen dentro del iframe de Cord.
//
// Eventos: cada `cord:*` del cotizador se re-emite sin prefijo (cord:approved →
// 'approved'), con bubbles y composed para cruzar la sombra.
import { mountCotizador } from './core.js';
import type { CordAppearance, CordController } from './types.js';
import type { QuoteViewState } from './headless/quote-view.js';
import { INITIAL_QUOTE_VIEW } from './headless/quote-view.js';
import { getCordConfig } from './config.js';
import { enableDebug } from './debug.js';

// `extends HTMLElement` se evalúa al definir la clase: en Node no existe.
const ElementBase: typeof HTMLElement =
    typeof HTMLElement !== 'undefined' ? HTMLElement : (class {} as unknown as typeof HTMLElement);

const HOST_CSS = ':host{display:block;position:relative;width:100%}:host([hidden]){display:none}.root{position:relative;width:100%}';

export class CordQuoteElement extends ElementBase {
    private controller: CordController | null = null;
    private unsubscribe: (() => void) | null = null;
    private root: ShadowRoot | null = null;
    private container: HTMLDivElement | null = null;
    private _appearance: CordAppearance | undefined;
    private _state: QuoteViewState = INITIAL_QUOTE_VIEW;
    private scheduled = false;

    static get observedAttributes() {
        return ['token', 'base-url', 'min-height', 'appearance', 'debug'];
    }

    /** Appearance como objeto (preferible al atributo JSON). */
    get appearance(): CordAppearance | undefined { return this._appearance; }
    set appearance(value: CordAppearance | undefined) {
        this._appearance = value;
        this.schedule();
    }

    /** Qué documento monta este elemento. */
    protected get documentKind(): 'quote' | 'invoice' { return 'quote'; }

    /** Estado en vivo: ready, status, total, approved, paid… */
    get state(): QuoteViewState { return this._state; }

    connectedCallback() {
        if (!this.root) {
            this.root = this.attachShadow({ mode: 'open' });
            const style = document.createElement('style');
            style.textContent = HOST_CSS;
            this.container = document.createElement('div');
            this.container.className = 'root';
            this.container.setAttribute('part', 'root');
            this.root.append(style, this.container);
        }
        this.schedule();
    }

    disconnectedCallback() {
        this.teardown();
    }

    attributeChangedCallback() {
        if (this.isConnected) this.schedule();
    }

    // Varios atributos cambian juntos (token + appearance): un solo montaje.
    private schedule() {
        if (this.scheduled) return;
        this.scheduled = true;
        queueMicrotask(() => {
            this.scheduled = false;
            if (this.isConnected) this.render();
        });
    }

    private teardown() {
        this.unsubscribe?.();
        this.unsubscribe = null;
        this.controller?.destroy();
        this.controller = null;
    }

    private resolvedAppearance(): CordAppearance | undefined {
        if (this._appearance) return this._appearance;
        const attr = this.getAttribute('appearance');
        if (attr) {
            try { return JSON.parse(attr); } catch { console.warn('[Cord] el atributo appearance no es JSON válido.'); }
        }
        return getCordConfig().appearance;
    }

    private render() {
        const token = this.getAttribute('token');
        this.teardown();
        if (!token || !this.container || !this.root) {
            if (!token) console.warn(`[Cord] <${this.localName}> requiere el atributo token`);
            return;
        }
        if (this.hasAttribute('debug')) enableDebug();
        const minAttr = this.getAttribute('min-height');
        const emit = (name: string, detail: unknown) =>
            this.dispatchEvent(new CustomEvent(name, { detail, bubbles: true, composed: true }));

        this.controller = mountCotizador(this.container, {
            token,
            document: this.documentKind,
            baseUrl: this.getAttribute('base-url') || undefined,
            minHeight: minAttr ? parseInt(minAttr, 10) : undefined,
            appearance: this.resolvedAppearance(),
            onEvent: (event) => emit(event.type.replace(/^cord:/, ''), event.detail),
        }, this.root);
        this.unsubscribe = this.controller.state.subscribe((s) => {
            this._state = s;
            emit('statechange', s);
        });
    }
}

/** Alias histórico: los embeds publicados con <cord-cotizador> siguen funcionando. */
export class CordCotizadorElement extends CordQuoteElement {}

/** <cord-invoice>: la factura de /i/{token}. Emite además 'paid'. */
export class CordInvoiceElement extends CordQuoteElement {
    protected override get documentKind(): 'invoice' { return 'invoice'; }
}

/** Registra los elementos (idempotente). Se llama solo al importar el paquete. */
export function defineCordElements(tag?: string) {
    if (typeof customElements === 'undefined') return;
    if (!customElements.get('cord-quote')) customElements.define('cord-quote', CordQuoteElement);
    if (!customElements.get('cord-cotizador')) customElements.define('cord-cotizador', CordCotizadorElement);
    if (!customElements.get('cord-invoice')) customElements.define('cord-invoice', CordInvoiceElement);
    if (tag && !customElements.get(tag)) customElements.define(tag, class extends CordQuoteElement {});
}

declare global {
    interface HTMLElementTagNameMap {
        'cord-quote': CordQuoteElement;
        'cord-cotizador': CordCotizadorElement;
        'cord-invoice': CordInvoiceElement;
    }
}

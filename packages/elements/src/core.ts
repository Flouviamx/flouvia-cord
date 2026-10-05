// Núcleo agnóstico de framework de @flouviahq/elements: monta el cotizador (iframe a
// /embed/{token}) con skeleton, auto-altura (postMessage) y relay de eventos.
// Es la MISMA mecánica que public/embed.js, pero como módulo: cada instancia tiene
// su propio listener (scoped por contentWindow) y se limpia con destroy().
import type { CordElementOptions, CordController, CordEvent } from './types.js';
import { resolveOrigin } from './config.js';
import { sanitizeAppearance, MAX_APPEARANCE_BYTES } from './appearance.js';
import { createStore } from './headless/store.js';
import { INITIAL_QUOTE_VIEW, reduceQuoteView } from './headless/quote-view.js';
import { debugLog, debugText } from './debug.js';

const STYLE_ID = 'cord-elements-style';

const REDUCED =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Eventos que re-emitimos. El catch-all (onEvent) recibe todos. */
const RELAYED = ['cord:ready', 'cord:viewed', 'cord:approved', 'cord:signed', 'cord:rejected', 'cord:message', 'cord:item_comment', 'cord:pay', 'cord:updated', 'cord:status_changed', 'cord:paid'] as const;

export const EMBED_CSS = (() => {
    const css =
        '.cord-embed{position:relative;width:100%;}' +
        '.cord-embed iframe{width:100%;border:0;display:block;background:transparent;' +
        'opacity:0;transition:opacity .35s ease,height .2s ease;}' +
        '.cord-embed.is-ready iframe{opacity:1;}' +
        '.cord-embed-skeleton{position:absolute;inset:0;border-radius:18px;overflow:hidden;' +
        'background:#fcfcfc;box-shadow:inset 0 0 0 1px rgba(10,25,47,.06);}' +
        '.cord-embed.is-ready .cord-embed-skeleton{opacity:0;transition:opacity .3s ease;pointer-events:none;}' +
        '.cord-embed-shimmer{position:absolute;inset:0;background:linear-gradient(100deg,' +
        'transparent 20%,rgba(10,25,47,.05) 40%,rgba(10,25,47,.07) 50%,rgba(10,25,47,.05) 60%,transparent 80%);' +
        'background-size:200% 100%;' + (REDUCED ? '' : 'animation:cord-shimmer 1.4s infinite linear;') + '}' +
        '@keyframes cord-shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}';
    return css;
})();

// En el documento: un <style> compartido. En un Shadow DOM: los estilos viven
// dentro de la raíz y no tocan la página anfitriona.
function injectStyles(root: Document | ShadowRoot) {
    if (typeof document === 'undefined') return;
    if (root instanceof Document || !('host' in root)) {
        if (document.getElementById(STYLE_ID)) return;
        const st = document.createElement('style');
        st.id = STYLE_ID;
        st.textContent = EMBED_CSS;
        (document.head || document.documentElement).appendChild(st);
        return;
    }
    const shadow = root as ShadowRoot;
    if (shadow.querySelector(`style[data-cord="${STYLE_ID}"]`)) return;
    try {
        if ('adoptedStyleSheets' in shadow && typeof CSSStyleSheet !== 'undefined') {
            const sheet = new CSSStyleSheet();
            sheet.replaceSync(EMBED_CSS);
            shadow.adoptedStyleSheets = [...shadow.adoptedStyleSheets, sheet];
            return;
        }
    } catch { /* cae al <style> */ }
    const st = document.createElement('style');
    st.dataset.cord = STYLE_ID;
    st.textContent = EMBED_CSS;
    shadow.appendChild(st);
}

const MAX_HEIGHT = 20000;
const isDev = () => typeof process === 'undefined' || process.env?.NODE_ENV !== 'production';

/**
 * Monta el cotizador dentro de `target`. Devuelve un controller con destroy().
 */
export function mountCotizador(target: HTMLElement, opts: CordElementOptions, styleRoot?: Document | ShadowRoot): CordController {
    if (!target) throw new Error('[Cord] target inválido');
    if (!opts || !opts.token) throw new Error('[Cord] falta opts.token');
    if (opts.appearance && isDev()) {
        const { rejected } = sanitizeAppearance(opts.appearance);
        if (rejected.length) {
            console.warn(debugText().appearanceDroppedConsole(rejected.join(', ')));
            debugLog('warning', debugText().appearanceDropped(rejected.join(', ')));
        }
    }
    const state = createStore(INITIAL_QUOTE_VIEW);

    const base = resolveOrigin(opts.baseUrl);
    const origin = (() => { try { return new URL(base).origin; } catch { return base; } })();
    const minH = typeof opts.minHeight === 'number' && opts.minHeight > 0 ? opts.minHeight : 420;

    injectStyles(styleRoot ?? (typeof document !== 'undefined' ? document : (undefined as any)));
    target.classList.add('cord-embed');

    const skeleton = document.createElement('div');
    skeleton.className = 'cord-embed-skeleton';
    skeleton.setAttribute('part', 'skeleton');
    skeleton.innerHTML = '<div class="cord-embed-shimmer"></div>';
    target.appendChild(skeleton);

    // `parentOrigin` deja que /embed/[token] use un targetOrigin real en su
    // postMessage (en vez de '*' siempre) cuando el origen matchea la
    // allowlist de orgs.embed_domains — mismo gate que ya protege frame-ancestors.
    const params = new URLSearchParams();
    const appearanceJson = opts.appearance ? JSON.stringify(opts.appearance) : '';
    if (appearanceJson.length > MAX_APPEARANCE_BYTES) {
        console.warn(debugText().appearanceTooBigConsole(appearanceJson.length, MAX_APPEARANCE_BYTES));
        debugLog('error', debugText().appearanceTooBig);
    } else if (appearanceJson) params.set('appearance', appearanceJson);
    if (typeof window !== 'undefined' && window.location?.origin) params.set('parentOrigin', window.location.origin);
    const query = params.toString();

    const iframe = document.createElement('iframe');
    const invoice = opts.document === 'invoice';
    iframe.src = base + (invoice ? '/embed/i/' : '/embed/') + encodeURIComponent(opts.token) + (query ? '?' + query : '');
    iframe.title = invoice ? 'Factura' : 'Cotización';
    iframe.setAttribute('loading', 'lazy');
    iframe.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
    iframe.setAttribute('allow', 'payment; clipboard-write');
    iframe.setAttribute('part', 'frame');
    iframe.style.height = minH + 'px';
    // El outer <iframe> refleja el theme (chrome del elemento — scrollbar/UA
    // widgets DESDE afuera); el contenido de adentro lo decide /embed/[token]
    // mismo con la misma appearance (ver theme en el query param arriba).
    iframe.style.colorScheme = opts.appearance?.theme === 'dark' ? 'dark'
        : opts.appearance?.theme === 'auto' ? 'light dark' : 'light';
    target.appendChild(iframe);

    let ready = false;
    const reveal = () => {
        if (ready) return;
        ready = true;
        target.classList.add('is-ready');
        window.setTimeout(() => { if (skeleton.parentNode) skeleton.parentNode.removeChild(skeleton); }, 400);
    };

    const onMessage = (ev: MessageEvent) => {
        if (ev.origin !== origin) return;
        const data: any = ev.data;
        if (!data || data.source !== 'cord' || !data.type) return;
        if (iframe.contentWindow && ev.source !== iframe.contentWindow) return;

        if (data.type === 'cord:resize') {
            const h = Number(data.height);
            if (Number.isFinite(h) && h > 0) iframe.style.height = Math.min(MAX_HEIGHT, Math.ceil(h)) + 'px';
            return;
        }
        if (!(RELAYED as readonly string[]).includes(data.type)) return;
        if (data.type === 'cord:ready') reveal();

        // El payload viaja por postMessage sin garantía estática de forma —
        // se castea a CordEvent (la unión discriminada documentada) en el
        // único punto donde cruza la frontera no tipada.
        const evt = { type: data.type, detail: data.detail && typeof data.detail === 'object' ? data.detail : {} } as CordEvent;
        state.set((prev) => reduceQuoteView(prev, evt));
        debugLog('event', evt.type, evt.detail);
        if (opts.onEvent) opts.onEvent(evt);
        switch (evt.type) {
            case 'cord:ready':        opts.onReady?.(); break;
            case 'cord:viewed':       opts.onViewed?.(evt.detail); break;
            case 'cord:approved':     opts.onApproved?.(evt.detail); break;
            case 'cord:signed':       opts.onSigned?.(evt.detail); break;
            case 'cord:rejected':     opts.onRejected?.(evt.detail); break;
            case 'cord:message':      opts.onMessage?.(evt.detail); break;
            case 'cord:item_comment': opts.onItemComment?.(evt.detail); break;
            case 'cord:pay':          opts.onPay?.(evt.detail); break;
            case 'cord:updated':      opts.onUpdated?.(evt.detail); break;
            case 'cord:status_changed': opts.onStatusChanged?.(evt.detail); break;
            case 'cord:paid':         opts.onPaid?.(evt.detail); break;
        }
    };
    window.addEventListener('message', onMessage);

    // Fallback: si no llega 'cord:ready', revela al cargar el iframe.
    const onLoad = () => window.setTimeout(reveal, 250);
    iframe.addEventListener('load', onLoad);

    return {
        el: target,
        state,
        destroy() {
            window.removeEventListener('message', onMessage);
            iframe.removeEventListener('load', onLoad);
            if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
            if (skeleton.parentNode) skeleton.parentNode.removeChild(skeleton);
            target.classList.remove('cord-embed', 'is-ready');
        },
    };
}

export { RELAYED };

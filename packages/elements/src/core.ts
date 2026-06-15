// Núcleo agnóstico de framework de @flouviahq/elements: monta el cotizador (iframe a
// /embed/{token}) con skeleton, auto-altura (postMessage) y relay de eventos.
// Es la MISMA mecánica que public/embed.js, pero como módulo: cada instancia tiene
// su propio listener (scoped por contentWindow) y se limpia con destroy().
import type { TratoElementOptions, TratoController, TratoEventDetail } from './types';

const DEFAULT_BASE = 'https://trato.flouvia.com';
const STYLE_ID = 'trato-elements-style';

const REDUCED =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Eventos que re-emitimos. El catch-all (onEvent) recibe todos. */
const RELAYED = ['trato:ready', 'trato:approved', 'trato:rejected', 'trato:message', 'trato:pay'] as const;

function injectStyles() {
    if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
    const css =
        '.trato-embed{position:relative;width:100%;}' +
        '.trato-embed iframe{width:100%;border:0;display:block;background:transparent;' +
        'opacity:0;transition:opacity .35s ease,height .2s ease;color-scheme:normal;}' +
        '.trato-embed.is-ready iframe{opacity:1;}' +
        '.trato-embed-skeleton{position:absolute;inset:0;border-radius:18px;overflow:hidden;' +
        'background:#fcfcfc;box-shadow:inset 0 0 0 1px rgba(10,25,47,.06);}' +
        '.trato-embed.is-ready .trato-embed-skeleton{opacity:0;transition:opacity .3s ease;pointer-events:none;}' +
        '.trato-embed-shimmer{position:absolute;inset:0;background:linear-gradient(100deg,' +
        'transparent 20%,rgba(10,25,47,.05) 40%,rgba(10,25,47,.07) 50%,rgba(10,25,47,.05) 60%,transparent 80%);' +
        'background-size:200% 100%;' + (REDUCED ? '' : 'animation:trato-shimmer 1.4s infinite linear;') + '}' +
        '@keyframes trato-shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}';
    const st = document.createElement('style');
    st.id = STYLE_ID;
    st.textContent = css;
    (document.head || document.documentElement).appendChild(st);
}

/**
 * Monta el cotizador dentro de `target`. Devuelve un controller con destroy().
 */
export function mountCotizador(target: HTMLElement, opts: TratoElementOptions): TratoController {
    if (!target) throw new Error('[Trato] target inválido');
    if (!opts || !opts.token) throw new Error('[Trato] falta opts.token');

    const base = (opts.baseUrl || DEFAULT_BASE).replace(/\/$/, '');
    const origin = (() => { try { return new URL(base).origin; } catch { return base; } })();
    const minH = typeof opts.minHeight === 'number' && opts.minHeight > 0 ? opts.minHeight : 420;

    injectStyles();
    target.classList.add('trato-embed');

    // Skeleton mientras carga.
    const skeleton = document.createElement('div');
    skeleton.className = 'trato-embed-skeleton';
    skeleton.innerHTML = '<div class="trato-embed-shimmer"></div>';
    target.appendChild(skeleton);

    const iframe = document.createElement('iframe');
    iframe.src = base + '/embed/' + encodeURIComponent(opts.token);
    iframe.title = 'Cotización';
    iframe.setAttribute('loading', 'lazy');
    iframe.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
    iframe.setAttribute('allow', 'payment; clipboard-write');
    iframe.style.height = minH + 'px';
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
        if (!data || data.source !== 'trato' || !data.type) return;
        if (iframe.contentWindow && ev.source !== iframe.contentWindow) return;

        if (data.type === 'trato:resize' && data.height) {
            iframe.style.height = data.height + 'px';
            return;
        }
        if (data.type === 'trato:ready') reveal();

        const detail: TratoEventDetail = data.detail || {};
        if (opts.onEvent) opts.onEvent(data.type, detail);
        switch (data.type) {
            case 'trato:ready':    opts.onReady?.(); break;
            case 'trato:approved': opts.onApproved?.(detail); break;
            case 'trato:rejected': opts.onRejected?.(detail); break;
            case 'trato:message':  opts.onMessage?.(detail); break;
            case 'trato:pay':      opts.onPay?.(detail); break;
        }
    };
    window.addEventListener('message', onMessage);

    // Fallback: si no llega 'trato:ready', revela al cargar el iframe.
    const onLoad = () => window.setTimeout(reveal, 250);
    iframe.addEventListener('load', onLoad);

    return {
        el: target,
        destroy() {
            window.removeEventListener('message', onMessage);
            iframe.removeEventListener('load', onLoad);
            if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
            if (skeleton.parentNode) skeleton.parentNode.removeChild(skeleton);
            target.classList.remove('trato-embed', 'is-ready');
        },
    };
}

export { RELAYED };

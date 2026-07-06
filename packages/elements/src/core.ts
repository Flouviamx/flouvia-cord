// Núcleo agnóstico de framework de @flouviahq/elements: monta el cotizador (iframe a
// /embed/{token}) con skeleton, auto-altura (postMessage) y relay de eventos.
// Es la MISMA mecánica que public/embed.js, pero como módulo: cada instancia tiene
// su propio listener (scoped por contentWindow) y se limpia con destroy().
import type { CordElementOptions, CordController, CordEventDetail } from './types';

const DEFAULT_BASE = 'https://cord.flouvia.com';
const STYLE_ID = 'cord-elements-style';

const REDUCED =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Eventos que re-emitimos. El catch-all (onEvent) recibe todos. */
const RELAYED = ['cord:ready', 'cord:approved', 'cord:rejected', 'cord:message', 'cord:pay'] as const;

function injectStyles() {
    if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
    const css =
        '.cord-embed{position:relative;width:100%;}' +
        '.cord-embed iframe{width:100%;border:0;display:block;background:transparent;' +
        'opacity:0;transition:opacity .35s ease,height .2s ease;color-scheme:normal;}' +
        '.cord-embed.is-ready iframe{opacity:1;}' +
        '.cord-embed-skeleton{position:absolute;inset:0;border-radius:18px;overflow:hidden;' +
        'background:#fcfcfc;box-shadow:inset 0 0 0 1px rgba(10,25,47,.06);}' +
        '.cord-embed.is-ready .cord-embed-skeleton{opacity:0;transition:opacity .3s ease;pointer-events:none;}' +
        '.cord-embed-shimmer{position:absolute;inset:0;background:linear-gradient(100deg,' +
        'transparent 20%,rgba(10,25,47,.05) 40%,rgba(10,25,47,.07) 50%,rgba(10,25,47,.05) 60%,transparent 80%);' +
        'background-size:200% 100%;' + (REDUCED ? '' : 'animation:cord-shimmer 1.4s infinite linear;') + '}' +
        '@keyframes cord-shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}';
    const st = document.createElement('style');
    st.id = STYLE_ID;
    st.textContent = css;
    (document.head || document.documentElement).appendChild(st);
}

/**
 * Monta el cotizador dentro de `target`. Devuelve un controller con destroy().
 */
export function mountCotizador(target: HTMLElement, opts: CordElementOptions): CordController {
    if (!target) throw new Error('[Cord] target inválido');
    if (!opts || !opts.token) throw new Error('[Cord] falta opts.token');

    const base = (opts.baseUrl || DEFAULT_BASE).replace(/\/$/, '');
    const origin = (() => { try { return new URL(base).origin; } catch { return base; } })();
    const minH = typeof opts.minHeight === 'number' && opts.minHeight > 0 ? opts.minHeight : 420;

    injectStyles();
    target.classList.add('cord-embed');

    const skeleton = document.createElement('div');
    skeleton.className = 'cord-embed-skeleton';
    skeleton.innerHTML = '<div class="cord-embed-shimmer"></div>';
    target.appendChild(skeleton);

    const appearanceQuery = opts.appearance ? '?appearance=' + encodeURIComponent(JSON.stringify(opts.appearance)) : '';

    const iframe = document.createElement('iframe');
    iframe.src = base + '/embed/' + encodeURIComponent(opts.token) + appearanceQuery;
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
        if (!data || data.source !== 'cord' || !data.type) return;
        if (iframe.contentWindow && ev.source !== iframe.contentWindow) return;

        if (data.type === 'cord:resize' && data.height) {
            iframe.style.height = data.height + 'px';
            return;
        }
        if (data.type === 'cord:ready') reveal();

        const detail: CordEventDetail = data.detail || {};
        if (opts.onEvent) opts.onEvent(data.type, detail);
        switch (data.type) {
            case 'cord:ready':    opts.onReady?.(); break;
            case 'cord:approved': opts.onApproved?.(detail); break;
            case 'cord:rejected': opts.onRejected?.(detail); break;
            case 'cord:message':  opts.onMessage?.(detail); break;
            case 'cord:pay':      opts.onPay?.(detail); break;
        }
    };
    window.addEventListener('message', onMessage);

    // Fallback: si no llega 'cord:ready', revela al cargar el iframe.
    const onLoad = () => window.setTimeout(reveal, 250);
    iframe.addEventListener('load', onLoad);

    return {
        el: target,
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

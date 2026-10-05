// Loader para sitios sin bundler (Webflow, WordPress, HTML): monta el cotizador
// en cada [data-cord-token], también en los que se inyecten después, y re-emite
// los eventos `cord:*` sobre el div anfitrión. Es la fuente de public/embed.js y
// de @flouviahq/elements/webflow: una sola implementación sobre mountCotizador.
//
//   <script src="https://cordhq.app/embed.js" async></script>
//   <div data-cord-token="abc123"></div>
//
// Atributos: data-cord-token (requerido), data-cord-base-url, data-cord-min-height,
// data-cord-appearance (JSON). Legacy, sin usar en integraciones nuevas:
// data-cord-cotizador + data-token / data-base / data-min-height.
import { mountCotizador } from './core.js';
import type { CordAppearance, CordController } from './types.js';

export const MOUNT_SELECTOR = '[data-cord-token], [data-cord-cotizador]';

const controllers = new WeakMap<Element, CordController>();

function attr(el: Element, ...names: string[]): string | undefined {
    for (const n of names) {
        const v = el.getAttribute(n);
        if (v) return v;
    }
    return undefined;
}

export function mountElement(el: Element): CordController | null {
    if (controllers.has(el)) return controllers.get(el)!;
    const token = attr(el, 'data-cord-token', 'data-token');
    if (!token) return null;
    const minHeight = Number(attr(el, 'data-cord-min-height', 'data-min-height')) || undefined;
    let appearance: CordAppearance | undefined;
    const rawAppearance = el.getAttribute('data-cord-appearance');
    if (rawAppearance) {
        try { appearance = JSON.parse(rawAppearance); } catch { console.warn('[Cord] data-cord-appearance no es JSON válido.'); }
    }
    const host = el as HTMLElement;
    const controller = mountCotizador(host, {
        token,
        baseUrl: attr(el, 'data-cord-base-url', 'data-base'),
        minHeight,
        appearance,
        onEvent: (event) => host.dispatchEvent(new CustomEvent(event.type, { detail: event.detail, bubbles: true })),
    });
    controllers.set(el, controller);
    el.setAttribute('data-cord-mounted', 'true');
    return controller;
}

export function mountAll(root: ParentNode = document): void {
    root.querySelectorAll(MOUNT_SELECTOR).forEach((el) => { mountElement(el); });
}

export function unmountElement(el: Element): void {
    controllers.get(el)?.destroy();
    controllers.delete(el);
    el.removeAttribute('data-cord-mounted');
}

let observer: MutationObserver | null = null;

/** Monta lo que ya existe y observa lo que se agregue después (SPAs, modales). */
export function startLoader(): void {
    if (typeof document === 'undefined') return;
    const go = () => {
        mountAll();
        if (observer || typeof MutationObserver === 'undefined') return;
        observer = new MutationObserver((mutations) => {
            for (const m of mutations) {
                m.addedNodes.forEach((n) => {
                    if (n.nodeType !== 1) return;
                    const el = n as Element;
                    if (el.matches(MOUNT_SELECTOR)) mountElement(el);
                    mountAll(el);
                });
                m.removedNodes.forEach((n) => {
                    if (n.nodeType !== 1) return;
                    const el = n as Element;
                    if (controllers.has(el)) unmountElement(el);
                    el.querySelectorAll?.(MOUNT_SELECTOR).forEach((inner) => { if (controllers.has(inner)) unmountElement(inner); });
                });
            }
        });
        observer.observe(document.documentElement, { childList: true, subtree: true });
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go, { once: true });
    else go();
}

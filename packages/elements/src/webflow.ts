// @flouviahq/elements/webflow: loader para Webflow y sitios sin bundler. Al
// importarse en el navegador monta cada [data-cord-token] (ver src/loader.ts).
import { mountAll, mountElement, unmountElement, startLoader } from './loader.js';

/** Monta manualmente (por ejemplo, tras inyectar HTML). */
export function initWebflow(root?: ParentNode) {
    mountAll(root);
}

export { mountElement, unmountElement };

if (typeof document !== 'undefined') startLoader();

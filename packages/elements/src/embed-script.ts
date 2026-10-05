// Fuente de public/embed.js. El origen de Cord sale del src de este mismo
// script, así funciona igual en producción, staging o self-host.
import { configureCord } from './config.js';
import { mountAll, mountElement, startLoader } from './loader.js';

declare global {
    interface Window { Cord?: { mount: (root?: ParentNode) => void; mountElement: typeof mountElement } }
}

(function () {
    const script = document.currentScript as HTMLScriptElement | null;
    try {
        if (script?.src) configureCord({ baseUrl: new URL(script.src).origin });
    } catch { /* se queda el origen por defecto */ }
    window.Cord = { ...(window.Cord || {}), mount: (root?: ParentNode) => mountAll(root), mountElement };
    startLoader();
})();

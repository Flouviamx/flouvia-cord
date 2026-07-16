import { mountCotizador } from './core.js';

/**
 * Auto-initialization script designed for Webflow and Vanilla sites.
 * Looks for elements with the `data-cord-token` attribute and mounts the cotizador.
 * 
 * Usage in Webflow:
 * 1. Add a Div Block.
 * 2. In Settings, add a Custom Attribute: Name: `data-cord-token`, Value: `your-token`
 * 3. Include this script in the page or site settings.
 */
function initWebflow() {
    const elements = document.querySelectorAll('[data-cord-token]');
    
    elements.forEach((el) => {
        // Skip if already mounted
        if (el.hasAttribute('data-cord-mounted')) return;
        
        const token = el.getAttribute('data-cord-token');
        if (!token) return;

        const baseUrl = el.getAttribute('data-cord-base-url') || undefined;
        const minHeightAttr = el.getAttribute('data-cord-min-height');
        const minHeight = minHeightAttr ? parseInt(minHeightAttr, 10) : undefined;

        mountCotizador(el as HTMLElement, {
            token,
            baseUrl,
            minHeight,
        });

        el.setAttribute('data-cord-mounted', 'true');
    });
}

// `document` no existe en SSR/Node (Next.js puede importar este módulo desde
// server components sin querer, o un bundler puede evaluarlo al analizar el
// árbol) — sin este guard, el simple `import` de este archivo tronaba con
// ReferenceError antes de que nadie llamara a nada.
if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initWebflow);
    } else {
        initWebflow();
    }
}

export { initWebflow };

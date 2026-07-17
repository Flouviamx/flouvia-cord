/* ============================================================================
 * CORD Elements — loader del cotizador embebible.
 *
 * Uso en el sitio de un tercero (una sola línea + un div):
 *
 *   <script src="https://cordhq.app/embed.js" async></script>
 *   <div data-cord-token="abc123"></div>
 *
 * El loader inyecta un <iframe> a /embed/{token}, muestra un skeleton mientras
 * carga, ajusta la altura sola (postMessage 'cord:resize') y re-emite los
 * eventos del cotizador como CustomEvents sobre el <div> anfitrión:
 *
 *   document.querySelector('[data-cord-token]')
 *     .addEventListener('cord:approved', (e) => console.log(e.detail));
 *
 * Atributos opcionales del <div>:
 *   data-cord-token       (requerido) token público de la cotización
 *   data-cord-base-url    origen alterno (self-host / staging)
 *   data-cord-min-height  alto inicial del skeleton en px (default 420)
 *
 * Mismo vocabulario `data-cord-*` que usa el loader de Webflow (src/webflow.ts).
 *
 * ⚠️ Vocabulario LEGACY (sigue funcionando, no lo uses en integraciones nuevas):
 *   data-cord-cotizador (marcador) + data-token / data-base / data-min-height
 *
 * Eventos: cord:ready · cord:viewed · cord:approved · cord:signed ·
 *          cord:rejected · cord:message · cord:item_comment · cord:pay
 * ========================================================================== */
(function () {
    'use strict';

    var REDUCED = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // Origen de Cord: derivado del src de ESTE script (funciona en prod y en dev).
    var ORIGIN = (function () {
        try {
            var s = document.currentScript || (function () {
                var all = document.getElementsByTagName('script');
                return all[all.length - 1];
            })();
            return new URL(s.src).origin;
        } catch (e) {
            return 'https://cordhq.app';
        }
    })();

    // Inyecta una sola vez los estilos del skeleton/transición.
    function injectStyles() {
        if (document.getElementById('cord-embed-style')) return;
        var css =
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
        var st = document.createElement('style');
        st.id = 'cord-embed-style';
        st.textContent = css;
        (document.head || document.documentElement).appendChild(st);
    }

    function mount(el) {
        if (el.__cordMounted) return;
        el.__cordMounted = true;

        // data-cord-token es el vocabulario canónico (igual que webflow.ts);
        // data-token (sin el marcador data-cord-cotizador) queda como alias
        // legacy para no romper embeds ya publicados en sitios de clientes.
        var token = el.getAttribute('data-cord-token') || el.getAttribute('data-token');
        if (!token) {
            console.warn('[Cord] Falta data-cord-token en', el);
            return;
        }
        injectStyles();

        // Permite apuntar a otro origen (self-host / staging).
        var base = el.getAttribute('data-cord-base-url') || el.getAttribute('data-base') || ORIGIN;
        var minH = parseInt(el.getAttribute('data-cord-min-height') || el.getAttribute('data-min-height') || '420', 10);

        el.classList.add('cord-embed');

        // Skeleton mientras carga (evita el salto / caja vacía).
        var skeleton = document.createElement('div');
        skeleton.className = 'cord-embed-skeleton';
        skeleton.innerHTML = '<div class="cord-embed-shimmer"></div>';
        el.appendChild(skeleton);

        // parentOrigin: deja que /embed/{token} use un targetOrigin real en su
        // postMessage (no siempre '*') cuando coincide con la allowlist de
        // orgs.embed_domains — mismo gate que ya protege frame-ancestors.
        var iframeQuery = '?parentOrigin=' + encodeURIComponent(window.location.origin);
        var iframe = document.createElement('iframe');
        iframe.src = base + '/embed/' + encodeURIComponent(token) + iframeQuery;
        iframe.setAttribute('title', 'Cotización');
        iframe.setAttribute('loading', 'lazy');
        iframe.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
        // 'payment' habilita Stripe dentro del iframe; 'clipboard-write' por si se copia.
        iframe.setAttribute('allow', 'payment; clipboard-write');
        iframe.style.height = (minH > 0 ? minH : 420) + 'px';
        el.appendChild(iframe);
        el.__cordIframe = iframe;

        // Marca como listo: revela el iframe y oculta el skeleton.
        el.__cordReveal = function () {
            if (el.__cordReady) return;
            el.__cordReady = true;
            el.classList.add('is-ready');
            setTimeout(function () { if (skeleton.parentNode) skeleton.parentNode.removeChild(skeleton); }, 400);
        };
        // Fallback: si por alguna razón no llega 'cord:ready', revela al cargar.
        iframe.addEventListener('load', function () { setTimeout(el.__cordReveal, 250); });
    }

    // Un solo listener global despacha al iframe correcto por contentWindow.
    window.addEventListener('message', function (ev) {
        if (ev.origin !== ORIGIN) return;
        var data = ev.data;
        if (!data || data.source !== 'cord' || !data.type) return;

        // Localiza el host cuyo iframe envió el mensaje.
        var hosts = document.querySelectorAll('.cord-embed');
        var host = null;
        for (var i = 0; i < hosts.length; i++) {
            if (hosts[i].__cordIframe && hosts[i].__cordIframe.contentWindow === ev.source) {
                host = hosts[i];
                break;
            }
        }
        if (!host) return;

        if (data.type === 'cord:resize' && data.height) {
            host.__cordIframe.style.height = data.height + 'px';
            return;
        }
        if (data.type === 'cord:ready' && host.__cordReveal) {
            host.__cordReveal();
        }
        // Re-emite todo como CustomEvent sobre el div anfitrión.
        host.dispatchEvent(new CustomEvent(data.type, { detail: data.detail || {}, bubbles: true }));
    });

    // Selector combinado: vocabulario canónico [data-cord-token] + el legacy
    // [data-cord-cotizador] (sin data-cord-token propio, para no montar dos
    // veces un mismo elemento que ya tenga ambos por error de copiar-pegar).
    var MOUNT_SELECTOR = '[data-cord-token], [data-cord-cotizador]';

    function init() {
        var els = document.querySelectorAll(MOUNT_SELECTOR);
        for (var i = 0; i < els.length; i++) mount(els[i]);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // Auto-monta cotizadores inyectados DESPUÉS de la carga (SPAs, modales…).
    if ('MutationObserver' in window) {
        var mo = new MutationObserver(function (muts) {
            for (var i = 0; i < muts.length; i++) {
                var added = muts[i].addedNodes;
                for (var j = 0; j < added.length; j++) {
                    var n = added[j];
                    if (n.nodeType !== 1) continue;
                    if (n.matches && n.matches(MOUNT_SELECTOR)) mount(n);
                    if (n.querySelectorAll) {
                        var inner = n.querySelectorAll(MOUNT_SELECTOR);
                        for (var k = 0; k < inner.length; k++) mount(inner[k]);
                    }
                }
            }
        });
        mo.observe(document.documentElement, { childList: true, subtree: true });
    }

    // Expuesto por si el host quiere montar manualmente.
    window.Cord = window.Cord || {};
    window.Cord.mount = init;
})();

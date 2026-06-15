/* ============================================================================
 * TRATO Elements — loader del cotizador embebible.
 *
 * Uso en el sitio de un tercero (una sola línea + un div):
 *
 *   <script src="https://trato.flouvia.com/embed.js" async></script>
 *   <div data-trato-cotizador data-token="abc123"></div>
 *
 * El loader inyecta un <iframe> a /embed/{token}, ajusta su altura sola
 * (postMessage 'trato:resize') y re-emite los eventos del cotizador como
 * CustomEvents sobre el <div> anfitrión, para que el sitio pueda reaccionar:
 *
 *   document.querySelector('[data-trato-cotizador]')
 *     .addEventListener('trato:approved', (e) => console.log(e.detail));
 *
 * Eventos: trato:ready · trato:approved · trato:rejected · trato:message · trato:pay
 * ========================================================================== */
(function () {
    'use strict';

    // Origen de Trato: derivado del src de ESTE script (funciona en prod y en dev).
    var ORIGIN = (function () {
        try {
            var s = document.currentScript || (function () {
                var all = document.getElementsByTagName('script');
                return all[all.length - 1];
            })();
            return new URL(s.src).origin;
        } catch (e) {
            return 'https://trato.flouvia.com';
        }
    })();

    function mount(el) {
        if (el.__tratoMounted) return;
        el.__tratoMounted = true;

        var token = el.getAttribute('data-token');
        if (!token) {
            console.warn('[Trato] Falta data-token en', el);
            return;
        }
        // Permite apuntar a otro origen (self-host / staging) con data-base.
        var base = el.getAttribute('data-base') || ORIGIN;

        var iframe = document.createElement('iframe');
        iframe.src = base + '/embed/' + encodeURIComponent(token);
        iframe.setAttribute('title', 'Cotización');
        iframe.setAttribute('loading', 'lazy');
        // 'payment' habilita Stripe dentro del iframe; 'clipboard-write' por si se copia.
        iframe.setAttribute('allow', 'payment; clipboard-write');
        iframe.style.cssText =
            'width:100%;border:0;display:block;background:transparent;' +
            'height:600px;transition:height .2s ease;color-scheme:normal;';
        el.appendChild(iframe);
        el.__tratoIframe = iframe;
    }

    // Un solo listener global despacha al iframe correcto por contentWindow.
    window.addEventListener('message', function (ev) {
        if (ev.origin !== ORIGIN) return;
        var data = ev.data;
        if (!data || data.source !== 'trato' || !data.type) return;

        // Localiza el host cuyo iframe envió el mensaje.
        var hosts = document.querySelectorAll('[data-trato-cotizador]');
        var host = null;
        for (var i = 0; i < hosts.length; i++) {
            if (hosts[i].__tratoIframe && hosts[i].__tratoIframe.contentWindow === ev.source) {
                host = hosts[i];
                break;
            }
        }
        if (!host) return;

        if (data.type === 'trato:resize' && data.height) {
            host.__tratoIframe.style.height = data.height + 'px';
            return;
        }
        // Re-emite el resto como CustomEvent sobre el div anfitrión.
        host.dispatchEvent(new CustomEvent(data.type, { detail: data.detail || {}, bubbles: true }));
    });

    function init() {
        var els = document.querySelectorAll('[data-trato-cotizador]');
        for (var i = 0; i < els.length; i++) mount(els[i]);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // Expuesto por si el host inyecta cotizadores dinámicamente después.
    window.Trato = window.Trato || {};
    window.Trato.mount = init;
})();

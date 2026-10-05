// Barra de depuración de Cord Elements (debug: true). Muestra en tu sitio lo que
// pasa entre tu página, el iframe y la API: eventos, peticiones con su request
// id y avisos de configuración. Vive en un Shadow DOM, solo usa textContent (nada
// de HTML inyectado) y no se dibuja con una llave en vivo.

export type DebugKind = 'event' | 'request' | 'warning' | 'error';

interface Entry { at: Date; kind: DebugKind; summary: string; detail?: string }

const MAX = 80;
const entries: Entry[] = [];
const listeners = new Set<() => void>();
let enabled = false;

export type DebugLocale = 'es' | 'en';

const TEXT = {
    es: {
        title: 'Cord · modo prueba', label: 'Depuración de Cord', clear: 'Limpiar', hide: 'Ocultar', show: 'Mostrar',
        empty: 'Sin actividad todavía.',
        liveKey: '[Cord] debug está activo con una llave en vivo: la barra de depuración solo se muestra con pk_test_.',
        testKeyHost: (host: string) => `Llave de prueba en ${host}: las cotizaciones van a la sandbox, no a tu cuenta real.`,
        appearanceDropped: (keys: string) => `appearance descartado: ${keys}`,
        appearanceDroppedConsole: (keys: string) => `[Cord] appearance: Cord descarta estos valores por no ser válidos: ${keys}.`,
        appearanceTooBig: 'appearance excede el límite de tamaño y se ignora',
        appearanceTooBigConsole: (size: number, max: number) => `[Cord] appearance pesa ${size} bytes; el límite es ${max} y Cord lo ignora completo.`,
    },
    en: {
        title: 'Cord · test mode', label: 'Cord debugging', clear: 'Clear', hide: 'Hide', show: 'Show',
        empty: 'No activity yet.',
        liveKey: '[Cord] debug is on with a live key: the debug bar only shows with pk_test_.',
        testKeyHost: (host: string) => `Test key on ${host}: quotes go to the sandbox, not your real account.`,
        appearanceDropped: (keys: string) => `appearance dropped: ${keys}`,
        appearanceDroppedConsole: (keys: string) => `[Cord] appearance: Cord drops these values because they are not valid: ${keys}.`,
        appearanceTooBig: 'appearance exceeds the size limit and is ignored',
        appearanceTooBigConsole: (size: number, max: number) => `[Cord] appearance is ${size} bytes; the limit is ${max} and Cord ignores all of it.`,
    },
};

let localeOverride: DebugLocale | null = null;

/** Idioma de la barra. Sin uno explícito (el locale del Provider) sigue el lang de tu página. */
export function setDebugLocale(locale: DebugLocale): void {
    localeOverride = locale;
    for (const l of listeners) l();
}

export function debugText() {
    if (localeOverride) return TEXT[localeOverride];
    const lang = typeof document !== 'undefined' ? document.documentElement.lang : '';
    return TEXT[/^en\b/i.test(lang) ? 'en' : 'es'];
}

export function isDebugEnabled(): boolean {
    return enabled;
}

/** Activa la barra. Con una pk_live_ solo avisa por consola: no se depura producción en la cara del cliente. */
export function enableDebug(publishableKey?: string): void {
    if (typeof document === 'undefined') return;
    if (publishableKey?.startsWith('pk_live_')) {
        console.warn(debugText().liveKey);
        return;
    }
    // Sin llave con qué decidir (Web Component, embed.js): solo en tu máquina o
    // pidiéndolo en la URL, para que un atributo olvidado no la muestre a tus clientes.
    if (!publishableKey && typeof location !== 'undefined') {
        const local = /^(localhost|127\.0\.0\.1|\[::1\])$|\.localhost$/.test(location.hostname);
        if (!local && !new URLSearchParams(location.search).has('cord_debug')) return;
    }
    enabled = true;
    mountPanel();
}

export function debugLog(kind: DebugKind, summary: string, detail?: unknown): void {
    if (!enabled) return;
    entries.unshift({ at: new Date(), kind, summary: summary.slice(0, 300), detail: detail === undefined ? undefined : safeJson(detail) });
    if (entries.length > MAX) entries.length = MAX;
    for (const l of listeners) l();
}

function safeJson(v: unknown): string {
    try { return JSON.stringify(v, null, 2).slice(0, 4000); } catch { return String(v); }
}

const CSS = `
:host{all:initial;position:fixed;right:16px;bottom:16px;z-index:2147483646;font:12px/1.4 ui-monospace,SFMono-Regular,Menlo,monospace;color:#0a192f}
.panel{width:min(420px,calc(100vw - 32px));max-height:min(60vh,520px);display:flex;flex-direction:column;background:#fff;border-radius:16px;box-shadow:0 12px 40px rgba(10,25,47,.18),0 2px 8px rgba(10,25,47,.08);overflow:hidden}
.head{display:flex;align-items:center;gap:8px;padding:10px 12px;background:#0a192f;color:#fff}
.head strong{flex:1;font-weight:600}
button{all:unset;cursor:pointer;padding:4px 8px;border-radius:8px;background:rgba(255,255,255,.12);color:#fff}
button:focus-visible{outline:2px solid #fff}
.list{overflow:auto;padding:4px 0}
.row{padding:6px 12px;border-bottom:1px solid rgba(10,25,47,.06)}
.meta{display:flex;gap:8px;color:#6b7280}
.k-error .sum,.k-warning .sum{color:#8e2a1f}
pre{margin:4px 0 0;white-space:pre-wrap;word-break:break-word;color:#374151;max-height:160px;overflow:auto}
.closed .list{display:none}
.empty{padding:12px;color:#6b7280}
`;

function mountPanel() {
    if (document.querySelector('cord-debug-panel') || typeof customElements === 'undefined') return;
    if (!customElements.get('cord-debug-panel')) {
        customElements.define('cord-debug-panel', class extends HTMLElement {
            connectedCallback() {
                const root = this.attachShadow({ mode: 'open' });
                const style = document.createElement('style');
                style.textContent = CSS;
                const panel = document.createElement('div');
                panel.className = 'panel';
                panel.setAttribute('role', 'log');
                panel.setAttribute('aria-label', debugText().label);
                const head = document.createElement('div');
                head.className = 'head';
                const title = document.createElement('strong');
                const clear = document.createElement('button');
                clear.type = 'button';
                const toggle = document.createElement('button');
                toggle.type = 'button';
                const labels = () => {
                    const t = debugText();
                    title.textContent = t.title;
                    clear.textContent = t.clear;
                    toggle.textContent = panel.classList.contains('closed') ? t.show : t.hide;
                    panel.setAttribute('aria-label', t.label);
                };
                head.append(title, clear, toggle);
                const list = document.createElement('div');
                list.className = 'list';
                panel.append(head, list);
                root.append(style, panel);

                const render = () => {
                    labels();
                    list.textContent = '';
                    if (!entries.length) {
                        const empty = document.createElement('div');
                        empty.className = 'empty';
                        empty.textContent = debugText().empty;
                        list.append(empty);
                        return;
                    }
                    for (const e of entries) {
                        const row = document.createElement('div');
                        row.className = `row k-${e.kind}`;
                        const meta = document.createElement('div');
                        meta.className = 'meta';
                        meta.textContent = `${e.at.toLocaleTimeString()} · ${e.kind}`;
                        const sum = document.createElement('div');
                        sum.className = 'sum';
                        sum.textContent = e.summary;
                        row.append(meta, sum);
                        if (e.detail) {
                            const pre = document.createElement('pre');
                            pre.textContent = e.detail;
                            row.append(pre);
                        }
                        list.append(row);
                    }
                };
                clear.addEventListener('click', () => { entries.length = 0; render(); });
                toggle.addEventListener('click', () => {
                    panel.classList.toggle('closed');
                    labels();
                });
                listeners.add(render);
                render();
            }
        });
    }
    document.body.appendChild(document.createElement('cord-debug-panel'));
}

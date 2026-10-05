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

export function isDebugEnabled(): boolean {
    return enabled;
}

/** Activa la barra. Con una pk_live_ solo avisa por consola: no se depura producción en la cara del cliente. */
export function enableDebug(publishableKey?: string): void {
    if (typeof document === 'undefined') return;
    if (publishableKey?.startsWith('pk_live_')) {
        console.warn('[Cord] debug está activo con una llave en vivo: la barra de depuración solo se muestra con pk_test_.');
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
                panel.setAttribute('aria-label', 'Cord debug');
                const head = document.createElement('div');
                head.className = 'head';
                const title = document.createElement('strong');
                title.textContent = 'Cord · modo prueba';
                const clear = document.createElement('button');
                clear.textContent = 'Limpiar';
                const toggle = document.createElement('button');
                toggle.textContent = 'Ocultar';
                head.append(title, clear, toggle);
                const list = document.createElement('div');
                list.className = 'list';
                panel.append(head, list);
                root.append(style, panel);

                const render = () => {
                    list.textContent = '';
                    if (!entries.length) {
                        const empty = document.createElement('div');
                        empty.className = 'empty';
                        empty.textContent = 'Sin actividad todavía.';
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
                    toggle.textContent = panel.classList.contains('closed') ? 'Mostrar' : 'Ocultar';
                });
                listeners.add(render);
                render();
            }
        });
    }
    document.body.appendChild(document.createElement('cord-debug-panel'));
}

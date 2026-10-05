// Appearance API aplicado al cotizador embebido. Traduce las variables públicas,
// los selectores de `rules` y el layout al markup real de QuoteCard. Todo vive
// bajo `.embed-wrap[data-cord-appearance]`: sin appearance, la tarjeta no cambia.
// Cada variable cae al valor que esa superficie tiene hoy, así que una variable
// sin definir no altera nada.
import type { AppearanceSelector, SanitizedAppearance } from '../../packages/elements/src/appearance';

const ROOT = 'html .embed-wrap[data-cord-appearance]';

const v = (name: string, fallback: string) => `var(--cord-${name}, ${fallback})`;

export const SURFACE_CSS = `
${ROOT} .q-card {
  background: ${v('color-background', '#fff')};
  color: ${v('color-text', '#111')};
  padding: ${v('spacing-card', '2.8rem 3rem')};
  border-radius: ${v('border-radius', 'var(--brand-radius, 28px)')};
}
${ROOT} .q-card { box-shadow: var(--cord-shadow-card, 0 0 0 1px rgba(10,25,47,0.06), 0 4px 6px rgba(10,25,47,0.03), 0 20px 60px -20px rgba(10,25,47,0.12)); }
${ROOT} :is(.q-company, .q-folio-num, .qt-grand, .qt-grand .editorial, .q-msg.theirs, .q-msg.counter, .qi-name, .q-total-split) { color: ${v('color-text', '#111')}; }
${ROOT} .qi-row { border-bottom-color: ${v('color-border', 'rgba(10,25,47,0.045)')}; }
${ROOT} :is(.qi-head, .qt-grand) { border-color: ${v('color-border', 'rgba(10,25,47,0.07)')}; }
${ROOT} :is(.q-rfc, .q-folio-eyebrow, .qt-row .editorial, .q-notes, .ql-ghost, .ql-check-text, .q-demo-ribbon, .q-demo-ribbon-text svg, .q-contact-label) { color: ${v('color-text-secondary', '#6b7280')}; }
${ROOT} :is(.qt-row, .q-total-note) { color: ${v('color-text-placeholder', '#9ca3af')}; }
${ROOT} :is(.qi-head, .q-chat-eyebrow, .ql-legal-note) { color: ${v('color-text-placeholder', '#d1d5db')}; }
${ROOT} :is(.q-notes, .q-total-split) { background: ${v('color-surface', '#fafafa')}; border-color: ${v('color-border', 'rgba(10,25,47,0.055)')}; }
${ROOT} .q-msg.theirs { background: ${v('color-surface', '#f3f4f6')}; }
${ROOT} .ql-ghost { border-color: ${v('color-border', 'rgba(10,25,47,0.1)')}; border-radius: ${v('border-radius-button', '12px')}; }
${ROOT} .ql-cta:not(.ql-danger) { color: ${v('color-on-primary', 'var(--brand-on-primary, #fff)')}; border-radius: ${v('border-radius-button', 'var(--brand-button-radius, 14px)')}; font-weight: ${v('font-weight-bold', '600')}; }
${ROOT} .ql-cta.ql-danger { background: ${v('color-danger', '#ef4444')} !important; border-radius: ${v('border-radius-button', 'var(--brand-button-radius, 14px)')}; }
${ROOT} :is(.ql-error) { color: ${v('color-danger', '#ef4444')}; }
${ROOT} .ql-check-circle { stroke: ${v('color-success', '#10b981')}; }
${ROOT} .ql-input { background: ${v('color-input', '#fff')}; color: ${v('color-input-text', '#111')}; border-color: ${v('color-input-border', 'rgba(10,25,47,0.12)')}; border-radius: ${v('border-radius-input', '11px')}; }
${ROOT} .ql-input::placeholder { color: ${v('color-text-placeholder', '#9ca3af')}; }
${ROOT} .ql-input:focus { border-color: ${v('color-focus', 'rgba(10,25,47,0.35)')}; }
${ROOT} .q-msg.mine { background: ${v('color-primary', '#0a192f')}; color: ${v('color-on-primary', '#fff')}; }
${ROOT} .qi-row { font-size: ${v('font-size', '0.875rem')}; }
${ROOT} :is(.q-contact-link, .q-welcome, .q-total-hero, .ql-summary-pill, .q-compose, .qi-thread-inner, .q-demo-ribbon, .qd-pay, .q-readonly, .ql-partial, .ql-cobros, .ql-pay-transfer, .ql-credit-note) { background: ${v('color-surface', '#fafafa')}; border-color: ${v('color-border', 'rgba(10,25,47,0.06)')}; }
${ROOT} :is(.q-compose-ta, .q-compose-price, .qd-fake) { background: ${v('color-input', '#fff')}; color: ${v('color-input-text', '#111')}; border-color: ${v('color-input-border', 'rgba(10,25,47,0.12)')}; }
${ROOT} :is(.q-meta-val, .qi-total, .q-readonly-title, .ql-step-title, .ql-done-title, .ql-partial b, .ql-sub-copy strong, .ql-credit-text strong, .ql-cobro-tipo, .ql-cobro-monto, .ql-transfer-title, .ql-transfer-row strong, .q-contact-link, .qd-pay-intro strong, .qd-kv-row strong, .qd-pay-ok strong, .q-total-split) { color: ${v('color-text', '#111')}; }
`;

// Selectores públicos → markup interno. Un selector nuevo se agrega aquí y en
// APPEARANCE_SELECTORS del paquete; nunca se acepta un selector libre.
export const SELECTOR_MAP: Record<AppearanceSelector, string> = {
    Card: '.q-card',
    Header: '.q-header, .brand-header',
    Total: '.q-total-amount',
    Table: '.q-items',
    Row: '.qi-row',
    SummaryRow: '.qt-row',
    Notes: '.q-notes',
    Button: '.ql-cta:not(.ql-danger)',
    'Button:hover': '.ql-cta:not(.ql-danger):hover:not(:disabled)',
    ButtonSecondary: '.ql-ghost',
    'ButtonSecondary:hover': '.ql-ghost:hover',
    Input: '.ql-input',
    'Input:focus': '.ql-input:focus',
    Chat: '.q-chat',
    Bubble: '.q-msg.theirs, .qi-msg:not(.mine)',
    'Bubble--mine': '.q-msg.mine, .qi-msg.mine',
};

export function rulesCss(rules: SanitizedAppearance['rules']): string {
    return rules.map(({ selector, declarations }) => {
        const targets = SELECTOR_MAP[selector].split(',').map((s) => `${ROOT} ${s.trim()}`).join(', ');
        // !important porque el color primario llega como estilo inline; cada valor ya pasó la gramática.
        return `${targets} {\n${declarations.map(([p, val]) => `  ${p}: ${val} !important;`).join('\n')}\n}\n`;
    }).join('');
}

export function layoutCss(layout: SanitizedAppearance['layout']): string {
    let css = '';
    if (layout.compact) css += `${ROOT} .q-card { padding: 1.6rem 1.8rem; gap: 1.3rem; }\n`;
    if (layout.hideChat) css += `${ROOT} :is(.q-chat, .qi-chat-btn, .qi-thread) { display: none !important; }\n`;
    if (layout.hideNotes) css += `${ROOT} .q-notes { display: none !important; }\n`;
    return css;
}

export function embedAppearanceCss(a: SanitizedAppearance): string {
    return SURFACE_CSS + rulesCss(a.rules) + layoutCss(a.layout);
}

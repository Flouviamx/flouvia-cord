// Validador único del Appearance API. Lo usan el servidor (/embed/[token]) y el
// SDK: todo valor que termina en CSS pasa por aquí, con listas cerradas de
// claves, selectores y propiedades, y una gramática por tipo. Lo que no encaja
// se descarta y se reporta; nunca se copia texto libre a una hoja de estilos.

export type AppearanceTheme = 'light' | 'dark' | 'auto' | 'flat';

type ValueKind = 'color' | 'length' | 'fontFamily' | 'fontWeight' | 'shadow' | 'textTransform' | 'borderStyle' | 'opacity' | 'spacing';

/** Variables públicas. Cada una la consume el embed y/o el Builder nativo. */
const VARIABLES: Record<string, ValueKind> = {
    colorPrimary: 'color',
    colorOnPrimary: 'color',
    colorBackground: 'color',
    colorSurface: 'color',
    colorText: 'color',
    colorTextSecondary: 'color',
    colorTextPlaceholder: 'color',
    colorBorder: 'color',
    colorDanger: 'color',
    colorSuccess: 'color',
    colorInput: 'color',
    colorInputText: 'color',
    colorInputBorder: 'color',
    colorFocus: 'color',
    fontFamily: 'fontFamily',
    fontSize: 'length',
    fontWeightBold: 'fontWeight',
    borderRadius: 'length',
    borderRadiusButton: 'length',
    borderRadiusInput: 'length',
    spacingCard: 'spacing',
    shadowCard: 'shadow',
};

export const APPEARANCE_VARIABLES = Object.keys(VARIABLES);

/** Selectores públicos de `rules`. El servidor los traduce a su markup interno. */
export const APPEARANCE_SELECTORS = [
    'Card', 'Header', 'Total', 'Table', 'Row', 'SummaryRow', 'Notes',
    'Button', 'Button:hover', 'ButtonSecondary', 'ButtonSecondary:hover',
    'Input', 'Input:focus', 'Chat', 'Bubble', 'Bubble--mine',
] as const;
export type AppearanceSelector = (typeof APPEARANCE_SELECTORS)[number];

const RULE_PROPERTIES: Record<string, ValueKind> = {
    color: 'color',
    'background-color': 'color',
    'border-color': 'color',
    'border-width': 'length',
    'border-style': 'borderStyle',
    'border-radius': 'length',
    'font-size': 'length',
    'font-weight': 'fontWeight',
    'letter-spacing': 'length',
    'text-transform': 'textTransform',
    padding: 'spacing',
    'box-shadow': 'shadow',
    opacity: 'opacity',
};

export const APPEARANCE_RULE_PROPERTIES = Object.keys(RULE_PROPERTIES);

const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.bunny.net'];
const MAX_FONTS = 4;
const MAX_RULES = 40;
export const MAX_APPEARANCE_BYTES = 8192;

const COLOR = /^(#[0-9a-f]{3,8}|(rgba?|hsla?|oklch|oklab|lab|lch)\([0-9a-z.,%/\s+-]{1,60}\)|[a-z]{3,20})$/i;
const LENGTH = /^(0|-?\d{1,3}(\.\d{1,3})?(px|rem|em|%))$/;
const FONT_FAMILY = /^[a-z0-9 ,'"-]{1,120}$/i;
const SPACING = /^(0|\d{1,3}(\.\d{1,3})?(px|rem|em))( (0|\d{1,3}(\.\d{1,3})?(px|rem|em))){0,3}$/;
const FORBIDDEN = /\\|@|javascript:|expression\(|url\(|!important|;|\{|\}|<|>/i;

function validValue(kind: ValueKind, value: string): boolean {
    if (FORBIDDEN.test(value)) return false;
    switch (kind) {
        case 'color': return COLOR.test(value);
        case 'length': return LENGTH.test(value);
        case 'fontFamily': return FONT_FAMILY.test(value);
        case 'fontWeight': return /^(normal|bold|[1-9]00)$/.test(value);
        case 'shadow': return value === 'none' || value === 'default';
        case 'textTransform': return /^(none|uppercase|lowercase|capitalize)$/.test(value);
        case 'borderStyle': return /^(none|solid|dashed|dotted)$/.test(value);
        case 'opacity': return /^(0(\.\d{1,3})?|1(\.0{1,3})?)$/.test(value);
        case 'spacing': return SPACING.test(value);
    }
}

function fontUrl(src: unknown): string | null {
    if (typeof src !== 'string' || src.length > 512) return null;
    let u: URL;
    try { u = new URL(src); } catch { return null; }
    if (u.protocol !== 'https:' || !FONT_HOSTS.includes(u.hostname)) return null;
    if (!/^\/css2?$/.test(u.pathname) || u.username || u.password || u.hash) return null;
    const href = u.href;
    return /['"()\\\s]/.test(href) ? null : href;
}

export function cssVariableName(key: string): string {
    return `--cord-${key.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase())}`;
}

export interface AppearanceLayout {
    /** Menos aire en la tarjeta del embed. */
    compact: boolean;
    hideChat: boolean;
    hideNotes: boolean;
}

export interface SanitizedAppearance {
    theme: AppearanceTheme;
    variables: Array<[string, string]>;
    fontImports: string[];
    rules: Array<{ selector: AppearanceSelector; declarations: Array<[string, string]> }>;
    layout: AppearanceLayout;
    rejected: string[];
}

export function sanitizeAppearance(input: unknown): SanitizedAppearance {
    const out: SanitizedAppearance = {
        theme: 'light', variables: [], fontImports: [], rules: [],
        layout: { compact: false, hideChat: false, hideNotes: false }, rejected: [],
    };
    if (!input || typeof input !== 'object') return out;
    const a = input as Record<string, any>;

    if (a.theme === 'dark' || a.theme === 'light' || a.theme === 'auto' || a.theme === 'flat') out.theme = a.theme;
    else if (a.theme === 'night') out.theme = 'dark';
    else if (a.theme !== undefined) out.rejected.push('theme');

    let fontFamily: string | undefined;
    if (a.variables && typeof a.variables === 'object') {
        for (const [key, raw] of Object.entries(a.variables as Record<string, unknown>)) {
            const kind = VARIABLES[key];
            const value = typeof raw === 'string' ? raw.trim() : '';
            if (!kind || !value || !validValue(kind, value)) {
                if (raw !== undefined) out.rejected.push(`variables.${key}`);
                continue;
            }
            if (key === 'fontFamily') fontFamily = value;
            else out.variables.push([cssVariableName(key), value]);
        }
    }

    if (Array.isArray(a.fonts)) {
        a.fonts.slice(0, MAX_FONTS).forEach((f: any, i: number) => {
            const href = fontUrl(f?.cssSrc);
            if (href) out.fontImports.push(href);
            else out.rejected.push(`fonts.${i}`);
        });
        if (!fontFamily && out.fontImports[0]) {
            const fam = new URL(out.fontImports[0]).searchParams.get('family')?.split(':')[0];
            if (fam && FONT_FAMILY.test(fam)) fontFamily = fam;
        }
    }
    if (fontFamily) out.variables.push(['--cord-font-family', fontFamily]);

    if (a.rules && typeof a.rules === 'object') {
        for (const [selector, decls] of Object.entries(a.rules as Record<string, unknown>).slice(0, MAX_RULES)) {
            if (!(APPEARANCE_SELECTORS as readonly string[]).includes(selector) || !decls || typeof decls !== 'object') {
                out.rejected.push(`rules.${selector}`);
                continue;
            }
            const declarations: Array<[string, string]> = [];
            for (const [prop, raw] of Object.entries(decls as Record<string, unknown>)) {
                const kind = RULE_PROPERTIES[prop];
                const value = typeof raw === 'string' ? raw.trim() : typeof raw === 'number' ? String(raw) : '';
                if (!kind || !value || !validValue(kind, value)) {
                    out.rejected.push(`rules.${selector}.${prop}`);
                    continue;
                }
                if (kind === 'shadow' && value === 'default') continue;
                declarations.push([prop, value]);
            }
            if (declarations.length) out.rules.push({ selector: selector as AppearanceSelector, declarations });
        }
    }

    if (a.layout && typeof a.layout === 'object') {
        for (const key of ['compact', 'hideChat', 'hideNotes'] as const) {
            if (a.layout[key] === true) out.layout[key] = true;
            else if (a.layout[key] !== undefined && a.layout[key] !== false) out.rejected.push(`layout.${key}`);
        }
    }

    return out;
}

/** Paleta oscura completa: el modo oscuro cambia la tarjeta entera, no solo el texto. */
export const DARK_PALETTE: Array<[string, string]> = [
    ['--cord-color-background', '#111827'],
    ['--cord-color-surface', '#1f2937'],
    ['--cord-color-text', '#f3f4f6'],
    ['--cord-color-text-secondary', '#d1d5db'],
    ['--cord-color-text-placeholder', '#9ca3af'],
    ['--cord-color-border', 'rgba(255,255,255,0.12)'],
    ['--cord-color-input', '#1f2937'],
    ['--cord-color-input-text', '#f3f4f6'],
    ['--cord-color-input-border', 'rgba(255,255,255,0.18)'],
    ['--cord-color-focus', 'rgba(255,255,255,0.35)'],
];

const FLAT_PRESET: Array<[string, string]> = [
    ['--cord-shadow-card', 'none'],
    ['--cord-color-border', 'rgba(10,25,47,0.12)'],
];

/**
 * Variables como CSS sobre `selector`. El tema va antes que las variables del
 * usuario, que siempre ganan. `shadowCard: default` se traduce a "sin
 * variable" para conservar la sombra de Cord.
 */
export function appearanceToCss(a: SanitizedAppearance, selector = ':root'): string {
    const block = (vars: Array<[string, string]>) => `${selector} {\n${vars.map(([k, v]) => `  ${k}: ${v};`).join('\n')}\n}\n`;
    let css = a.fontImports.map((href) => `@import url('${href}');\n`).join('');
    if (a.theme === 'dark') css += block(DARK_PALETTE);
    if (a.theme === 'auto') css += `@media (prefers-color-scheme: dark) {\n${block(DARK_PALETTE)}}\n`;
    if (a.theme === 'flat') css += block(FLAT_PRESET);
    const vars = a.variables.filter(([k, v]) => !(k === '--cord-shadow-card' && v === 'default'));
    if (a.theme === 'dark' || a.theme === 'auto') vars.push(['color-scheme', a.theme === 'dark' ? 'dark' : 'light dark']);
    if (vars.length) css += block(vars);
    return css;
}

// Validador único del Appearance API. Lo usan el servidor (/embed/[token]) y el
// SDK: todo valor que termina en CSS pasa por aquí, con una lista cerrada de
// claves y una gramática por tipo. Lo que no encaja se descarta y se reporta.

export type AppearanceTheme = 'light' | 'dark' | 'auto';

type ValueKind = 'color' | 'length' | 'fontFamily';

const VARIABLES: Record<string, ValueKind> = {
    colorPrimary: 'color',
    colorBackground: 'color',
    colorText: 'color',
    colorTextSecondary: 'color',
    colorBorder: 'color',
    colorDanger: 'color',
    fontFamily: 'fontFamily',
    fontSize: 'length',
    borderRadius: 'length',
};

export const APPEARANCE_VARIABLES = Object.keys(VARIABLES);

const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.bunny.net'];
const MAX_FONTS = 4;
export const MAX_APPEARANCE_BYTES = 4096;

const COLOR = /^(#[0-9a-f]{3,8}|(rgba?|hsla?|oklch|oklab|lab|lch)\([0-9a-z.,%/\s+-]{1,60}\)|[a-z]{3,20})$/i;
const LENGTH = /^(0|\d{1,3}(\.\d{1,3})?(px|rem|em|%))$/;
const FONT_FAMILY = /^[a-z0-9 ,'"-]{1,120}$/i;
const FORBIDDEN = /\\|@|javascript:|expression\(/i;

function validValue(kind: ValueKind, value: string): boolean {
    if (FORBIDDEN.test(value)) return false;
    if (kind === 'color') return COLOR.test(value);
    if (kind === 'length') return LENGTH.test(value);
    return FONT_FAMILY.test(value);
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

export interface SanitizedAppearance {
    theme: AppearanceTheme;
    variables: Array<[string, string]>;
    fontImports: string[];
    rejected: string[];
}

export function sanitizeAppearance(input: unknown): SanitizedAppearance {
    const out: SanitizedAppearance = { theme: 'light', variables: [], fontImports: [], rejected: [] };
    if (!input || typeof input !== 'object') return out;
    const a = input as Record<string, any>;

    if (a.theme === 'dark' || a.theme === 'light' || a.theme === 'auto') out.theme = a.theme;
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

    return out;
}

const DARK_DEFAULTS: Array<[string, string]> = [
    ['--cord-color-text', '#e5e7eb'],
    ['--cord-color-background', '#111827'],
];

export function appearanceToCss(a: SanitizedAppearance, selector = ':root'): string {
    const block = (vars: Array<[string, string]>) => `${selector} {\n${vars.map(([k, v]) => `  ${k}: ${v};`).join('\n')}\n}\n`;
    let css = a.fontImports.map((href) => `@import url('${href}');\n`).join('');
    if (a.theme === 'dark') css += block(DARK_DEFAULTS);
    if (a.theme === 'auto') css += `@media (prefers-color-scheme: dark) {\n${block(DARK_DEFAULTS)}}\n`;
    const vars = [...a.variables];
    if (a.theme !== 'light') vars.push(['color-scheme', a.theme === 'dark' ? 'dark' : 'light dark']);
    if (vars.length) css += block(vars);
    return css;
}

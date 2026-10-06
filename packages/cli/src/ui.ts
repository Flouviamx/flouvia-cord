// Identidad visual del CLI: paleta de Cord, degradado y logo. Sin color cuando
// la salida no es una terminal o existe NO_COLOR.
const env = process.env;

export const COLOR = Boolean(process.stdout.isTTY) && !env.NO_COLOR && env.TERM !== 'dumb';
const TRUECOLOR = /truecolor|24bit/i.test(env.COLORTERM ?? '') || ['iTerm.app', 'vscode', 'WezTerm', 'ghostty'].includes(env.TERM_PROGRAM ?? '');

export const PALETTE = {
    sky: '#93c5fd',
    mint: '#6ee7b7',
    slate: '#8892b0',
    ink: '#e6ecf5',
    amber: '#fcd34d',
    red: '#f87171',
    green: '#34d399',
    navy: '#0a192f',
} as const;

type Rgb = [number, number, number];

function rgb(hex: string): Rgb {
    const n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function to256([r, g, b]: Rgb): number {
    const q = (v: number) => Math.round((v / 255) * 5);
    return 16 + 36 * q(r) + 6 * q(g) + q(b);
}

function paint(code: Rgb, s: string, layer: 38 | 48): string {
    if (!COLOR) return s;
    const open = TRUECOLOR ? `\x1b[${layer};2;${code.join(';')}m` : `\x1b[${layer};5;${to256(code)}m`;
    return `${open}${s}\x1b[${layer + 1}m`;
}

export const fg = (hex: string, s: string) => paint(rgb(hex), s, 38);
export const bg = (hex: string, s: string) => paint(rgb(hex), s, 48);
export const bold = (s: string) => (COLOR ? `\x1b[1m${s}\x1b[22m` : s);
export const dim = (s: string) => (COLOR ? `\x1b[2m${s}\x1b[22m` : s);
export const sky = (s: string) => fg(PALETTE.sky, s);
export const mint = (s: string) => fg(PALETTE.mint, s);
export const slate = (s: string) => fg(PALETTE.slate, s);
export const amber = (s: string) => fg(PALETTE.amber, s);
export const red = (s: string) => fg(PALETTE.red, s);
export const green = (s: string) => fg(PALETTE.green, s);

function mix(a: Rgb, b: Rgb, t: number): Rgb {
    return [0, 1, 2].map((i) => Math.round(a[i] + (b[i] - a[i]) * t)) as Rgb;
}

/** Degradado diagonal de cielo a menta sobre un bloque de texto. */
export function gradient(lines: string[], from: string = PALETTE.sky, to: string = PALETTE.mint): string[] {
    if (!COLOR) return lines;
    const a = rgb(from), b = rgb(to);
    const width = Math.max(...lines.map((l) => l.length));
    const span = width + lines.length * 2 || 1;
    return lines.map((line, row) => [...line].map((ch, col) => (ch === ' ' ? ch : paint(mix(a, b, (col + row * 2) / span), ch, 38))).join(''));
}

const LOGO = [
    ' ██████  ██████  ██████  ██████ ',
    '██      ██    ██ ██   ██ ██   ██',
    '██      ██    ██ ██████  ██   ██',
    '██      ██    ██ ██   ██ ██   ██',
    ' ██████  ██████  ██   ██ ██████ ',
];

export function banner(version: string, columns = process.stdout.columns || 80): string {
    const tagline = 'De la propuesta al pago. Todo en un solo link.';
    if (columns < 40) return `\n  ${bold(sky('Cord'))}  ${dim(`cli ${version}`)}\n  ${slate(tagline)}\n`;
    const art = gradient(LOGO).map((l) => `  ${l}`).join('\n');
    return `\n${art}\n\n  ${slate(tagline)}\n  ${dim(`cli ${version} · cordhq.app`)}\n`;
}

/** Título de paso para intro(): fondo cielo con texto marino. */
export const badge = (s: string) => (COLOR ? bg(PALETTE.sky, fg(PALETTE.navy, bold(` ${s} `))) : `[ ${s} ]`);

/** El código del flujo de dispositivo, espaciado para leerlo de un vistazo. */
export function codeChips(code: string): string {
    return bold(sky(code.split('').join(' ')));
}

export function statusBadge(status: string): string {
    if (/^2\d\d$/.test(status)) return green(`✔ ${status}`);
    if (/^\d{3}$/.test(status)) return red(`✖ ${status}`);
    return red(`✖ ${status}`);
}

export function kv(rows: Array<[string, string]>): string {
    const w = Math.max(...rows.map(([k]) => k.length));
    return rows.map(([k, v]) => `${slate(k.padEnd(w))}  ${v}`).join('\n');
}

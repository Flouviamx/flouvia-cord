// Fuentes de la configuración asistida: el sitio web del negocio y su lista de
// precios. Todo lo que llega de aquí es DATO de un tercero: se acota en tamaño,
// se descarga por safeFetchPublic (sin IPs internas en ningún salto) y nunca se
// trata como instrucción para la IA.
import { unzipSync, strFromU8 } from 'fflate';
import { safeFetchPublic } from '../ssrf';

export interface SiteInfo {
    url: string;
    titulo: string;
    descripcion: string;
    texto: string;
    colores: string[];
    correos: string[];
    telefonos: string[];
    logoDataUrl: string | null;
}

const MAX_HTML = 600_000;
const MAX_TEXTO = 14_000;
const MAX_LOGO = 900_000;

export function normalizeSiteUrl(input: string): string | null {
    let raw = String(input || '').trim();
    if (!raw) return null;
    if (!/^https?:\/\//i.test(raw)) raw = `https://${raw}`;
    try {
        const u = new URL(raw);
        if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
        if (u.username || u.password) return null;
        if (!/\.[a-z]{2,}$/i.test(u.hostname)) return null;
        u.hash = '';
        return u.href;
    } catch {
        return null;
    }
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
function decode(s: string): string {
    return s
        .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Math.min(Number(n), 0x10ffff)))
        .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(Math.min(parseInt(h, 16), 0x10ffff)))
        .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m);
}

function meta(html: string, name: string): string {
    const re = new RegExp(`<meta[^>]+(?:name|property)=["']${name}["'][^>]*>`, 'i');
    const tag = re.exec(html)?.[0] ?? '';
    return decode(/content=["']([^"']*)["']/i.exec(tag)?.[1] ?? '').trim();
}

/** Texto visible de una página, sin scripts ni estilos, para que la IA lo lea como dato. */
export function visibleText(html: string): string {
    return decode(html
        .replace(/<(script|style|noscript|svg|template|iframe)[\s\S]*?<\/\1>/gi, ' ')
        .replace(/<!--[\s\S]*?-->/g, ' ')
        .replace(/<(br|p|div|li|h[1-6]|tr|section|article|footer|header)[^>]*>/gi, '\n')
        .replace(/<[^>]+>/g, ' '))
        .replace(/[ \t]+/g, ' ')
        .replace(/ *\n */g, '\n')
        .replace(/\n{2,}/g, '\n')
        .trim()
        .slice(0, MAX_TEXTO);
}

/** Colores de marca: theme-color primero, luego los hex más repetidos que no son grises. */
export function brandColors(html: string): string[] {
    const counts = new Map<string, number>();
    // Blancos, negros y grises no son color de marca: tienen los tres canales casi iguales.
    const colorful = (h: string) => {
        const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
        return Math.max(r, g, b) - Math.min(r, g, b) >= 24;
    };
    const theme = meta(html, 'theme-color').toLowerCase();
    if (/^#[0-9a-f]{6}$/.test(theme) && colorful(theme.slice(1))) counts.set(theme, 1000);
    for (const m of html.matchAll(/#([0-9a-f]{6}|[0-9a-f]{3})\b/gi)) {
        let h = m[1].toLowerCase();
        if (h.length === 3) h = h.split('').map((c) => c + c).join('');
        if (!colorful(h)) continue;
        counts.set(`#${h}`, (counts.get(`#${h}`) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([c]) => c);
}

function contactos(text: string) {
    const correos = [...new Set(text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) ?? [])].slice(0, 4);
    const telefonos = [...new Set((text.match(/(?:\+?\d[\d\s().-]{7,}\d)/g) ?? []).map((t) => t.trim()))]
        .filter((t) => t.replace(/\D/g, '').length >= 8 && t.replace(/\D/g, '').length <= 15).slice(0, 4);
    return { correos, telefonos };
}

function logoCandidates(html: string, base: string): string[] {
    const out: string[] = [];
    const add = (href: string | undefined) => {
        if (!href) return;
        try { const u = new URL(decode(href), base); if (u.protocol === 'https:' || u.protocol === 'http:') out.push(u.href); } catch { /* ignora */ }
    };
    for (const m of html.matchAll(/<link[^>]+rel=["'][^"']*apple-touch-icon[^"']*["'][^>]*>/gi)) add(/href=["']([^"']+)["']/i.exec(m[0])?.[1]);
    for (const m of html.matchAll(/<img[^>]+>/gi)) {
        if (/logo/i.test(m[0])) add(/src=["']([^"']+)["']/i.exec(m[0])?.[1]);
    }
    for (const m of html.matchAll(/<link[^>]+rel=["'][^"']*\bicon\b[^"']*["'][^>]*>/gi)) {
        const href = /href=["']([^"']+)["']/i.exec(m[0])?.[1];
        if (href && !/\.ico(\?|$)/i.test(href)) add(href);
    }
    return [...new Set(out)].slice(0, 5);
}

const IMAGE_TYPES: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpeg', 'image/webp': 'webp', 'image/svg+xml': 'svg+xml' };

function sniffImage(bytes: Uint8Array, declared: string): string | null {
    if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png';
    if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
    if (String.fromCharCode(...bytes.subarray(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.subarray(8, 12)) === 'WEBP') return 'image/webp';
    if (declared.startsWith('image/svg')) {
        const head = new TextDecoder().decode(bytes.subarray(0, 2000)).toLowerCase();
        // Un SVG con script o manejadores de eventos no se acepta aunque <img> no los ejecute.
        if (head.includes('<svg') && !/<script|on[a-z]+\s*=|javascript:|<foreignobject/i.test(new TextDecoder().decode(bytes))) return 'image/svg+xml';
    }
    return null;
}

/** Descarga el primer logo utilizable y lo devuelve incrustado (data URL), o null. */
async function downloadLogo(candidates: string[]): Promise<string | null> {
    for (const href of candidates) {
        const r = await safeFetchPublic(href, { timeoutMs: 6000, maxBodyBytes: MAX_LOGO + 1, accept: 'image/*' });
        if (!r.ok || r.bytes.length < 200 || r.bytes.length > MAX_LOGO) continue;
        const mime = sniffImage(r.bytes, r.contentType);
        if (!mime || !IMAGE_TYPES[mime]) continue;
        return `data:${mime};base64,${Buffer.from(r.bytes).toString('base64')}`;
    }
    return null;
}

/** La página de precios o productos más probable, si el inicio enlaza a una. */
function pricingLink(html: string, base: string): string | null {
    const origin = new URL(base).origin;
    for (const m of html.matchAll(/<a[^>]+href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
        const label = `${m[1]} ${m[2].replace(/<[^>]+>/g, '')}`.toLowerCase();
        if (!/precio|pricing|tarifa|productos|catalogo|catálogo|servicios|products|services/.test(label)) continue;
        try { const u = new URL(decode(m[1]), base); if (u.origin === origin && u.href !== base) return u.href; } catch { /* ignora */ }
    }
    return null;
}

export async function readSite(input: string): Promise<{ ok: true; site: SiteInfo } | { ok: false; error: string }> {
    const url = normalizeSiteUrl(input);
    if (!url) return { ok: false, error: 'Esa dirección no parece un sitio web.' };
    const home = await safeFetchPublic(url, { timeoutMs: 9000, maxBodyBytes: MAX_HTML, accept: 'text/html' });
    if (!home.ok) return { ok: false, error: 'No pudimos abrir tu sitio. Revisa la dirección o continúa sin ella.' };
    if (home.contentType && !home.contentType.includes('html')) return { ok: false, error: 'Esa dirección no es una página web.' };
    const html = new TextDecoder().decode(home.bytes);

    let texto = visibleText(html);
    const extra = pricingLink(html, home.url);
    if (extra) {
        const page = await safeFetchPublic(extra, { timeoutMs: 7000, maxBodyBytes: MAX_HTML, accept: 'text/html' });
        if (page.ok && page.contentType.includes('html')) {
            texto = `${texto}\n\n[${new URL(extra).pathname}]\n${visibleText(new TextDecoder().decode(page.bytes))}`.slice(0, MAX_TEXTO * 2);
        }
    }
    const titulo = decode(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? '').trim().slice(0, 200)
        || meta(html, 'og:site_name');
    const { correos, telefonos } = contactos(texto);
    return {
        ok: true,
        site: {
            url: home.url,
            titulo,
            descripcion: (meta(html, 'description') || meta(html, 'og:description')).slice(0, 400),
            texto,
            colores: brandColors(html),
            correos,
            telefonos,
            logoDataUrl: await downloadLogo(logoCandidates(html, home.url)),
        },
    };
}

// ── Lista de precios ─────────────────────────────────────────────────────────

export type PriceFile =
    | { kind: 'rows'; nombre: string; filas: string[][] }
    | { kind: 'document'; nombre: string; mime: 'application/pdf' | 'image/png' | 'image/jpeg'; base64: string };

export const MAX_PRICE_FILE = 4 * 1024 * 1024;
const MAX_ROWS = 2000;

export function parseCsv(text: string): string[][] {
    const firstLine = text.split(/\r?\n/, 1)[0] ?? '';
    const sep = [';', '\t', ','].sort((a, b) => firstLine.split(b).length - firstLine.split(a).length)[0];
    const rows: string[][] = [];
    let row: string[] = [];
    let cell = '';
    let quoted = false;
    for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (quoted) {
            if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
            else if (ch === '"') quoted = false;
            else cell += ch;
            continue;
        }
        if (ch === '"') quoted = true;
        else if (ch === sep) { row.push(cell.trim()); cell = ''; }
        else if (ch === '\n' || ch === '\r') {
            if (ch === '\r' && text[i + 1] === '\n') i++;
            row.push(cell.trim()); cell = '';
            if (row.some(Boolean)) rows.push(row);
            row = [];
            if (rows.length > MAX_ROWS) break;
        } else cell += ch;
    }
    if (cell || row.length) { row.push(cell.trim()); if (row.some(Boolean)) rows.push(row); }
    return rows.slice(0, MAX_ROWS + 1);
}

function colIndex(ref: string): number {
    const letters = /^[A-Z]+/.exec(ref)?.[0] ?? 'A';
    return [...letters].reduce((n, c) => n * 26 + (c.charCodeAt(0) - 64), 0) - 1;
}

/** Primera hoja de un .xlsx, sin dependencias de hoja de cálculo: es XML dentro de un zip. */
export function parseXlsx(bytes: Uint8Array): string[][] {
    const files = unzipSync(bytes, {
        filter: (f) => f.name === 'xl/sharedStrings.xml' || f.name === 'xl/workbook.xml' || /^xl\/worksheets\/sheet\d+\.xml$/.test(f.name),
    });
    const shared = files['xl/sharedStrings.xml']
        ? [...strFromU8(files['xl/sharedStrings.xml']).matchAll(/<si>([\s\S]*?)<\/si>/g)]
            .map((m) => decode([...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join('')))
        : [];
    const sheetName = Object.keys(files).filter((n) => n.startsWith('xl/worksheets/')).sort()[0];
    if (!sheetName) return [];
    const xml = strFromU8(files[sheetName]);
    const rows: string[][] = [];
    for (const r of xml.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
        const row: string[] = [];
        for (const c of r[1].matchAll(/<c\s([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
            const attrs = c[1];
            const ref = /r="([A-Z]+\d+)"/.exec(attrs)?.[1] ?? '';
            const type = /t="([^"]+)"/.exec(attrs)?.[1] ?? '';
            const inner = c[2] ?? '';
            let value = /<v>([\s\S]*?)<\/v>/.exec(inner)?.[1] ?? '';
            if (type === 's') value = shared[Number(value)] ?? '';
            else if (type === 'inlineStr') value = decode([...inner.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join(''));
            else value = decode(value);
            row[ref ? colIndex(ref) : row.length] = value.trim();
        }
        const filled = Array.from(row, (v) => v ?? '');
        if (filled.some(Boolean)) rows.push(filled);
        if (rows.length > MAX_ROWS) break;
    }
    return rows;
}

export async function readPriceFile(file: File): Promise<{ ok: true; file: PriceFile } | { ok: false; error: string }> {
    if (!(file instanceof File) || file.size <= 0) return { ok: false, error: 'El archivo está vacío.' };
    if (file.size > MAX_PRICE_FILE) return { ok: false, error: 'El archivo pesa más de 4 MB.' };
    const bytes = new Uint8Array(await file.arrayBuffer());
    const nombre = String(file.name || 'lista').slice(0, 120);

    if (bytes[0] === 0x50 && bytes[1] === 0x4b) {
        try {
            const filas = parseXlsx(bytes);
            if (!filas.length) return { ok: false, error: 'La hoja de cálculo está vacía.' };
            return { ok: true, file: { kind: 'rows', nombre, filas } };
        } catch {
            return { ok: false, error: 'No pudimos leer ese Excel. Guárdalo como .xlsx o como CSV.' };
        }
    }
    const head = String.fromCharCode(...bytes.subarray(0, 5));
    if (head === '%PDF-') return { ok: true, file: { kind: 'document', nombre, mime: 'application/pdf', base64: Buffer.from(bytes).toString('base64') } };
    if (bytes[0] === 0x89 && bytes[1] === 0x50) return { ok: true, file: { kind: 'document', nombre, mime: 'image/png', base64: Buffer.from(bytes).toString('base64') } };
    if (bytes[0] === 0xff && bytes[1] === 0xd8) return { ok: true, file: { kind: 'document', nombre, mime: 'image/jpeg', base64: Buffer.from(bytes).toString('base64') } };
    if (bytes.includes(0)) return { ok: false, error: 'Sube un Excel, CSV, PDF o una foto de tu lista de precios.' };
    const filas = parseCsv(new TextDecoder().decode(bytes).replace(/^﻿/, ''));
    if (!filas.length) return { ok: false, error: 'El archivo está vacío.' };
    return { ok: true, file: { kind: 'rows', nombre, filas } };
}

const HEADERS = {
    nombre: /^(nombre|producto|descripci[oó]n|art[ií]culo|concepto|servicio|item|name|product|description)$/i,
    precio: /^(precio|precio unitario|p\.? ?unit(ario)?|importe|costo al p[uú]blico|tarifa|price|unit price|amount)$/i,
    sku: /^(sku|c[oó]digo|clave|code|ref(erencia)?|id)$/i,
    unidad: /^(unidad|u\.?m\.?|unit|uom)$/i,
};

function toNumber(v: string): number | null {
    const clean = String(v || '').replace(/[^\d,.-]/g, '');
    if (!clean) return null;
    // 1.234,56 (es) frente a 1,234.56 (en): el último separador es el decimal.
    const lastComma = clean.lastIndexOf(','), lastDot = clean.lastIndexOf('.');
    const normalized = lastComma > lastDot ? clean.replace(/\./g, '').replace(',', '.') : clean.replace(/,/g, '');
    const n = Number(normalized);
    return Number.isFinite(n) ? n : null;
}

/**
 * Productos de una tabla sin IA: si los encabezados se reconocen, las columnas
 * se leen tal cual. Más fiable que pedirle a un modelo que copie cientos de filas.
 */
export function productsFromRows(filas: string[][]): Array<{ sku?: string; nombre: string; unidad?: string; precio: number }> | null {
    const headerAt = filas.slice(0, 8).findIndex((r) => r.some((c) => HEADERS.nombre.test(c)) && r.some((c) => HEADERS.precio.test(c)));
    if (headerAt < 0) return null;
    const header = filas[headerAt];
    const col = (re: RegExp) => header.findIndex((c) => re.test(c));
    const iNombre = col(HEADERS.nombre), iPrecio = col(HEADERS.precio), iSku = col(HEADERS.sku), iUnidad = col(HEADERS.unidad);
    const out: Array<{ sku?: string; nombre: string; unidad?: string; precio: number }> = [];
    for (const r of filas.slice(headerAt + 1)) {
        const nombre = (r[iNombre] ?? '').trim();
        const precio = toNumber(r[iPrecio] ?? '');
        if (!nombre || precio === null) continue;
        out.push({
            nombre,
            precio,
            ...(iSku >= 0 && r[iSku] ? { sku: r[iSku] } : {}),
            ...(iUnidad >= 0 && r[iUnidad] ? { unidad: r[iUnidad] } : {}),
        });
    }
    return out;
}

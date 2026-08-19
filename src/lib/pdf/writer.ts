// Escritor PDF vectorial mínimo, sin dependencias.
//
// Reemplaza al generador de texto plano (`simple-pdf.ts`) para los documentos
// que ve un cliente. Dos diferencias que importan:
//
//   1. **Acentos de verdad.** El generador viejo normalizaba todo a ASCII, así
//      que "España" se imprimía "Espana" y un guion largo salía como "?". Aquí
//      el texto se codifica en WinAnsi, que cubre todo el latín occidental
//      (á é í ó ú ñ ü ç ¿ ¡ € — …) con las fuentes base del PDF.
//   2. **Layout real.** Rectángulos, líneas, colores, alineación por caja y
//      medición de texto con las métricas reales de Helvetica — es decir,
//      tablas con columnas que cuadran, no renglones sueltos.
//
// Origen de coordenadas: ESQUINA SUPERIOR IZQUIERDA, en puntos (72 pt = 1 in).
// El PDF nativo mide desde abajo; la conversión se hace aquí para que el código
// de layout se lea como se lee la hoja.

import { deflateSync, inflateSync } from 'node:zlib';

export type RGB = [number, number, number];
export type FontKey = 'regular' | 'bold' | 'italic';
export type Align = 'left' | 'center' | 'right';

const FONT_RESOURCE: Record<FontKey, string> = {
    regular: '/F1',
    bold: '/F2',
    italic: '/F3',
};

// ── Codificación WinAnsi ─────────────────────────────────────────────────────
// El rango 0x80–0x9F de WinAnsi no coincide con Unicode; el resto de Latin-1 sí.
const WINANSI_HIGH: Record<string, number> = {
    '€': 0x80, '‚': 0x82, 'ƒ': 0x83, '„': 0x84, '…': 0x85,
    '†': 0x86, '‡': 0x87, 'ˆ': 0x88, '‰': 0x89, 'Š': 0x8A,
    '‹': 0x8B, 'Œ': 0x8C, 'Ž': 0x8E, '‘': 0x91, '’': 0x92,
    '“': 0x93, '”': 0x94, '•': 0x95, '–': 0x96, '—': 0x97,
    '˜': 0x98, '™': 0x99, 'š': 0x9A, '›': 0x9B, 'œ': 0x9C,
    'ž': 0x9E, 'Ÿ': 0x9F,
};

/** Un carácter fuera de WinAnsi cae a su equivalente sin acento antes de rendirse. */
function toWinAnsiByte(char: string): number {
    const code = char.codePointAt(0) ?? 63;
    if (code >= 0x20 && code <= 0x7e) return code;
    const mapped = WINANSI_HIGH[char];
    if (mapped !== undefined) return mapped;
    if (code >= 0xa0 && code <= 0xff) return code;
    const stripped = char.normalize('NFKD').replace(/[̀-ͯ]/g, '');
    if (stripped && stripped !== char) {
        const base = stripped.codePointAt(0) ?? 63;
        if (base >= 0x20 && base <= 0x7e) return base;
    }
    return 0x3f; // '?'
}

function encodeWinAnsi(value: string): number[] {
    return Array.from(String(value ?? '')).map(toWinAnsiByte);
}

/** Escapa un literal de cadena PDF ya codificado en bytes WinAnsi. */
function pdfString(value: string): string {
    return encodeWinAnsi(value)
        .map((byte) => {
            if (byte === 0x28 || byte === 0x29 || byte === 0x5c) return `\\${String.fromCharCode(byte)}`;
            if (byte < 0x20 || byte > 0x7e) return `\\${byte.toString(8).padStart(3, '0')}`;
            return String.fromCharCode(byte);
        })
        .join('');
}

// ── Métricas de Helvetica ────────────────────────────────────────────────────
// Anchos AFM oficiales (unidades de 1/1000 em) para los códigos 32–126. Los
// acentuados de WinAnsi comparten el ancho de su letra base en esta familia,
// así que se derivan en vez de listarse.
const W_REGULAR = [
    278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278,
    556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556,
    1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778,
    667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556,
    333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556,
    556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584,
];
const W_BOLD = [
    278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278,
    556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611,
    975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778,
    667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556,
    333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611,
    611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584,
];

// Ancho de los códigos WinAnsi altos que NO son una letra acentuada.
const HIGH_WIDTH_REGULAR: Record<number, number> = {
    0x80: 556, 0x82: 222, 0x83: 556, 0x84: 333, 0x85: 1000, 0x86: 556, 0x87: 556,
    0x88: 333, 0x89: 1000, 0x8b: 333, 0x8c: 1000, 0x91: 222, 0x92: 222, 0x93: 333,
    0x94: 333, 0x95: 350, 0x96: 556, 0x97: 1000, 0x98: 333, 0x99: 1000, 0x9b: 333,
    0x9c: 944, 0xa0: 278, 0xa1: 333, 0xa2: 556, 0xa3: 556, 0xa4: 556, 0xa5: 556,
    0xa6: 260, 0xa7: 556, 0xa8: 333, 0xa9: 737, 0xaa: 370, 0xab: 556, 0xac: 584,
    0xad: 333, 0xae: 737, 0xaf: 333, 0xb0: 400, 0xb1: 584, 0xb2: 333, 0xb3: 333,
    0xb4: 333, 0xb5: 556, 0xb6: 537, 0xb7: 278, 0xb8: 333, 0xb9: 333, 0xba: 365,
    0xbb: 556, 0xbc: 834, 0xbd: 834, 0xbe: 834, 0xbf: 611, 0xd7: 584, 0xf7: 584,
};

// Códigos WinAnsi de letras acentuadas → letra ASCII cuyo ancho comparten.
const ACCENT_BASE: Record<number, string> = {
    0xc0: 'A', 0xc1: 'A', 0xc2: 'A', 0xc3: 'A', 0xc4: 'A', 0xc5: 'A', 0xc6: 'A',
    0xc7: 'C', 0xc8: 'E', 0xc9: 'E', 0xca: 'E', 0xcb: 'E', 0xcc: 'I', 0xcd: 'I',
    0xce: 'I', 0xcf: 'I', 0xd0: 'D', 0xd1: 'N', 0xd2: 'O', 0xd3: 'O', 0xd4: 'O',
    0xd5: 'O', 0xd6: 'O', 0xd8: 'O', 0xd9: 'U', 0xda: 'U', 0xdb: 'U', 0xdc: 'U',
    0xdd: 'Y', 0xde: 'P', 0xdf: 'B', 0xe0: 'a', 0xe1: 'a', 0xe2: 'a', 0xe3: 'a',
    0xe4: 'a', 0xe5: 'a', 0xe6: 'a', 0xe7: 'c', 0xe8: 'e', 0xe9: 'e', 0xea: 'e',
    0xeb: 'e', 0xec: 'i', 0xed: 'i', 0xee: 'i', 0xef: 'i', 0xf0: 'o', 0xf1: 'n',
    0xf2: 'o', 0xf3: 'o', 0xf4: 'o', 0xf5: 'o', 0xf6: 'o', 0xf8: 'o', 0xf9: 'u',
    0xfa: 'u', 0xfb: 'u', 0xfc: 'u', 0xfd: 'y', 0xfe: 'p', 0xff: 'y',
    0x8a: 'S', 0x8e: 'Z', 0x9a: 's', 0x9e: 'z', 0x9f: 'Y', 0x8f: 'A',
};

function glyphWidth(byte: number, bold: boolean): number {
    const table = bold ? W_BOLD : W_REGULAR;
    if (byte >= 32 && byte <= 126) return table[byte - 32];
    const base = ACCENT_BASE[byte];
    if (base) return table[base.charCodeAt(0) - 32];
    const high = HIGH_WIDTH_REGULAR[byte];
    if (high !== undefined) return bold ? Math.round(high * 1.03) : high;
    return table[0];
}

/** Ancho del texto en puntos, con las métricas reales de la fuente. */
export function measureText(text: string, size: number, font: FontKey = 'regular'): number {
    const bold = font === 'bold';
    let total = 0;
    for (const byte of encodeWinAnsi(text)) total += glyphWidth(byte, bold);
    return (total * size) / 1000;
}

/** Recorta con puntos suspensivos para que quepa en `maxWidth`. */
export function truncateText(text: string, maxWidth: number, size: number, font: FontKey = 'regular'): string {
    const value = String(text ?? '');
    if (measureText(value, size, font) <= maxWidth) return value;
    const ellipsis = '…';
    let low = 0;
    let high = value.length;
    while (low < high) {
        const mid = Math.ceil((low + high) / 2);
        if (measureText(value.slice(0, mid) + ellipsis, size, font) <= maxWidth) low = mid;
        else high = mid - 1;
    }
    return low > 0 ? value.slice(0, low).trimEnd() + ellipsis : ellipsis;
}

/** Parte el texto en líneas que caben en `maxWidth`, respetando palabras. */
export function wrapText(text: string, maxWidth: number, size: number, font: FontKey = 'regular'): string[] {
    const out: string[] = [];
    for (const paragraph of String(text ?? '').split(/\r?\n/)) {
        const words = paragraph.split(/\s+/).filter(Boolean);
        if (!words.length) { out.push(''); continue; }
        let line = '';
        for (const word of words) {
            const candidate = line ? `${line} ${word}` : word;
            if (measureText(candidate, size, font) <= maxWidth) { line = candidate; continue; }
            if (line) out.push(line);
            // Palabra sola más ancha que la caja: se parte por caracteres.
            if (measureText(word, size, font) <= maxWidth) { line = word; continue; }
            let chunk = '';
            for (const char of word) {
                if (measureText(chunk + char, size, font) > maxWidth) { out.push(chunk); chunk = char; }
                else chunk += char;
            }
            line = chunk;
        }
        if (line) out.push(line);
    }
    return out;
}

// ── Imágenes ─────────────────────────────────────────────────────────────────
interface EmbeddedImage {
    width: number;
    height: number;
    data: Buffer;
    filter: 'DCTDecode' | 'FlateDecode';
    colorSpace: 'DeviceRGB' | 'DeviceGray';
    smask?: Buffer;
}

function parseJpeg(bytes: Buffer): EmbeddedImage | null {
    if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
    let offset = 2;
    while (offset < bytes.length - 1) {
        if (bytes[offset] !== 0xff) { offset++; continue; }
        const marker = bytes[offset + 1];
        // SOF0..SOF15 salvo los marcadores que no describen el frame.
        if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
            const height = bytes.readUInt16BE(offset + 5);
            const width = bytes.readUInt16BE(offset + 7);
            const components = bytes[offset + 9];
            if (components !== 1 && components !== 3) return null; // CMYK fuera de alcance
            return {
                width, height, data: bytes, filter: 'DCTDecode',
                colorSpace: components === 1 ? 'DeviceGray' : 'DeviceRGB',
            };
        }
        if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd9)) { offset += 2; continue; }
        offset += 2 + bytes.readUInt16BE(offset + 2);
    }
    return null;
}

/** Deshace los filtros PNG por scanline (spec 9.2) sobre datos ya inflados. */
function unfilterPng(raw: Buffer, width: number, height: number, channels: number, depth: number): Buffer | null {
    if (depth !== 8) return null;
    const rowBytes = width * channels;
    const out = Buffer.alloc(rowBytes * height);
    let pos = 0;
    for (let y = 0; y < height; y++) {
        const filter = raw[pos++];
        const row = raw.subarray(pos, pos + rowBytes);
        pos += rowBytes;
        const target = out.subarray(y * rowBytes, (y + 1) * rowBytes);
        const prior = y > 0 ? out.subarray((y - 1) * rowBytes, y * rowBytes) : null;
        for (let x = 0; x < rowBytes; x++) {
            const rawByte = row[x];
            const left = x >= channels ? target[x - channels] : 0;
            const up = prior ? prior[x] : 0;
            const upLeft = prior && x >= channels ? prior[x - channels] : 0;
            let value: number;
            switch (filter) {
                case 0: value = rawByte; break;
                case 1: value = rawByte + left; break;
                case 2: value = rawByte + up; break;
                case 3: value = rawByte + ((left + up) >> 1); break;
                case 4: {
                    const p = left + up - upLeft;
                    const pa = Math.abs(p - left);
                    const pb = Math.abs(p - up);
                    const pc = Math.abs(p - upLeft);
                    value = rawByte + (pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft);
                    break;
                }
                default: return null;
            }
            target[x] = value & 0xff;
        }
    }
    return out;
}

function parsePng(bytes: Buffer): EmbeddedImage | null {
    const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    if (!bytes.subarray(0, 8).equals(SIGNATURE)) return null;
    let offset = 8;
    let width = 0, height = 0, depth = 0, colorType = -1, interlace = 0;
    const idat: Buffer[] = [];
    while (offset < bytes.length) {
        const length = bytes.readUInt32BE(offset);
        const type = bytes.toString('ascii', offset + 4, offset + 8);
        const body = bytes.subarray(offset + 8, offset + 8 + length);
        if (type === 'IHDR') {
            width = body.readUInt32BE(0);
            height = body.readUInt32BE(4);
            depth = body[8];
            colorType = body[9];
            interlace = body[12];
        } else if (type === 'IDAT') idat.push(body);
        else if (type === 'IEND') break;
        offset += 12 + length;
    }
    // Solo el caso común y sin sorpresas: 8 bits, sin entrelazar, RGB/RGBA/gris.
    if (!width || !height || depth !== 8 || interlace !== 0 || !idat.length) return null;
    const channels = colorType === 2 ? 3 : colorType === 6 ? 4 : colorType === 0 ? 1 : 0;
    if (!channels) return null; // paleta y gris+alfa quedan fuera

    let raw: Buffer;
    try { raw = inflateSync(Buffer.concat(idat)); } catch { return null; }
    const pixels = unfilterPng(raw, width, height, channels, depth);
    if (!pixels) return null;

    if (channels === 4) {
        // PDF no lleva alfa en línea: el color va a la imagen y el alfa a un SMask.
        const rgb = Buffer.alloc(width * height * 3);
        const alpha = Buffer.alloc(width * height);
        for (let i = 0, p = 0, a = 0; i < pixels.length; i += 4, p += 3, a++) {
            rgb[p] = pixels[i];
            rgb[p + 1] = pixels[i + 1];
            rgb[p + 2] = pixels[i + 2];
            alpha[a] = pixels[i + 3];
        }
        return {
            width, height, data: deflateSync(rgb), filter: 'FlateDecode',
            colorSpace: 'DeviceRGB', smask: deflateSync(alpha),
        };
    }
    return {
        width, height, data: deflateSync(pixels), filter: 'FlateDecode',
        colorSpace: channels === 1 ? 'DeviceGray' : 'DeviceRGB',
    };
}

/**
 * Prepara una imagen para incrustarla. Acepta un data URL o un Buffer.
 * Devuelve null si el formato no se puede incrustar — quien llama debe tener
 * un plan B visual, nunca dejar un hueco.
 */
export function prepareImage(source: string | Buffer | null | undefined): EmbeddedImage | null {
    if (!source) return null;
    let bytes: Buffer;
    if (Buffer.isBuffer(source)) bytes = source;
    else {
        const match = /^data:image\/[a-z0-9.+-]+;base64,(.+)$/i.exec(String(source).trim());
        if (!match) return null;
        try { bytes = Buffer.from(match[1], 'base64'); } catch { return null; }
    }
    if (bytes.length > 4_000_000) return null;
    try {
        return parseJpeg(bytes) ?? parsePng(bytes);
    } catch {
        return null;
    }
}

// ── Documento ────────────────────────────────────────────────────────────────
interface TextOptions {
    size?: number;
    font?: FontKey;
    color?: RGB;
    align?: Align;
    /** Ancho de la caja para alinear (obligatorio con align center/right). */
    width?: number;
    /** Espaciado entre caracteres, en puntos. Útil para versalitas de etiqueta. */
    tracking?: number;
}

interface RectOptions {
    fill?: RGB;
    stroke?: RGB;
    lineWidth?: number;
    /** Radio de esquina; 0 = ángulo recto. */
    radius?: number;
}

const PT = (value: number) => Math.round(value * 100) / 100;
const color = (rgb: RGB) => `${PT(rgb[0] / 255)} ${PT(rgb[1] / 255)} ${PT(rgb[2] / 255)}`;

export class PdfDocument {
    readonly width: number;
    readonly height: number;
    private pages: string[][] = [];
    private current: string[] = [];
    private images = new Map<string, EmbeddedImage>();

    constructor(options: { width?: number; height?: number } = {}) {
        this.width = options.width ?? 595.28;   // A4
        this.height = options.height ?? 841.89;
        this.addPage();
    }

    addPage(): void {
        this.current = [];
        this.pages.push(this.current);
    }

    get pageCount(): number {
        return this.pages.length;
    }

    /**
     * Vuelve a una página ya creada para seguir dibujando en ella. Lo usa el pie
     * de página: el "3 de 5" solo se puede escribir cuando ya se sabe cuántas
     * páginas hay, es decir después de haber recorrido todo el contenido.
     */
    selectPage(index: number): void {
        const page = this.pages[index];
        if (page) this.current = page;
    }

    /** Convierte Y desde-arriba a la coordenada nativa del PDF. */
    private y(top: number): number {
        return this.height - top;
    }

    rect(x: number, top: number, w: number, h: number, options: RectOptions = {}): void {
        const y = this.y(top + h);
        const radius = Math.max(0, Math.min(options.radius ?? 0, Math.min(w, h) / 2));
        const ops: string[] = ['q'];
        if (options.fill) ops.push(`${color(options.fill)} rg`);
        if (options.stroke) ops.push(`${color(options.stroke)} RG`, `${PT(options.lineWidth ?? 0.5)} w`);
        if (!radius) {
            ops.push(`${PT(x)} ${PT(y)} ${PT(w)} ${PT(h)} re`);
        } else {
            // Esquinas con curvas Bézier (k = 0.5523 aproxima un cuarto de círculo).
            const k = radius * 0.5523;
            const x2 = x + w;
            const y2 = y + h;
            ops.push(
                `${PT(x + radius)} ${PT(y)} m`,
                `${PT(x2 - radius)} ${PT(y)} l`,
                `${PT(x2 - radius + k)} ${PT(y)} ${PT(x2)} ${PT(y + radius - k)} ${PT(x2)} ${PT(y + radius)} c`,
                `${PT(x2)} ${PT(y2 - radius)} l`,
                `${PT(x2)} ${PT(y2 - radius + k)} ${PT(x2 - radius + k)} ${PT(y2)} ${PT(x2 - radius)} ${PT(y2)} c`,
                `${PT(x + radius)} ${PT(y2)} l`,
                `${PT(x + radius - k)} ${PT(y2)} ${PT(x)} ${PT(y2 - radius + k)} ${PT(x)} ${PT(y2 - radius)} c`,
                `${PT(x)} ${PT(y + radius)} l`,
                `${PT(x)} ${PT(y + radius - k)} ${PT(x + radius - k)} ${PT(y)} ${PT(x + radius)} ${PT(y)} c`,
                'h',
            );
        }
        if (options.fill && options.stroke) ops.push('B');
        else if (options.fill) ops.push('f');
        else ops.push('S');
        ops.push('Q');
        this.current.push(ops.join('\n'));
    }

    line(x1: number, top1: number, x2: number, top2: number, options: { color?: RGB; width?: number } = {}): void {
        this.current.push([
            'q',
            `${color(options.color ?? [0, 0, 0])} RG`,
            `${PT(options.width ?? 0.5)} w`,
            `${PT(x1)} ${PT(this.y(top1))} m`,
            `${PT(x2)} ${PT(this.y(top2))} l`,
            'S',
            'Q',
        ].join('\n'));
    }

    /** Dibuja texto. `top` es la línea BASE del texto, medida desde arriba. */
    text(value: string, x: number, top: number, options: TextOptions = {}): void {
        const raw = String(value ?? '');
        if (!raw) return;
        const size = options.size ?? 9;
        const font = options.font ?? 'regular';
        const tracking = options.tracking ?? 0;
        let drawX = x;
        if (options.align && options.align !== 'left' && options.width) {
            const textWidth = measureText(raw, size, font) + tracking * Math.max(0, raw.length - 1);
            drawX = options.align === 'right'
                ? x + options.width - textWidth
                : x + (options.width - textWidth) / 2;
        }
        this.current.push([
            'BT',
            `${color(options.color ?? [0, 0, 0])} rg`,
            `${FONT_RESOURCE[font]} ${PT(size)} Tf`,
            tracking ? `${PT(tracking)} Tc` : '0 Tc',
            `${PT(drawX)} ${PT(this.y(top))} Td`,
            `(${pdfString(raw)}) Tj`,
            'ET',
        ].join('\n'));
    }

    image(img: EmbeddedImage, x: number, top: number, w: number, h: number): void {
        const key = `Im${this.images.size + 1}`;
        let name = key;
        for (const [existing, value] of this.images) {
            if (value === img) { name = existing; break; }
        }
        if (!this.images.has(name)) this.images.set(name, img);
        this.current.push([
            'q',
            `${PT(w)} 0 0 ${PT(h)} ${PT(x)} ${PT(this.y(top + h))} cm`,
            `/${name} Do`,
            'Q',
        ].join('\n'));
    }

    /** Escala una imagen para que quepa en una caja sin deformarla. */
    static fit(img: EmbeddedImage, maxW: number, maxH: number): { w: number; h: number } {
        const ratio = Math.min(maxW / img.width, maxH / img.height, 1);
        return { w: img.width * ratio, h: img.height * ratio };
    }

    build(): Buffer {
        const objects: (Buffer | null)[] = [null];
        const push = (body: Buffer | string): number => {
            objects.push(Buffer.isBuffer(body) ? body : Buffer.from(body, 'latin1'));
            return objects.length - 1;
        };

        const fontIds = {
            regular: push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'),
            bold: push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>'),
            italic: push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Oblique /Encoding /WinAnsiEncoding >>'),
        };

        const imageIds = new Map<string, number>();
        for (const [name, img] of this.images) {
            let smaskId: number | null = null;
            if (img.smask) {
                smaskId = push(Buffer.concat([
                    Buffer.from(`<< /Type /XObject /Subtype /Image /Width ${img.width} /Height ${img.height} `
                        + `/ColorSpace /DeviceGray /BitsPerComponent 8 /Filter /FlateDecode `
                        + `/Length ${img.smask.length} >>\nstream\n`, 'latin1'),
                    img.smask,
                    Buffer.from('\nendstream', 'latin1'),
                ]));
            }
            imageIds.set(name, push(Buffer.concat([
                Buffer.from(`<< /Type /XObject /Subtype /Image /Width ${img.width} /Height ${img.height} `
                    + `/ColorSpace /${img.colorSpace} /BitsPerComponent 8 /Filter /${img.filter} `
                    + (smaskId ? `/SMask ${smaskId} 0 R ` : '')
                    + `/Length ${img.data.length} >>\nstream\n`, 'latin1'),
                img.data,
                Buffer.from('\nendstream', 'latin1'),
            ])));
        }

        const xobjects = imageIds.size
            ? `/XObject << ${[...imageIds].map(([name, id]) => `/${name} ${id} 0 R`).join(' ')} >> `
            : '';
        const resources = `<< /Font << /F1 ${fontIds.regular} 0 R /F2 ${fontIds.bold} 0 R `
            + `/F3 ${fontIds.italic} 0 R >> ${xobjects}>>`;

        const pagesId = objects.length + this.pages.length * 2;
        const pageIds: number[] = [];
        for (const page of this.pages) {
            const stream = deflateSync(Buffer.from(page.join('\n'), 'latin1'));
            const contentId = push(Buffer.concat([
                Buffer.from(`<< /Length ${stream.length} /Filter /FlateDecode >>\nstream\n`, 'latin1'),
                stream,
                Buffer.from('\nendstream', 'latin1'),
            ]));
            pageIds.push(push(
                `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${PT(this.width)} ${PT(this.height)}] `
                + `/Resources ${resources} /Contents ${contentId} 0 R >>`,
            ));
        }
        const realPagesId = push(
            `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`,
        );
        // El id de /Pages se reservó por adelantado para que cada página lo cite.
        if (realPagesId !== pagesId) {
            for (const id of pageIds) {
                objects[id] = Buffer.from(
                    objects[id]!.toString('latin1').replace(`/Parent ${pagesId} 0 R`, `/Parent ${realPagesId} 0 R`),
                    'latin1',
                );
            }
        }
        const catalogId = push(`<< /Type /Catalog /Pages ${realPagesId} 0 R >>`);

        const chunks: Buffer[] = [Buffer.from('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n', 'latin1')];
        const offsets: number[] = [0];
        let cursor = chunks[0].length;
        for (let id = 1; id < objects.length; id++) {
            offsets[id] = cursor;
            const body = Buffer.concat([
                Buffer.from(`${id} 0 obj\n`, 'latin1'),
                objects[id]!,
                Buffer.from('\nendobj\n', 'latin1'),
            ]);
            chunks.push(body);
            cursor += body.length;
        }
        const xrefOffset = cursor;
        chunks.push(Buffer.from([
            `xref\n0 ${objects.length}\n`,
            '0000000000 65535 f \n',
            ...offsets.slice(1).map((value) => `${String(value).padStart(10, '0')} 00000 n \n`),
            `trailer\n<< /Size ${objects.length} /Root ${catalogId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`,
        ].join(''), 'latin1'));
        return Buffer.concat(chunks);
    }
}

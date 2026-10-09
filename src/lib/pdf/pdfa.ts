// Ensamblador PDF/A-3b del escritor vectorial (`lib/pdf/writer.ts`).
//
// Toma el documento YA dibujado (`PdfDocument.parts()`: los mismos operadores
// de contenido e imágenes que produce `build()`) y lo arma con lo que ISO
// 19005-3 nivel B exige y el PDF normal no lleva:
//
//   - fuentes incrustadas (§6.2.11.4): Liberation Sans/Serif en subconjunto,
//     TrueType no simbólica con WinAnsiEncoding y cmap (3,1) (§6.2.11.6), y un
//     /Widths calculado del propio programa de fuente (§6.2.11.5);
//   - un OutputIntent con perfil ICC sRGB (§6.2.3), porque el contenido pinta
//     en DeviceRGB/DeviceGray;
//   - metadatos XMP con pdfaid:part=3 y conformance=B, idénticos a /Info
//     (§6.6.2, §6.6.3);
//   - /ID en el trailer (§6.1.3) y cabecera %PDF-1.7 con comentario binario;
//   - archivos asociados (§6.8): EmbeddedFile con /Subtype (tipo MIME) y
//     /Params /ModDate, Filespec con /F, /UF y /AFRelationship, el árbol
//     /Names/EmbeddedFiles y el arreglo /AF del catálogo.
//
// El PDF de siempre no pasa por aquí: `build()` sigue produciendo el mismo
// archivo byte a byte (lo verifican las pruebas del PDF de factura).

import { createHash } from 'node:crypto';
import { deflateSync, inflateSync } from 'node:zlib';
import { parseTrueType, type TrueTypeFont } from './truetype';
import { winAnsiCodePoint, type EmbeddedImage, type FontFamily, type FontKey, type PdfDocument } from './writer';
import { SRGB_ICC_BASE64 } from './srgb-icc';

export type AFRelationship = 'Alternative' | 'Data' | 'Source' | 'Supplement' | 'Unspecified';

export interface PdfAAttachment {
    name: string;
    mime: string;
    data: Uint8Array;
    relationship: AFRelationship;
    description: string;
}

export interface PdfAOptions {
    title: string;
    author: string;
    subject?: string;
    creator: string;
    producer: string;
    /** BCP 47 del contenido ("fr-FR"), para /Lang del catálogo. */
    lang?: string;
    /** Fecha de creación y modificación (Info, XMP y los archivos asociados). */
    date: Date;
    attachments: PdfAAttachment[];
    /** `rdf:Description` adicionales del XMP (p. ej. el esquema de Factur-X y su extensión). */
    xmpExtra?: string;
}

type ArchivalFonts = Record<FontFamily, Record<'regular' | 'bold', TrueTypeFont>>;
let fontsCache: Promise<ArchivalFonts> | null = null;

/** Liberation Sans/Serif, una sola vez por proceso. Import dinámico: ~1 MB que solo carga el modo PDF/A. */
export function loadArchivalFonts(): Promise<ArchivalFonts> {
    fontsCache ??= import('./fonts/liberation').then(({ LIBERATION_DEFLATE_BASE64: f }) => {
        const font = (key: keyof typeof f) => parseTrueType(inflateSync(Buffer.from(f[key], 'base64')));
        return {
            sans: { regular: font('sans.regular'), bold: font('sans.bold') },
            serif: { regular: font('serif.regular'), bold: font('serif.bold') },
        };
    });
    return fontsCache;
}

const PT = (value: number) => Math.round(value * 100) / 100;
const latin = (s: string) => Buffer.from(s, 'latin1');

/** Cadena de texto PDF: literal si es ASCII imprimible, UTF-16BE con BOM si no. */
function pdfText(value: string): string {
    if (/^[\x20-\x7e]*$/.test(value)) return `(${value.replace(/([\\()])/g, '\\$1')})`;
    const utf16 = Buffer.from(value, 'utf16le');
    for (let i = 0; i < utf16.length; i += 2) { const a = utf16[i]; utf16[i] = utf16[i + 1]; utf16[i + 1] = a; }
    return `<FEFF${utf16.toString('hex').toUpperCase()}>`;
}

const two = (n: number) => String(n).padStart(2, '0');
function pdfDate(d: Date): string {
    return `D:${d.getUTCFullYear()}${two(d.getUTCMonth() + 1)}${two(d.getUTCDate())}${two(d.getUTCHours())}${two(d.getUTCMinutes())}${two(d.getUTCSeconds())}+00'00'`;
}
function xmpDate(d: Date): string {
    return `${d.getUTCFullYear()}-${two(d.getUTCMonth() + 1)}-${two(d.getUTCDate())}T${two(d.getUTCHours())}:${two(d.getUTCMinutes())}:${two(d.getUTCSeconds())}+00:00`;
}
export function xmlEscape(value: string): string {
    return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
/** Nombre PDF con los delimitadores escapados (#2F para "/"). */
function pdfName(value: string): string {
    return '/' + Array.from(Buffer.from(value, 'latin1')).map((b) => (b > 0x20 && b < 0x7f && !'#/()<>[]{}%'.includes(String.fromCharCode(b))
        ? String.fromCharCode(b) : `#${b.toString(16).padStart(2, '0').toUpperCase()}`)).join('');
}

function xmpPacket(o: PdfAOptions): string {
    const date = xmpDate(o.date);
    return '<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>\n'
        + '<x:xmpmeta xmlns:x="adobe:ns:meta/">\n'
        + '<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">\n'
        + '<rdf:Description rdf:about="" xmlns:pdfaid="http://www.aiim.org/pdfa/ns/id/">'
        + '<pdfaid:part>3</pdfaid:part><pdfaid:conformance>B</pdfaid:conformance></rdf:Description>\n'
        + '<rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/">'
        + '<dc:format>application/pdf</dc:format>'
        + `<dc:title><rdf:Alt><rdf:li xml:lang="x-default">${xmlEscape(o.title)}</rdf:li></rdf:Alt></dc:title>`
        + `<dc:creator><rdf:Seq><rdf:li>${xmlEscape(o.author)}</rdf:li></rdf:Seq></dc:creator>`
        + (o.subject ? `<dc:description><rdf:Alt><rdf:li xml:lang="x-default">${xmlEscape(o.subject)}</rdf:li></rdf:Alt></dc:description>` : '')
        + '</rdf:Description>\n'
        + '<rdf:Description rdf:about="" xmlns:xmp="http://ns.adobe.com/xap/1.0/">'
        + `<xmp:CreatorTool>${xmlEscape(o.creator)}</xmp:CreatorTool><xmp:CreateDate>${date}</xmp:CreateDate>`
        + `<xmp:ModifyDate>${date}</xmp:ModifyDate><xmp:MetadataDate>${date}</xmp:MetadataDate></rdf:Description>\n`
        + '<rdf:Description rdf:about="" xmlns:pdf="http://ns.adobe.com/pdf/1.3/">'
        + `<pdf:Producer>${xmlEscape(o.producer)}</pdf:Producer></rdf:Description>\n`
        + (o.xmpExtra ?? '')
        + '</rdf:RDF>\n</x:xmpmeta>\n'
        // Relleno recomendado para que un editor pueda reescribir el paquete en sitio.
        + `${' '.repeat(99)}\n`.repeat(20)
        + '<?xpacket end="w"?>';
}

export function buildPdfA(doc: PdfDocument, fonts: ArchivalFonts, options: PdfAOptions): Buffer {
    const parts = doc.parts();
    const objects: (Buffer | null)[] = [null];
    const reserve = (): number => { objects.push(null); return objects.length - 1; };
    const set = (id: number, body: Buffer | string) => { objects[id] = Buffer.isBuffer(body) ? body : latin(body); };
    const push = (body: Buffer | string): number => { const id = reserve(); set(id, body); return id; };
    const stream = (dict: string, data: Buffer): Buffer => Buffer.concat([latin(`<< ${dict} /Length ${data.length} >>\nstream\n`), data, latin('\nendstream')]);

    // ── Fuentes: solo las que pintan texto, en subconjunto ──
    const fontIds: Partial<Record<FontKey, number>> = {};
    const resourceNames: Record<FontKey, string> = { regular: '/F1', bold: '/F2', italic: '/F3' };
    const family = fonts[parts.fontFamily];
    for (const key of ['regular', 'bold', 'italic'] as FontKey[]) {
        const used = parts.usedGlyphs[key];
        if (!used.size) continue;
        if (key === 'italic') throw new Error('El modo PDF/A no tiene cursiva incrustable.');
        const program = family[key];
        const codePoints = [...used].map(winAnsiCodePoint).filter((cp): cp is number => cp !== null);
        for (const cp of codePoints) {
            if (!program.glyphFor(cp)) throw new Error(`La fuente de archivo no tiene el carácter U+${cp.toString(16).toUpperCase().padStart(4, '0')}.`);
        }
        const subset = Buffer.from(program.subset(codePoints));
        const tag = createHash('sha256').update(`${key}:${[...used].sort((a, b) => a - b).join(',')}`).digest()
            .subarray(0, 6).reduce((s, b) => s + String.fromCharCode(65 + (b % 26)), '');
        const baseFont = `${tag}+${program.postScriptName}`;
        const scale = (v: number) => Math.round((v * 1000) / program.unitsPerEm);
        const fileId = push(stream(`/Length1 ${subset.length} /Filter /FlateDecode`, deflateSync(subset)));
        const descriptorId = push(`<< /Type /FontDescriptor /FontName /${baseFont} /Flags ${parts.fontFamily === 'serif' ? 34 : 32} `
            + `/FontBBox [${program.bbox.map(scale).join(' ')}] /ItalicAngle ${PT(program.italicAngle)} `
            + `/Ascent ${scale(program.ascent)} /Descent ${scale(program.descent)} /CapHeight ${scale(program.capHeight)} `
            + `/StemV ${key === 'bold' ? 120 : 80} /FontFile2 ${fileId} 0 R >>`);
        const widths: number[] = [];
        for (let code = 32; code <= 255; code++) {
            const cp = winAnsiCodePoint(code);
            const glyph = cp === null ? 0 : program.glyphFor(cp);
            widths.push(glyph ? scale(program.advance(glyph)) : 0);
        }
        fontIds[key] = push(`<< /Type /Font /Subtype /TrueType /BaseFont /${baseFont} /FirstChar 32 /LastChar 255 `
            + `/Widths [${widths.join(' ')}] /Encoding /WinAnsiEncoding /FontDescriptor ${descriptorId} 0 R >>`);
    }

    // ── Imágenes: idénticas al PDF normal ──
    const imageIds = new Map<string, number>();
    for (const [name, img] of parts.images as [string, EmbeddedImage][]) {
        let smaskId: number | null = null;
        if (img.smask) {
            smaskId = push(stream(`/Type /XObject /Subtype /Image /Width ${img.width} /Height ${img.height} `
                + '/ColorSpace /DeviceGray /BitsPerComponent 8 /Filter /FlateDecode', img.smask));
        }
        imageIds.set(name, push(stream(`/Type /XObject /Subtype /Image /Width ${img.width} /Height ${img.height} `
            + `/ColorSpace /${img.colorSpace} /BitsPerComponent 8 /Filter /${img.filter}${smaskId ? ` /SMask ${smaskId} 0 R` : ''}`, img.data)));
    }
    const fontRes = (Object.keys(fontIds) as FontKey[]).map((k) => `${resourceNames[k]} ${fontIds[k]} 0 R`).join(' ');
    const xobjects = imageIds.size ? ` /XObject << ${[...imageIds].map(([n, id]) => `/${n} ${id} 0 R`).join(' ')} >>` : '';
    const resources = `<< /Font << ${fontRes} >>${xobjects} >>`;

    // ── Páginas ──
    const pagesId = reserve();
    const pageIds = parts.pages.map((content) => {
        const contentId = push(stream('/Filter /FlateDecode', deflateSync(latin(content))));
        return push(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${PT(parts.width)} ${PT(parts.height)}] `
            + `/Resources ${resources} /Contents ${contentId} 0 R >>`);
    });
    set(pagesId, `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`);

    // ── OutputIntent sRGB ──
    const icc = Buffer.from(SRGB_ICC_BASE64, 'base64');
    const iccId = push(stream('/N 3 /Filter /FlateDecode', deflateSync(icc)));
    const intentId = push(`<< /Type /OutputIntent /S /GTS_PDFA1 /OutputConditionIdentifier (sRGB IEC61966-2.1) `
        + `/RegistryName (http://www.color.org) /Info (sRGB IEC61966-2.1) /DestOutputProfile ${iccId} 0 R >>`);

    // ── Metadatos XMP (sin filtro: §6.6.2.1) ──
    const metadataId = push(stream('/Type /Metadata /Subtype /XML', Buffer.from(xmpPacket(options), 'utf8')));

    // ── Archivos asociados ──
    const date = pdfDate(options.date);
    const specs = options.attachments.map((a) => {
        const data = Buffer.from(a.data);
        const md5 = createHash('md5').update(data).digest('hex').toUpperCase();
        const fileId = push(stream(`/Type /EmbeddedFile /Subtype ${pdfName(a.mime)} `
            + `/Params << /ModDate (${date}) /Size ${data.length} /CheckSum <${md5}> >> /Filter /FlateDecode`, deflateSync(data)));
        const specId = push(`<< /Type /Filespec /F ${pdfText(a.name)} /UF ${pdfText(a.name)} /Desc ${pdfText(a.description)} `
            + `/AFRelationship /${a.relationship} /EF << /F ${fileId} 0 R /UF ${fileId} 0 R >> >>`);
        return { name: a.name, specId };
    }).sort((x, y) => (x.name < y.name ? -1 : 1));
    const names = specs.length
        ? ` /Names << /EmbeddedFiles << /Names [${specs.map((s) => `${pdfText(s.name)} ${s.specId} 0 R`).join(' ')}] >> >>`
            + ` /AF [${specs.map((s) => `${s.specId} 0 R`).join(' ')}]`
        : '';
    const catalogId = push(`<< /Type /Catalog /Pages ${pagesId} 0 R /Metadata ${metadataId} 0 R `
        + `/OutputIntents [${intentId} 0 R]${names}${options.lang ? ` /Lang ${pdfText(options.lang)}` : ''} >>`);

    // ── /Info, idéntico al XMP ──
    const infoId = push(`<< /Title ${pdfText(options.title)} /Author ${pdfText(options.author)}`
        + (options.subject ? ` /Subject ${pdfText(options.subject)}` : '')
        + ` /Creator ${pdfText(options.creator)} /Producer ${pdfText(options.producer)}`
        + ` /CreationDate (${date}) /ModDate (${date}) >>`);

    // ── Archivo ──
    const chunks: Buffer[] = [latin('%PDF-1.7\n%\xe2\xe3\xcf\xd3\n')];
    const offsets: number[] = [0];
    let cursor = chunks[0].length;
    for (let id = 1; id < objects.length; id++) {
        const body = objects[id];
        if (!body) throw new Error(`Objeto PDF ${id} sin contenido.`);
        offsets[id] = cursor;
        const chunk = Buffer.concat([latin(`${id} 0 obj\n`), body, latin('\nendobj\n')]);
        chunks.push(chunk);
        cursor += chunk.length;
    }
    // /ID determinista: el mismo documento produce el mismo archivo.
    const fileId = createHash('md5').update(Buffer.concat(chunks)).digest('hex').toUpperCase();
    chunks.push(latin([
        `xref\n0 ${objects.length}\n`,
        '0000000000 65535 f \n',
        ...offsets.slice(1).map((value) => `${String(value).padStart(10, '0')} 00000 n \n`),
        `trailer\n<< /Size ${objects.length} /Root ${catalogId} 0 R /Info ${infoId} 0 R /ID [<${fileId}> <${fileId}>] >>\n`,
        `startxref\n${cursor}\n%%EOF\n`,
    ].join('')));
    return Buffer.concat(chunks);
}

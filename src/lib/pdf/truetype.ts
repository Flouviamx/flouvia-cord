// Lectura y subconjunto de fuentes TrueType para incrustarlas en un PDF/A.
//
// PDF/A (ISO 19005-3, §6.2.11.4) exige que TODA fuente usada para pintar texto
// vaya incrustada. Las 14 fuentes base del PDF (Helvetica, Times) que usa el
// escritor no se pueden incrustar —no son nuestras—, así que el modo de archivo
// usa Liberation Sans y Liberation Serif, que tienen las MISMAS métricas de
// avance que Arial/Helvetica y Times: el layout medido con las tablas AFM del
// escritor sigue cuadrando (lo verifica test/pdf-pdfa.test.ts).
//
// El subconjunto conserva los identificadores de glifo (los que no se usan se
// vacían) y reescribe solo `glyf`, `loca`, `cmap` y `post`. Así `hmtx`, `maxp`
// y las instrucciones de hinting siguen valiendo sin renumerar nada. El
// archivo de fuente vendorizado no se modifica: el recorte ocurre al generar
// cada documento, que es lo que la licencia OFL permite sin renombrar la
// fuente (FAQ de la OFL, incrustación en documentos).
//
// Referencia del formato: OpenType spec 1.9 (Microsoft), tablas head, hhea,
// maxp, hmtx, loca, glyf, cmap (formato 4), post (formato 3) y OS/2.

export interface TrueTypeFont {
    postScriptName: string;
    unitsPerEm: number;
    bbox: [number, number, number, number];
    ascent: number;
    descent: number;
    capHeight: number;
    italicAngle: number;
    /** Glifo para un punto de código Unicode (cmap 3,1), 0 si no existe. */
    glyphFor(codePoint: number): number;
    /** Avance horizontal del glifo en unidades de la fuente. */
    advance(glyph: number): number;
    /** Fuente nueva con solo estos glifos (y sus componentes) y un cmap 3,1 con estos puntos de código. */
    subset(codePoints: Iterable<number>): Uint8Array;
}

interface Table { offset: number; length: number }

const tagOf = (b: Uint8Array, o: number) => String.fromCharCode(b[o], b[o + 1], b[o + 2], b[o + 3]);

export function parseTrueType(input: Uint8Array): TrueTypeFont {
    // Copia en un Uint8Array PLANO: sobre un Buffer de Node, `slice()` devuelve
    // una vista que comparte memoria, y reescribir la cabecera del subconjunto
    // corrompería la fuente original (y el pool de Buffer entero).
    const bytes = Uint8Array.from(input);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const u16 = (o: number) => view.getUint16(o);
    const i16 = (o: number) => view.getInt16(o);
    const u32 = (o: number) => view.getUint32(o);

    const version = u32(0);
    if (version !== 0x00010000 && version !== 0x74727565) throw new Error('No es una fuente TrueType.');
    const numTables = u16(4);
    const tables = new Map<string, Table>();
    for (let i = 0; i < numTables; i++) {
        const rec = 12 + i * 16;
        tables.set(tagOf(bytes, rec), { offset: u32(rec + 8), length: u32(rec + 12) });
    }
    const need = (tag: string): Table => {
        const t = tables.get(tag);
        if (!t) throw new Error(`La fuente no tiene la tabla ${tag}.`);
        return t;
    };

    const head = need('head');
    const unitsPerEm = u16(head.offset + 18);
    const bbox: [number, number, number, number] = [i16(head.offset + 36), i16(head.offset + 38), i16(head.offset + 40), i16(head.offset + 42)];
    const longLoca = i16(head.offset + 50) === 1;
    const hhea = need('hhea');
    const numberOfHMetrics = u16(hhea.offset + 34);
    const numGlyphs = u16(need('maxp').offset + 4);
    const hmtx = need('hmtx');
    const loca = need('loca');
    const glyf = need('glyf');

    const os2 = tables.get('OS/2');
    // Permiso de incrustación (fsType): 0x0002 = restringida. Una fuente así no
    // se puede meter en un documento; Liberation es 0 (instalable).
    if (os2 && (u16(os2.offset + 8) & 0x0002)) throw new Error('La fuente no permite incrustarse.');
    const os2Version = os2 ? u16(os2.offset) : 0;
    const ascent = os2 ? i16(os2.offset + 68) : i16(hhea.offset + 4);
    const descent = os2 ? i16(os2.offset + 70) : i16(hhea.offset + 6);
    const capHeight = os2 && os2Version >= 2 ? i16(os2.offset + 88) : Math.round(ascent * 0.7);
    const post = tables.get('post');
    const italicAngle = post ? view.getInt32(post.offset + 4) / 65536 : 0;

    const glyphOffset = (g: number) => (longLoca ? u32(loca.offset + g * 4) : u16(loca.offset + g * 2) * 2);

    // cmap: subtabla Windows Unicode BMP (3,1), formato 4.
    const cmapT = need('cmap');
    const cmapCount = u16(cmapT.offset + 2);
    let fmt4 = -1;
    for (let i = 0; i < cmapCount; i++) {
        const rec = cmapT.offset + 4 + i * 8;
        if (u16(rec) === 3 && u16(rec + 2) === 1) {
            const off = cmapT.offset + u32(rec + 4);
            if (u16(off) === 4) fmt4 = off;
        }
    }
    if (fmt4 < 0) throw new Error('La fuente no tiene un cmap Unicode (3,1).');
    const segX2 = u16(fmt4 + 6);
    const endCodes = fmt4 + 14;
    const startCodes = endCodes + segX2 + 2;
    const idDeltas = startCodes + segX2;
    const idRangeOffsets = idDeltas + segX2;
    const glyphFor = (cp: number): number => {
        if (cp > 0xffff) return 0;
        for (let s = 0; s < segX2 / 2; s++) {
            const end = u16(endCodes + s * 2);
            if (cp > end) continue;
            const start = u16(startCodes + s * 2);
            if (cp < start) return 0;
            const delta = i16(idDeltas + s * 2);
            const rangeOffset = u16(idRangeOffsets + s * 2);
            if (!rangeOffset) return (cp + delta) & 0xffff;
            const addr = idRangeOffsets + s * 2 + rangeOffset + (cp - start) * 2;
            const g = u16(addr);
            return g ? (g + delta) & 0xffff : 0;
        }
        return 0;
    };

    const advance = (g: number) => u16(hmtx.offset + Math.min(g, numberOfHMetrics - 1) * 4);

    const name = tables.get('name');
    let postScriptName = 'Font';
    if (name) {
        const count = u16(name.offset + 2);
        const strings = name.offset + u16(name.offset + 4);
        for (let i = 0; i < count; i++) {
            const rec = name.offset + 6 + i * 12;
            if (u16(rec + 6) !== 6) continue;
            const len = u16(rec + 8);
            const off = strings + u16(rec + 10);
            const platform = u16(rec);
            let s = '';
            if (platform === 3 || platform === 0) for (let k = 0; k < len; k += 2) s += String.fromCharCode(u16(off + k));
            else for (let k = 0; k < len; k++) s += String.fromCharCode(bytes[off + k]);
            if (s) { postScriptName = s.replace(/[^A-Za-z0-9-]/g, ''); break; }
        }
    }

    /** Glifos que un compuesto referencia (componentes), recursivo. */
    const components = (g: number, out: Set<number>) => {
        const start = glyf.offset + glyphOffset(g);
        const end = glyf.offset + glyphOffset(g + 1);
        if (end - start < 10 || i16(start) >= 0) return;
        let p = start + 10;
        for (;;) {
            const flags = u16(p);
            const child = u16(p + 2);
            if (!out.has(child)) { out.add(child); components(child, out); }
            p += 4 + (flags & 0x0001 ? 4 : 2);
            if (flags & 0x0008) p += 2;
            else if (flags & 0x0040) p += 4;
            else if (flags & 0x0080) p += 8;
            if (!(flags & 0x0020)) break;
        }
    };

    function subset(codePoints: Iterable<number>): Uint8Array {
        const map = new Map<number, number>();
        for (const cp of codePoints) {
            const g = glyphFor(cp);
            if (g) map.set(cp, g);
        }
        const keep = new Set<number>([0, ...map.values()]);
        for (const g of [...keep]) components(g, keep);

        // glyf + loca (formato largo), mismos índices.
        const glyfParts: Uint8Array[] = [];
        const locaOut = new DataView(new ArrayBuffer((numGlyphs + 1) * 4));
        let cursor = 0;
        for (let g = 0; g < numGlyphs; g++) {
            locaOut.setUint32(g * 4, cursor);
            if (!keep.has(g)) continue;
            const start = glyphOffset(g);
            const end = glyphOffset(g + 1);
            const len = end - start;
            if (len <= 0) continue;
            const padded = (len + 3) & ~3;
            const chunk = new Uint8Array(padded);
            chunk.set(bytes.subarray(glyf.offset + start, glyf.offset + end));
            glyfParts.push(chunk);
            cursor += padded;
        }
        locaOut.setUint32(numGlyphs * 4, cursor);
        const glyfOut = concat(glyfParts);

        const out = new Map<string, Uint8Array>();
        const copy = (tag: string) => {
            const t = tables.get(tag);
            if (t) out.set(tag, bytes.slice(t.offset, t.offset + t.length));
        };
        ['hhea', 'maxp', 'hmtx', 'cvt ', 'fpgm', 'prep', 'name', 'OS/2'].forEach(copy);
        const headOut = bytes.slice(head.offset, head.offset + head.length);
        const hv = new DataView(headOut.buffer);
        hv.setUint32(8, 0); // checkSumAdjustment, se recalcula al final
        hv.setInt16(50, 1); // indexToLocFormat largo
        out.set('head', headOut);
        out.set('loca', new Uint8Array(locaOut.buffer));
        out.set('glyf', glyfOut);
        out.set('cmap', cmapFormat4(map));
        // post 3.0: sin nombres de glifo. El visor llega al glifo por el cmap
        // (código WinAnsi → Unicode → glifo), que es lo que pide PDF/A para
        // una TrueType no simbólica (ISO 19005-3, §6.2.11.6).
        if (post) {
            const p3 = bytes.slice(post.offset, post.offset + 32);
            new DataView(p3.buffer).setUint32(0, 0x00030000);
            out.set('post', p3);
        }
        return assemble(out);
    }

    return { postScriptName, unitsPerEm, bbox, ascent, descent, capHeight, italicAngle, glyphFor, advance, subset };
}

function concat(parts: Uint8Array[]): Uint8Array {
    const total = parts.reduce((s, p) => s + p.length, 0);
    const out = new Uint8Array(total);
    let o = 0;
    for (const p of parts) { out.set(p, o); o += p.length; }
    return out;
}

/** cmap con una sola subtabla (3,1) formato 4 para los puntos de código dados. */
function cmapFormat4(map: Map<number, number>): Uint8Array {
    const codes = [...map.keys()].filter((c) => c <= 0xffff).sort((a, b) => a - b);
    // Un segmento por punto de código, con idDelta: simple y suficiente para
    // los ~220 caracteres de WinAnsi.
    const segs = codes.map((c) => ({ start: c, end: c, delta: (map.get(c)! - c) & 0xffff }));
    segs.push({ start: 0xffff, end: 0xffff, delta: 1 });
    const segCount = segs.length;
    const length = 16 + segCount * 8;
    const sub = new DataView(new ArrayBuffer(length));
    let searchRange = 1;
    let entrySelector = 0;
    while (searchRange * 2 <= segCount) { searchRange *= 2; entrySelector++; }
    searchRange *= 2;
    sub.setUint16(0, 4);
    sub.setUint16(2, length);
    sub.setUint16(4, 0);
    sub.setUint16(6, segCount * 2);
    sub.setUint16(8, searchRange);
    sub.setUint16(10, entrySelector);
    sub.setUint16(12, segCount * 2 - searchRange);
    segs.forEach((s, i) => {
        sub.setUint16(14 + i * 2, s.end);
        sub.setUint16(16 + segCount * 2 + i * 2, s.start);
        sub.setUint16(16 + segCount * 4 + i * 2, s.delta);
        sub.setUint16(16 + segCount * 6 + i * 2, 0);
    });
    const header = new DataView(new ArrayBuffer(12));
    header.setUint16(0, 0);
    header.setUint16(2, 1);
    header.setUint16(4, 3);
    header.setUint16(6, 1);
    header.setUint32(8, 12);
    return concat([new Uint8Array(header.buffer), new Uint8Array(sub.buffer)]);
}

function checksum(data: Uint8Array): number {
    const padded = new Uint8Array((data.length + 3) & ~3);
    padded.set(data);
    const v = new DataView(padded.buffer);
    let sum = 0;
    for (let i = 0; i < padded.length; i += 4) sum = (sum + v.getUint32(i)) >>> 0;
    return sum;
}

/** Arma el archivo: directorio ordenado por etiqueta, tablas alineadas a 4 bytes. */
function assemble(tables: Map<string, Uint8Array>): Uint8Array {
    const tags = [...tables.keys()].sort();
    const numTables = tags.length;
    let searchRange = 1;
    let entrySelector = 0;
    while (searchRange * 2 <= numTables) { searchRange *= 2; entrySelector++; }
    searchRange *= 16;
    const headerLen = 12 + numTables * 16;
    const header = new DataView(new ArrayBuffer(headerLen));
    header.setUint32(0, 0x00010000);
    header.setUint16(4, numTables);
    header.setUint16(6, searchRange);
    header.setUint16(8, entrySelector);
    header.setUint16(10, numTables * 16 - searchRange);
    const bodies: Uint8Array[] = [];
    let offset = headerLen;
    let headOffset = -1;
    tags.forEach((tag, i) => {
        const data = tables.get(tag)!;
        const rec = 12 + i * 16;
        for (let k = 0; k < 4; k++) header.setUint8(rec + k, tag.charCodeAt(k));
        header.setUint32(rec + 4, checksum(data));
        header.setUint32(rec + 8, offset);
        header.setUint32(rec + 12, data.length);
        if (tag === 'head') headOffset = offset;
        const padded = new Uint8Array((data.length + 3) & ~3);
        padded.set(data);
        bodies.push(padded);
        offset += padded.length;
    });
    const font = concat([new Uint8Array(header.buffer), ...bodies]);
    if (headOffset >= 0) {
        const adjustment = (0xb1b0afba - checksum(font)) >>> 0;
        new DataView(font.buffer).setUint32(headOffset + 8, adjustment);
    }
    return font;
}

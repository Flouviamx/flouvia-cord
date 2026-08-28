import { createHash, randomUUID } from 'node:crypto';

export type AllowedUploadMime = 'image/jpeg' | 'image/png' | 'application/pdf';

const MIME_EXT: Record<AllowedUploadMime, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'application/pdf': 'pdf',
};

export interface GuardedUpload {
    bytes: Buffer;
    mime: AllowedUploadMime;
    filename: string;
    /** Huella de los bytes YA saneados. Identifica el envío sin guardar la imagen. */
    sha256: string;
    /** Dimensiones reales, leídas de la cabecera. `null` en PDF. */
    ancho: number | null;
    alto: number | null;
    /** `true` si la imagen no tiene color. El proveedor auto-rechaza esos documentos. */
    escalaDeGrises: boolean;
}

function sniffMime(bytes: Buffer): AllowedUploadMime | null {
    if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
    if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
    if (bytes.length >= 5 && bytes.subarray(0, 5).toString('ascii') === '%PDF-') return 'application/pdf';
    return null;
}

// ── Lectura de la cabecera, sin decodificar la imagen ────────────────────────
//
// El guard no miraba NADA del contenido más allá de los primeros bytes: un JPEG
// de 1×1 px pasaba, y también un PNG de 50 000×50 000 (bomba de descompresión).
// Tampoco sabía si la imagen era en blanco y negro, que el proveedor rechaza
// automáticamente.
//
// Se lee a mano en vez de traer una dependencia: `sharp` metería un binario
// nativo al bundle serverless y —peor— re-codificar degradaría la imagen justo
// antes de que el proveedor la lea. Aquí sólo se leen cabeceras.

export interface ImageProbe {
    ancho: number;
    alto: number;
    escalaDeGrises: boolean;
    /** Orientación EXIF del JPEG (1 = normal). `null` si no la declara. */
    orientacion: number | null;
}

/**
 * Marcadores SOF de JPEG: C0-C3, C5-C7, C9-CB, CD-CF.
 *
 * Es el punto donde casi todas las implementaciones se equivocan: **C4 es DHT
 * (tablas Huffman), C8 es JPG y CC es DAC** — no son SOF, y tratarlos como tales
 * hace que se lean dimensiones basura de una tabla.
 */
function esSOF(marcador: number): boolean {
    return (marcador >= 0xc0 && marcador <= 0xc3)
        || (marcador >= 0xc5 && marcador <= 0xc7)
        || (marcador >= 0xc9 && marcador <= 0xcb)
        || (marcador >= 0xcd && marcador <= 0xcf);
}

/** Marcadores sin campo de longitud: RSTn (D0-D7), SOI, EOI y TEM. */
function esAutonomo(marcador: number): boolean {
    return (marcador >= 0xd0 && marcador <= 0xd9) || marcador === 0x01;
}

function leerOrientacionExif(seg: Buffer): number | null {
    // seg = payload de APP1, empezando en "Exif\0\0".
    if (seg.length < 14 || seg.subarray(0, 4).toString('ascii') !== 'Exif') return null;
    const tiff = seg.subarray(6);
    const le = tiff.subarray(0, 2).toString('ascii') === 'II';
    if (!le && tiff.subarray(0, 2).toString('ascii') !== 'MM') return null;
    const u16 = (o: number) => (le ? tiff.readUInt16LE(o) : tiff.readUInt16BE(o));
    const u32 = (o: number) => (le ? tiff.readUInt32LE(o) : tiff.readUInt32BE(o));
    try {
        const ifd0 = u32(4);
        if (ifd0 + 2 > tiff.length) return null;
        const n = u16(ifd0);
        for (let i = 0; i < n; i++) {
            const entrada = ifd0 + 2 + i * 12;
            if (entrada + 12 > tiff.length) return null;
            if (u16(entrada) === 0x0112) return u16(entrada + 8);
        }
    } catch { return null; }
    return null;
}

export function probeImage(bytes: Buffer, mime: AllowedUploadMime): ImageProbe | null {
    if (mime === 'application/pdf') return null;

    if (mime === 'image/png') {
        // IHDR es siempre el primer chunk: ancho y alto son dos u32 big-endian en
        // los bytes 16-23, y el color type está en el 25.
        if (bytes.length < 26) return null;
        const colorType = bytes[25];
        return {
            ancho: bytes.readUInt32BE(16),
            alto: bytes.readUInt32BE(20),
            // 0 = gris, 4 = gris con alfa. Confirmación exacta y gratis.
            escalaDeGrises: colorType === 0 || colorType === 4,
            orientacion: null,
        };
    }

    let i = 2; // saltar SOI
    let orientacion: number | null = null;
    while (i < bytes.length - 1) {
        if (bytes[i] !== 0xff) { i++; continue; }
        let marcador = bytes[i + 1];
        // Relleno: una secuencia de 0xFF antes del marcador real es legal.
        while (marcador === 0xff && i + 2 < bytes.length) { i++; marcador = bytes[i + 1]; }
        if (esAutonomo(marcador)) { i += 2; continue; }
        if (i + 4 > bytes.length) break;
        const longitud = bytes.readUInt16BE(i + 2);
        if (longitud < 2 || i + 2 + longitud > bytes.length) break;

        if (marcador === 0xe1 && orientacion === null) {
            orientacion = leerOrientacionExif(bytes.subarray(i + 4, i + 2 + longitud));
        }
        if (esSOF(marcador)) {
            // payload: precisión(1) alto(2) ancho(2) componentes(1)
            if (i + 9 > bytes.length) break;
            return {
                alto: bytes.readUInt16BE(i + 5),
                ancho: bytes.readUInt16BE(i + 7),
                // Un JPEG con UN solo componente es luminancia pura: gris.
                escalaDeGrises: bytes[i + 9] === 1,
                orientacion,
            };
        }
        if (marcador === 0xda) break; // SOS: a partir de aquí van datos comprimidos
        i += 2 + longitud;
    }
    return null;
}

// ── Saneamiento: quitar metadatos sin re-codificar ───────────────────────────
//
// El EXIF viajaba INTACTO al proveedor: coordenadas GPS del domicilio donde se
// tomó la foto, modelo y número de serie del teléfono, y a veces una miniatura
// del encuadre original. Se elimina reescribiendo la cadena de segmentos, que no
// toca un solo bit de la imagen — re-codificar sí la degradaría.

/** APP1 mínimo que conserva SÓLO la orientación. 32 bytes de payload. */
function app1SoloOrientacion(orientacion: number): Buffer {
    const payload = Buffer.alloc(32);
    payload.write('Exif\0\0', 0, 'ascii');
    payload.write('II', 6, 'ascii');
    payload.writeUInt16LE(0x2a, 8);
    payload.writeUInt32LE(8, 10);   // offset a IFD0, relativo al header TIFF
    payload.writeUInt16LE(1, 14);   // una entrada
    payload.writeUInt16LE(0x0112, 16); // tag Orientation
    payload.writeUInt16LE(3, 18);   // tipo SHORT
    payload.writeUInt32LE(1, 20);   // count (4 bytes: 20..23)
    // El valor de una entrada IFD va en entrada+8. La entrada empieza en 16, así
    // que aquí — escribirlo en 22 pisa el campo `count`.
    payload.writeUInt16LE(orientacion, 24);
    payload.writeUInt32LE(0, 28);   // no hay IFD siguiente
    const seg = Buffer.alloc(4 + payload.length);
    seg[0] = 0xff; seg[1] = 0xe1;
    seg.writeUInt16BE(payload.length + 2, 2);
    payload.copy(seg, 4);
    return seg;
}

function limpiarJpeg(bytes: Buffer, orientacion: number | null): Buffer {
    const salida: Buffer[] = [bytes.subarray(0, 2)]; // SOI
    let i = 2;
    while (i < bytes.length - 1) {
        if (bytes[i] !== 0xff) { i++; continue; }
        let marcador = bytes[i + 1];
        while (marcador === 0xff && i + 2 < bytes.length) { i++; marcador = bytes[i + 1]; }

        if (marcador === 0xda) {
            // SOS: los datos comprimidos que siguen NO se pueden escanear buscando
            // marcadores (aparecen por azar). Se copia el resto verbatim.
            salida.push(bytes.subarray(i));
            break;
        }
        if (esAutonomo(marcador)) { salida.push(bytes.subarray(i, i + 2)); i += 2; continue; }
        if (i + 4 > bytes.length) break;
        const longitud = bytes.readUInt16BE(i + 2);
        if (longitud < 2 || i + 2 + longitud > bytes.length) break;

        const esApp = marcador >= 0xe0 && marcador <= 0xef;
        const esComentario = marcador === 0xfe;
        // Se CONSERVAN: APP0 (JFIF, inofensivo y esperado por decodificadores
        // ingenuos) y APP2 (perfil ICC — tirarlo altera el color de una foto de
        // gama amplia, y hay un chequeo de color en juego).
        const conservar = marcador === 0xe0 || marcador === 0xe2;
        if (!(esApp || esComentario) || conservar) {
            salida.push(bytes.subarray(i, i + 2 + longitud));
        }
        i += 2 + longitud;
    }

    // La orientación vive en el APP1 que acabamos de tirar. Strippearla sin más
    // convertiría una foto vertical de iPhone en un documento acostado: habríamos
    // "arreglado" la privacidad rompiendo el KYC. Se reinyecta un APP1 mínimo con
    // SÓLO esa etiqueta — sin GPS, sin modelo, sin miniatura.
    if (orientacion && orientacion !== 1) {
        salida.splice(1, 0, app1SoloOrientacion(orientacion));
    }
    return Buffer.concat(salida);
}

function limpiarPng(bytes: Buffer): Buffer {
    // Chunks de metadatos. El CRC es POR CHUNK, así que quitarlos enteros no
    // obliga a recalcular nada.
    const FUERA = new Set(['tEXt', 'zTXt', 'iTXt', 'eXIf', 'tIME']);
    const salida: Buffer[] = [bytes.subarray(0, 8)];
    let i = 8;
    while (i + 8 <= bytes.length) {
        const longitud = bytes.readUInt32BE(i);
        const tipo = bytes.subarray(i + 4, i + 8).toString('ascii');
        const total = 12 + longitud;
        if (longitud > bytes.length || i + total > bytes.length) break;
        if (!FUERA.has(tipo)) salida.push(bytes.subarray(i, i + total));
        i += total;
        // Anti-polyglot: nada después de IEND.
        if (tipo === 'IEND') break;
    }
    return Buffer.concat(salida);
}

export async function guardUpload(
    file: File,
    options: { maxBytes?: number; allowedMimes?: AllowedUploadMime[]; prefix?: string; requireImage?: boolean } = {},
): Promise<GuardedUpload> {
    const maxBytes = options.maxBytes ?? 10 * 1024 * 1024;
    const allowed = options.allowedMimes ?? ['image/jpeg', 'image/png', 'application/pdf'];
    if (!(file instanceof File) || file.size <= 0) throw new Error('Archivo vacío o inválido');
    if (file.size > maxBytes) throw new Error(`El archivo excede ${Math.floor(maxBytes / 1024 / 1024)} MB`);

    let bytes: Buffer = Buffer.from(await file.arrayBuffer());
    const sniffed = sniffMime(bytes);
    if (!sniffed || !allowed.includes(sniffed)) throw new Error('Tipo de archivo no permitido');
    if (file.type && file.type !== 'application/octet-stream' && file.type !== sniffed) {
        throw new Error('El contenido del archivo no coincide con su tipo declarado');
    }

    let ancho: number | null = null;
    let alto: number | null = null;
    let escalaDeGrises = false;

    if (sniffed !== 'application/pdf') {
        const probe = probeImage(bytes, sniffed);
        if (!probe) throw new Error('No pudimos leer la imagen. Vuelve a tomar la foto.');
        ancho = probe.ancho;
        alto = probe.alto;
        escalaDeGrises = probe.escalaDeGrises;

        const lado = Math.max(ancho, alto);
        const corto = Math.min(ancho, alto);
        // Tope del proveedor: rechaza cualquier lado mayor a 8000 px.
        if (lado > 8000) throw new Error('La imagen es demasiado grande. Redúcela a 8000 píxeles o menos por lado.');
        // Techo propio de memoria, independiente del anterior: una imagen muy
        // alargada puede caber en 8000 por lado y aun así ser enorme.
        if (ancho * alto > 40_000_000) throw new Error('La imagen tiene demasiados píxeles. Toma la foto de nuevo.');
        if (corto < 1 || lado < 1) throw new Error('La imagen no es válida.');
        // Nada con esta forma es un documento; es casi siempre un archivo roto.
        if (lado / Math.max(1, corto) > 6) throw new Error('La foto no parece un documento. Encuádralo completo e inténtalo de nuevo.');

        if (options.requireImage) {
            // Piso de legibilidad, sólo para documentos de identidad: por debajo
            // de esto el proveedor no puede leer el documento y lo rechaza por
            // ilegible, que es un ciclo de días perdido para el usuario.
            if (lado < 600) throw new Error('La foto tiene muy poca resolución. Acércate al documento o usa la cámara de tu teléfono.');
            if (escalaDeGrises) throw new Error('La foto está en blanco y negro. Necesitamos una foto a color del documento.');
        }

        bytes = sniffed === 'image/jpeg' ? limpiarJpeg(bytes, probe.orientacion) : limpiarPng(bytes);

        // Anti-polyglot en JPEG: se exige el fin de imagen y se trunca cualquier
        // cosa anexada después (el truco clásico del ZIP pegado al final).
        if (sniffed === 'image/jpeg') {
            const eoi = bytes.lastIndexOf(Buffer.from([0xff, 0xd9]));
            if (eoi === -1) throw new Error('El archivo de imagen está incompleto.');
            if (eoi + 2 < bytes.length) bytes = bytes.subarray(0, eoi + 2);
        }
    }

    const prefix = String(options.prefix || 'doc').replace(/[^a-z0-9_-]/gi, '').slice(0, 20) || 'doc';
    return {
        bytes,
        mime: sniffed,
        filename: `${prefix}-${randomUUID()}.${MIME_EXT[sniffed]}`,
        sha256: createHash('sha256').update(bytes).digest('hex'),
        ancho,
        alto,
        escalaDeGrises,
    };
}

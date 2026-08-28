import { describe, it, expect } from 'vitest';
import { probeImage, guardUpload } from '../src/lib/upload-guard';

// JPEG y PNG fabricados a mano. No hay ficheros de prueba: cada byte está aquí
// para que el test diga exactamente QUÉ estructura se está afirmando.

/** Segmento JPEG con marcador y payload. */
function seg(marcador: number, payload: Buffer): Buffer {
    const s = Buffer.alloc(4 + payload.length);
    s[0] = 0xff; s[1] = marcador;
    s.writeUInt16BE(payload.length + 2, 2);
    payload.copy(s, 4);
    return s;
}

/** SOF: precisión(1) alto(2) ancho(2) componentes(1) + 3 bytes por componente. */
function sof(ancho: number, alto: number, componentes = 3, marcador = 0xc0): Buffer {
    const p = Buffer.alloc(6 + componentes * 3);
    p[0] = 8;
    p.writeUInt16BE(alto, 1);
    p.writeUInt16BE(ancho, 3);
    p[5] = componentes;
    return seg(marcador, p);
}

function exifApp1(orientacion: number, conGps = false): Buffer {
    const entradas = conGps ? 2 : 1;
    const p = Buffer.alloc(6 + 8 + 2 + entradas * 12 + 4);
    p.write('Exif\0\0', 0, 'ascii');
    p.write('II', 6, 'ascii');
    p.writeUInt16LE(0x2a, 8);
    p.writeUInt32LE(8, 10);
    p.writeUInt16LE(entradas, 14);
    // Entrada IFD de 12 bytes: tag(2) tipo(2) count(4) valor(4). El valor va en
    // entrada+8, o sea 24 para la primera entrada.
    p.writeUInt16LE(0x0112, 16); p.writeUInt16LE(3, 18); p.writeUInt32LE(1, 20); p.writeUInt16LE(orientacion, 24);
    if (conGps) {
        // Tag GPSInfo — el dato que NO puede sobrevivir al saneamiento.
        p.writeUInt16LE(0x8825, 28); p.writeUInt16LE(4, 30); p.writeUInt32LE(1, 32); p.writeUInt32LE(999, 36);
    }
    return seg(0xe1, p);
}

const SOI = Buffer.from([0xff, 0xd8]);
const EOI = Buffer.from([0xff, 0xd9]);
const SOS = seg(0xda, Buffer.from([0x01, 0x01, 0x00, 0x00, 0x3f, 0x00]));
const DATOS = Buffer.from([0x12, 0x34, 0x56, 0x78]);

const jpeg = (...partes: Buffer[]) => Buffer.concat([SOI, ...partes, SOS, DATOS, EOI]);

function png(ancho: number, alto: number, colorType = 6, extra: Buffer[] = []): Buffer {
    const firma = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const ihdrData = Buffer.alloc(13);
    ihdrData.writeUInt32BE(ancho, 0);
    ihdrData.writeUInt32BE(alto, 4);
    ihdrData[8] = 8; ihdrData[9] = colorType;
    const chunk = (tipo: string, data: Buffer) => {
        const c = Buffer.alloc(12 + data.length);
        c.writeUInt32BE(data.length, 0);
        c.write(tipo, 4, 'ascii');
        data.copy(c, 8);
        c.writeUInt32BE(0, 8 + data.length); // CRC: irrelevante para el parser
        return c;
    };
    return Buffer.concat([firma, chunk('IHDR', ihdrData), ...extra, chunk('IDAT', Buffer.from([1, 2, 3])), chunk('IEND', Buffer.alloc(0))]);
}

const archivo = (bytes: Buffer, type = 'image/jpeg') =>
    new File([new Uint8Array(bytes)], 'x', { type });

describe('probeImage — JPEG', () => {
    it('lee ancho y alto del SOF', () => {
        expect(probeImage(jpeg(sof(1600, 1200)), 'image/jpeg')).toMatchObject({ ancho: 1600, alto: 1200 });
    });

    it('NO confunde DHT (C4), JPG (C8) ni DAC (CC) con un SOF', () => {
        // Es el error clásico: tratar "0xC0–0xCF" como si todo fuera SOF hace que
        // se lean dimensiones basura de una tabla Huffman.
        const trampa = jpeg(
            seg(0xc4, Buffer.from([0x00, 0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77])), // DHT
            seg(0xcc, Buffer.from([0x99, 0x88, 0x77, 0x66, 0x55, 0x44])),             // DAC
            sof(800, 600),
        );
        expect(probeImage(trampa, 'image/jpeg')).toMatchObject({ ancho: 800, alto: 600 });
    });

    it('tolera relleno 0xFF antes del marcador', () => {
        const conRelleno = Buffer.concat([SOI, Buffer.from([0xff, 0xff]), sof(640, 480), SOS, DATOS, EOI]);
        expect(probeImage(conRelleno, 'image/jpeg')).toMatchObject({ ancho: 640, alto: 480 });
    });

    it('detecta escala de grises por número de componentes', () => {
        expect(probeImage(jpeg(sof(900, 700, 1)), 'image/jpeg')!.escalaDeGrises).toBe(true);
        expect(probeImage(jpeg(sof(900, 700, 3)), 'image/jpeg')!.escalaDeGrises).toBe(false);
    });

    it('lee la orientación EXIF', () => {
        expect(probeImage(jpeg(exifApp1(6), sof(100, 100)), 'image/jpeg')!.orientacion).toBe(6);
        expect(probeImage(jpeg(sof(100, 100)), 'image/jpeg')!.orientacion).toBeNull();
    });
});

describe('probeImage — PNG', () => {
    it('lee IHDR', () => {
        expect(probeImage(png(1024, 768), 'image/png')).toMatchObject({ ancho: 1024, alto: 768 });
    });
    it('detecta gris por color type 0 y 4', () => {
        expect(probeImage(png(10, 10, 0), 'image/png')!.escalaDeGrises).toBe(true);
        expect(probeImage(png(10, 10, 4), 'image/png')!.escalaDeGrises).toBe(true);
        expect(probeImage(png(10, 10, 6), 'image/png')!.escalaDeGrises).toBe(false);
    });
});

describe('guardUpload — rangos', () => {
    const ok = { prefix: 'identity' as const };

    it('rechaza un JPEG de 1×1, que antes pasaba', async () => {
        await expect(guardUpload(archivo(jpeg(sof(1, 1))), { ...ok, requireImage: true })).rejects.toThrow(/resolución/i);
    });

    it('rechaza por encima del tope de 8000 px del proveedor', async () => {
        await expect(guardUpload(archivo(jpeg(sof(9000, 100))), ok)).rejects.toThrow(/8000/);
    });

    it('rechaza una forma que no es un documento', async () => {
        await expect(guardUpload(archivo(jpeg(sof(7000, 700))), ok)).rejects.toThrow(/documento/i);
    });

    it('rechaza blanco y negro cuando es documento de identidad', async () => {
        await expect(
            guardUpload(archivo(jpeg(sof(1200, 900, 1))), { ...ok, requireImage: true }),
        ).rejects.toThrow(/blanco y negro/i);
    });

    it('acepta blanco y negro cuando NO es documento de identidad', async () => {
        const r = await guardUpload(archivo(jpeg(sof(1200, 900, 1))), ok);
        expect(r.escalaDeGrises).toBe(true);
    });

    it('acepta una foto normal y reporta sus dimensiones', async () => {
        const r = await guardUpload(archivo(jpeg(sof(1600, 1000))), { ...ok, requireImage: true });
        expect(r).toMatchObject({ ancho: 1600, alto: 1000, escalaDeGrises: false, mime: 'image/jpeg' });
        expect(r.sha256).toMatch(/^[0-9a-f]{64}$/);
        expect(r.filename).toMatch(/^identity-[0-9a-f-]{36}\.jpg$/);
    });
});

describe('guardUpload — saneamiento', () => {
    it('elimina el EXIF, incluido el GPS', async () => {
        const conGps = jpeg(exifApp1(1, true), sof(1200, 900));
        expect(conGps.includes(Buffer.from('Exif'))).toBe(true);
        const r = await guardUpload(archivo(conGps), { prefix: 'identity' });
        expect(r.bytes.includes(Buffer.from('Exif'))).toBe(false);
    });

    it('CONSERVA la orientación cuando no es 1, sin conservar el GPS', async () => {
        // Strippear la orientación sin rotar los píxeles acostaría una foto
        // vertical de iPhone: se "arreglaría" la privacidad rompiendo el KYC.
        const r = await guardUpload(archivo(jpeg(exifApp1(6, true), sof(1200, 900))), { prefix: 'identity' });
        expect(probeImage(r.bytes, 'image/jpeg')!.orientacion).toBe(6);
        // El APP1 reinyectado mide 36 bytes: sólo cabe la etiqueta Orientation.
        expect(r.bytes.length).toBeLessThan(conGpsLen(6));
    });

    it('no reinyecta EXIF cuando la orientación ya es normal', async () => {
        const r = await guardUpload(archivo(jpeg(exifApp1(1), sof(1200, 900))), { prefix: 'identity' });
        expect(r.bytes.includes(Buffer.from('Exif'))).toBe(false);
    });

    it('conserva JFIF (APP0) e ICC (APP2)', async () => {
        const icc = seg(0xe2, Buffer.concat([Buffer.from('ICC_PROFILE\0', 'ascii'), Buffer.from([1, 2, 3])]));
        const jfif = seg(0xe0, Buffer.from('JFIF\0', 'ascii'));
        const r = await guardUpload(archivo(jpeg(jfif, icc, sof(1200, 900))), { prefix: 'identity' });
        expect(r.bytes.includes(Buffer.from('ICC_PROFILE'))).toBe(true);
        expect(r.bytes.includes(Buffer.from('JFIF'))).toBe(true);
    });

    it('trunca lo que venga pegado después del fin de imagen (polyglot)', async () => {
        const conZip = Buffer.concat([jpeg(sof(1200, 900)), Buffer.from('PK\x03\x04CARGA_UTIL')]);
        const r = await guardUpload(archivo(conZip), { prefix: 'identity' });
        expect(r.bytes.includes(Buffer.from('CARGA_UTIL'))).toBe(false);
        expect(r.bytes.subarray(-2).equals(Buffer.from([0xff, 0xd9]))).toBe(true);
    });

    it('quita los chunks de texto del PNG y respeta IEND', async () => {
        const texto = (() => {
            const d = Buffer.from('CommentSECRETO', 'ascii');
            const c = Buffer.alloc(12 + d.length);
            c.writeUInt32BE(d.length, 0); c.write('tEXt', 4, 'ascii'); d.copy(c, 8);
            return c;
        })();
        const r = await guardUpload(archivo(png(500, 400, 6, [texto]), 'image/png'), { prefix: 'identity' });
        expect(r.bytes.includes(Buffer.from('SECRETO'))).toBe(false);
        expect(probeImage(r.bytes, 'image/png')).toMatchObject({ ancho: 500, alto: 400 });
    });

    it('el saneamiento es idempotente', async () => {
        const uno = await guardUpload(archivo(jpeg(exifApp1(1, true), sof(1200, 900))), { prefix: 'identity' });
        const dos = await guardUpload(archivo(uno.bytes), { prefix: 'identity' });
        expect(dos.sha256).toBe(uno.sha256);
    });

    it('rechaza un JPEG sin fin de imagen', async () => {
        const truncado = Buffer.concat([SOI, sof(1200, 900), SOS, DATOS]);
        await expect(guardUpload(archivo(truncado), { prefix: 'identity' })).rejects.toThrow(/incompleto/i);
    });
});

describe('guardUpload — tipos', () => {
    it('rechaza PDF cuando sólo se permiten imágenes', async () => {
        const pdf = Buffer.concat([Buffer.from('%PDF-1.4\n', 'ascii'), Buffer.alloc(64)]);
        await expect(
            guardUpload(archivo(pdf, 'application/pdf'), { allowedMimes: ['image/jpeg', 'image/png'] }),
        ).rejects.toThrow(/no permitido/i);
    });

    it('rechaza cuando el tipo declarado contradice los bytes', async () => {
        await expect(guardUpload(archivo(jpeg(sof(100, 100)), 'image/png'), {})).rejects.toThrow(/no coincide/i);
    });
});

function conGpsLen(orientacion: number): number {
    return jpeg(exifApp1(orientacion, true), sof(1200, 900)).length;
}

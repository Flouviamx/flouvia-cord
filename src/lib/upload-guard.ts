import { randomUUID } from 'node:crypto';

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
}

function sniffMime(bytes: Buffer): AllowedUploadMime | null {
    if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
    if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
    if (bytes.length >= 5 && bytes.subarray(0, 5).toString('ascii') === '%PDF-') return 'application/pdf';
    return null;
}

export async function guardUpload(
    file: File,
    options: { maxBytes?: number; allowedMimes?: AllowedUploadMime[]; prefix?: string } = {},
): Promise<GuardedUpload> {
    const maxBytes = options.maxBytes ?? 10 * 1024 * 1024;
    const allowed = options.allowedMimes ?? ['image/jpeg', 'image/png', 'application/pdf'];
    if (!(file instanceof File) || file.size <= 0) throw new Error('Archivo vacío o inválido');
    if (file.size > maxBytes) throw new Error(`El archivo excede ${Math.floor(maxBytes / 1024 / 1024)} MB`);

    const bytes = Buffer.from(await file.arrayBuffer());
    const sniffed = sniffMime(bytes);
    if (!sniffed || !allowed.includes(sniffed)) throw new Error('Tipo de archivo no permitido');
    if (file.type && file.type !== 'application/octet-stream' && file.type !== sniffed) {
        throw new Error('El contenido del archivo no coincide con su tipo declarado');
    }

    const prefix = String(options.prefix || 'doc').replace(/[^a-z0-9_-]/gi, '').slice(0, 20) || 'doc';
    return {
        bytes,
        mime: sniffed,
        filename: `${prefix}-${randomUUID()}.${MIME_EXT[sniffed]}`,
    };
}

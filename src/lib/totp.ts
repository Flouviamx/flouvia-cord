// src/lib/totp.ts — TOTP (RFC 6238) sobre HOTP (RFC 4226), implementado con
// node:crypto puro (sin dependencia externa). El secreto se genera y guarda
// en base32 (formato estándar que leen Google Authenticator/1Password/etc);
// el código QR se renderiza LOCALMENTE con `qrcode` — el secreto nunca sale
// del servidor hacia un tercero.
import { createHmac, randomBytes, createHash, timingSafeEqual } from 'node:crypto';

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const STEP_SECONDS = 30;

function base32Encode(buf: Buffer): string {
    let bits = 0, value = 0, output = '';
    for (const byte of buf) {
        value = (value << 8) | byte;
        bits += 8;
        while (bits >= 5) {
            output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
            bits -= 5;
        }
    }
    if (bits > 0) output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
    return output;
}

function base32Decode(str: string): Buffer {
    const clean = str.toUpperCase().replace(/[^A-Z2-7]/g, '');
    let bits = 0, value = 0;
    const bytes: number[] = [];
    for (const char of clean) {
        const idx = BASE32_ALPHABET.indexOf(char);
        if (idx === -1) continue;
        value = (value << 5) | idx;
        bits += 5;
        if (bits >= 8) {
            bytes.push((value >>> (bits - 8)) & 0xff);
            bits -= 8;
        }
    }
    return Buffer.from(bytes);
}

function hotp(secret: Buffer, counter: number): string {
    const buf = Buffer.alloc(8);
    // counter cabe cómodo en 32 bits hasta el año ~2554 (30s de paso); se
    // escribe explícito de 64 bits por apego estricto al RFC.
    buf.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
    buf.writeUInt32BE(counter % 0x100000000, 4);
    const hmac = createHmac('sha1', secret).update(buf).digest();
    const offset = hmac[hmac.length - 1] & 0xf;
    const code =
        ((hmac[offset] & 0x7f) << 24) |
        ((hmac[offset + 1] & 0xff) << 16) |
        ((hmac[offset + 2] & 0xff) << 8) |
        (hmac[offset + 3] & 0xff);
    return String(code % 1_000_000).padStart(6, '0');
}

function timingSafeEqualStr(a: string, b: string): boolean {
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);
    if (bufA.length !== bufB.length) return false;
    return timingSafeEqual(bufA, bufB);
}

/** Genera un secreto TOTP nuevo (160 bits, el tamaño recomendado para HMAC-SHA1), en base32. */
export function generateTotpSecret(): string {
    return base32Encode(randomBytes(20));
}

/** Verifica un código de 6 dígitos contra el secreto, con ventana de ±1 paso (±30s) por deriva de reloj del cliente. */
export function verifyTotp(base32Secret: string, token: string, window = 1): boolean {
    if (!/^\d{6}$/.test(token)) return false;
    const secret = base32Decode(base32Secret);
    const counter = Math.floor(Date.now() / 1000 / STEP_SECONDS);
    for (let drift = -window; drift <= window; drift++) {
        if (timingSafeEqualStr(hotp(secret, counter + drift), token)) return true;
    }
    return false;
}

/** URI otpauth:// estándar para que el autenticador dibuje el QR. */
export function totpAuthUri(secret: string, email: string, issuer = 'Cord'): string {
    const label = `${encodeURIComponent(issuer)}:${encodeURIComponent(email)}`;
    return `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=${STEP_SECONDS}`;
}

/** Códigos de respaldo: se muestran en claro UNA sola vez; se persisten como sha256. */
export function generateBackupCodes(count = 10): string[] {
    const codes: string[] = [];
    for (let i = 0; i < count; i++) codes.push(randomBytes(5).toString('hex'));
    return codes;
}

export function hashBackupCode(code: string): string {
    return createHash('sha256').update(code.toLowerCase().trim()).digest('hex');
}

/** Compara un código de respaldo tecleado contra la lista de hashes guardados; devuelve el índice consumido o -1. */
export function matchBackupCode(hashes: string[], code: string): number {
    const target = hashBackupCode(code);
    return hashes.findIndex((h) => timingSafeEqualStr(h, target));
}

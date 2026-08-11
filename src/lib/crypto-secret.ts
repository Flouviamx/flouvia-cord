// AES-256-GCM para secretos que Cord necesita recuperar en runtime.
// ENCRYPTION_KEY es la llave primaria; MCP_SECRET_KEY queda como fallback de
// compatibilidad. Los call sites sensibles usan requireEncryption() y fallan
// cerrados. MCP puede conservar su degradación histórica a texto claro.

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const CURRENT_B64 = import.meta.env?.ENCRYPTION_KEY
    || process.env.ENCRYPTION_KEY
    || import.meta.env?.MCP_SECRET_KEY
    || process.env.MCP_SECRET_KEY;
const PREVIOUS_B64 = import.meta.env?.ENCRYPTION_KEY_PREV || process.env.ENCRYPTION_KEY_PREV;
const CURRENT_ID = String(import.meta.env?.ENCRYPTION_KEY_ID || process.env.ENCRYPTION_KEY_ID || 'k1');
const PREVIOUS_ID = String(import.meta.env?.ENCRYPTION_KEY_PREV_ID || process.env.ENCRYPTION_KEY_PREV_ID || 'k0');

function decodeKey(value: string | undefined): Buffer | null {
    if (!value) return null;
    try {
        const key = Buffer.from(value, 'base64');
        return key.length === 32 ? key : null;
    } catch {
        return null;
    }
}

const CURRENT_KEY = decodeKey(CURRENT_B64);
const PREVIOUS_KEY = decodeKey(PREVIOUS_B64);
const LEGACY_PREFIX = 'enc:v1:';
const IV_LEN = 12;
const TAG_LEN = 16;

export interface EncryptionStatus {
    configured: boolean;
    currentKeyId: string;
    previousConfigured: boolean;
    previousKeyId: string | null;
    source: 'encryption_key' | 'mcp_fallback' | 'missing';
}

export function encryptionStatus(): EncryptionStatus {
    const direct = !!(import.meta.env?.ENCRYPTION_KEY || process.env.ENCRYPTION_KEY);
    return {
        configured: !!CURRENT_KEY,
        currentKeyId: CURRENT_ID,
        previousConfigured: !!PREVIOUS_KEY,
        previousKeyId: PREVIOUS_KEY ? PREVIOUS_ID : null,
        source: direct ? 'encryption_key' : CURRENT_KEY ? 'mcp_fallback' : 'missing',
    };
}

export function requireEncryption(): void {
    if (!CURRENT_KEY) {
        throw new Error('ENCRYPTION_KEY no está configurada o no contiene 32 bytes en base64');
    }
}

/** Para MCP: conserva texto claro si no hay llave, como degradación documentada. */
export function encryptSecret(plain: string): string {
    if (!CURRENT_KEY) return plain;
    return encryptWithKey(plain, CURRENT_KEY, CURRENT_ID);
}

/** Para secretos financieros/identidad: nunca permite persistir texto claro. */
export function encryptRequiredSecret(plain: string): string {
    requireEncryption();
    return encryptWithKey(plain, CURRENT_KEY as Buffer, CURRENT_ID);
}

function encryptWithKey(plain: string, key: Buffer, keyId: string): string {
    const iv = randomBytes(IV_LEN);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `${LEGACY_PREFIX}${keyId}:` + Buffer.concat([iv, tag, encrypted]).toString('base64');
}

function decryptWithKey(payload: string, key: Buffer): string | null {
    try {
        const raw = Buffer.from(payload, 'base64');
        if (raw.length < IV_LEN + TAG_LEN + 1) return null;
        const iv = raw.subarray(0, IV_LEN);
        const tag = raw.subarray(IV_LEN, IV_LEN + TAG_LEN);
        const encrypted = raw.subarray(IV_LEN + TAG_LEN);
        const decipher = createDecipheriv('aes-256-gcm', key, iv);
        decipher.setAuthTag(tag);
        return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
    } catch {
        return null;
    }
}

export function decryptSecret(stored: string | null | undefined): string | null {
    if (!stored) return null;
    if (!stored.startsWith(LEGACY_PREFIX)) return stored;

    const rest = stored.slice(LEGACY_PREFIX.length);
    const separator = rest.indexOf(':');
    // Formato heredado enc:v1:<base64>, sin id de llave.
    if (separator < 0) {
        if (CURRENT_KEY) {
            const value = decryptWithKey(rest, CURRENT_KEY);
            if (value !== null) return value;
        }
        return PREVIOUS_KEY ? decryptWithKey(rest, PREVIOUS_KEY) : null;
    }

    const keyId = rest.slice(0, separator);
    const payload = rest.slice(separator + 1);
    const candidates: Buffer[] = [];
    if (keyId === CURRENT_ID && CURRENT_KEY) candidates.push(CURRENT_KEY);
    if (keyId === PREVIOUS_ID && PREVIOUS_KEY) candidates.push(PREVIOUS_KEY);
    // La lista de ids es operativa, no criptográfica: probar ambas permite
    // recuperar una rotación donde el id no se cambió por error.
    if (CURRENT_KEY && !candidates.includes(CURRENT_KEY)) candidates.push(CURRENT_KEY);
    if (PREVIOUS_KEY && !candidates.includes(PREVIOUS_KEY)) candidates.push(PREVIOUS_KEY);
    for (const key of candidates) {
        const value = decryptWithKey(payload, key);
        if (value !== null) return value;
    }
    return null;
}

export function isEncryptedSecret(value: string | null | undefined): boolean {
    return !!value?.startsWith(LEGACY_PREFIX);
}

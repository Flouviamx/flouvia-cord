// src/lib/crypto-secret.ts
// Cifrado simétrico en reposo (AES-256-GCM) para secretos de terceros que
// Cord guarda para volver a USAR después — hoy: `mcp_servers.auth_token`
// (el token con el que Cord se autentica contra un servidor MCP externo que
// la org conectó, ej. HubSpot/Salesforce). A diferencia de las API keys
// PROPIAS de Cord (que solo se guardan hasheadas — nunca hace falta leerlas
// de vuelta), este token SÍ se necesita en claro cada vez que
// `client-manager.ts` abre una conexión saliente, así que no puede ser un
// hash — pero tampoco debe vivir en texto plano en la base de datos.
//
// `ENCRYPTION_KEY` (32 bytes en base64) es OPCIONAL — sin ella, encryptSecret
// deja el valor en texto plano (mismo criterio de degradación que Upstash en
// ratelimit.ts/session-store.ts: funciona sin la env var, mejora al
// configurarla). decryptSecret reconoce el prefijo `enc:v1:` para distinguir
// un valor cifrado por esta versión de uno en texto plano heredado (tokens
// guardados ANTES de configurar la llave) — así no hace falta una migración
// de datos: los tokens viejos se siguen leyendo tal cual, y cualquier
// `addMcpServer` nuevo cifra desde ese momento en adelante.

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const KEY_B64 = import.meta.env.MCP_SECRET_KEY || process.env.MCP_SECRET_KEY;
const KEY: Buffer | null = (() => {
    if (!KEY_B64) return null;
    try {
        const buf = Buffer.from(KEY_B64, 'base64');
        return buf.length === 32 ? buf : null; // AES-256 exige exactamente 32 bytes
    } catch { return null; }
})();

const PREFIX = 'enc:v1:';
const IV_LEN = 12; // GCM estándar
const TAG_LEN = 16;

/** Cifra un secreto para guardarlo en BD. Sin ENCRYPTION_KEY configurada, lo deja en claro (documentado). */
export function encryptSecret(plain: string): string {
    if (!KEY) return plain;
    const iv = randomBytes(IV_LEN);
    const cipher = createCipheriv('aes-256-gcm', KEY, iv);
    const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return PREFIX + Buffer.concat([iv, tag, enc]).toString('base64');
}

/**
 * Descifra un valor leído de BD. Devuelve el texto plano heredado tal cual
 * si nunca se cifró (sin el prefijo). Devuelve null si el valor SÍ está
 * cifrado pero no hay llave (o es la equivocada) para leerlo — mejor no
 * usar un token corrupto/ilegible que fallar de forma confusa más adelante.
 */
export function decryptSecret(stored: string | null | undefined): string | null {
    if (!stored) return null;
    if (!stored.startsWith(PREFIX)) return stored; // texto plano (heredado o sin ENCRYPTION_KEY)
    if (!KEY) return null;
    try {
        const raw = Buffer.from(stored.slice(PREFIX.length), 'base64');
        const iv = raw.subarray(0, IV_LEN);
        const tag = raw.subarray(IV_LEN, IV_LEN + TAG_LEN);
        const enc = raw.subarray(IV_LEN + TAG_LEN);
        const decipher = createDecipheriv('aes-256-gcm', KEY, iv);
        decipher.setAuthTag(tag);
        return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
    } catch {
        return null; // llave equivocada o dato corrupto — nunca lanzar, el caller decide qué hacer con null
    }
}

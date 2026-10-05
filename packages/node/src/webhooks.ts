// Verificación de webhooks de Cord con WebCrypto: misma función en Node, Bun,
// Deno, Cloudflare Workers y Vercel. Por defecto exige X-Cord-Signature-V1
// (con timestamp): sin él cualquier entrega capturada se podría reenviar para
// siempre. La firma legacy sin timestamp solo se acepta si lo pides.
import type { CordWebhookEvent } from '../../elements/src/contract/webhook-events.js';

export type WebhookErrorCode =
    | 'missing_signature'
    | 'invalid_signature_header'
    | 'timestamp_out_of_tolerance'
    | 'signature_mismatch'
    | 'legacy_signature_rejected'
    | 'invalid_payload';

export class CordWebhookSignatureError extends Error {
    readonly code: WebhookErrorCode;
    constructor(code: WebhookErrorCode, message: string) {
        super(message);
        this.name = 'CordWebhookSignatureError';
        this.code = code;
    }
}

export interface ConstructEventOptions {
    /** Segundos de tolerancia del timestamp. Default 300. */
    tolerance?: number;
    /** Acepta la firma legacy `X-Cord-Signature` (sin anti-replay). Default false. */
    allowLegacySignature?: boolean;
    /** Reloj inyectable para pruebas (segundos unix). */
    now?: () => number;
}

type HeaderSource = Headers | Record<string, string | string[] | undefined>;

function header(headers: HeaderSource, name: string): string | null {
    if (typeof Headers !== 'undefined' && headers instanceof Headers) return headers.get(name);
    const rec = headers as Record<string, string | string[] | undefined>;
    const key = Object.keys(rec).find((k) => k.toLowerCase() === name);
    const v = key ? rec[key] : undefined;
    return Array.isArray(v) ? v[0] ?? null : v ?? null;
}

function toText(payload: string | Uint8Array | ArrayBuffer): string {
    if (typeof payload === 'string') return payload;
    return new TextDecoder().decode(payload instanceof ArrayBuffer ? new Uint8Array(payload) : payload);
}

async function hmacHex(secret: string, message: string): Promise<string> {
    const enc = new TextEncoder();
    const key = await globalThis.crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const sig = await globalThis.crypto.subtle.sign('HMAC', key, enc.encode(message));
    return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, '0')).join('');
}

function timingSafeEqual(a: string, b: string): boolean {
    if (a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return diff === 0;
}

function parseV1(value: string): { t: number; signatures: string[] } | null {
    let t: number | null = null;
    const signatures: string[] = [];
    for (const part of value.split(',')) {
        const eq = part.indexOf('=');
        if (eq < 0) continue;
        const k = part.slice(0, eq).trim();
        const v = part.slice(eq + 1).trim();
        if (k === 't' && /^\d{1,12}$/.test(v)) t = Number(v);
        else if (k === 'v1' && /^[0-9a-f]{64}$/i.test(v)) signatures.push(v.toLowerCase());
    }
    return t !== null && signatures.length ? { t, signatures } : null;
}

/**
 * Verifica y decodifica una entrega. `payload` debe ser el cuerpo CRUDO
 * (`await req.text()`), nunca un objeto ya parseado y re-serializado.
 */
export async function constructEvent(
    payload: string | Uint8Array | ArrayBuffer,
    headers: HeaderSource,
    secret: string,
    opts: ConstructEventOptions = {},
): Promise<CordWebhookEvent> {
    if (!secret) throw new CordWebhookSignatureError('missing_signature', 'Falta el secreto del endpoint.');
    const body = toText(payload);
    const tolerance = opts.tolerance ?? 300;
    const now = opts.now ? opts.now() : Math.floor(Date.now() / 1000);
    const v1 = header(headers, 'x-cord-signature-v1');

    if (v1) {
        const parsed = parseV1(v1);
        if (!parsed) throw new CordWebhookSignatureError('invalid_signature_header', 'X-Cord-Signature-V1 no tiene el formato t=<unix>,v1=<hex>.');
        if (Math.abs(now - parsed.t) > tolerance) {
            throw new CordWebhookSignatureError('timestamp_out_of_tolerance', 'La firma está fuera de la ventana de tolerancia: posible reenvío.');
        }
        const expected = await hmacHex(secret, `${parsed.t}.${body}`);
        // Durante una rotación de secreto llegan dos v1: basta con que uno cuadre.
        if (!parsed.signatures.some((s) => timingSafeEqual(expected, s))) {
            throw new CordWebhookSignatureError('signature_mismatch', 'La firma no corresponde a este secreto.');
        }
        return parse(body);
    }

    const legacy = header(headers, 'x-cord-signature');
    if (!legacy) throw new CordWebhookSignatureError('missing_signature', 'La entrega no trae firma de Cord.');
    if (!opts.allowLegacySignature) {
        throw new CordWebhookSignatureError('legacy_signature_rejected', 'Solo llegó la firma legacy (sin timestamp). Actívala con allowLegacySignature si de verdad la necesitas.');
    }
    const sig = legacy.replace(/^sha256=/, '').trim().toLowerCase();
    if (!/^[0-9a-f]{64}$/.test(sig)) throw new CordWebhookSignatureError('invalid_signature_header', 'X-Cord-Signature no tiene el formato sha256=<hex>.');
    if (!timingSafeEqual(await hmacHex(secret, body), sig)) {
        throw new CordWebhookSignatureError('signature_mismatch', 'La firma no corresponde a este secreto.');
    }
    return parse(body);
}

function parse(body: string): CordWebhookEvent {
    let event: any;
    try { event = JSON.parse(body); } catch { throw new CordWebhookSignatureError('invalid_payload', 'El cuerpo no es JSON válido.'); }
    if (!event || typeof event.id !== 'string' || typeof event.event !== 'string' || typeof event.data !== 'object') {
        throw new CordWebhookSignatureError('invalid_payload', 'El cuerpo no tiene la forma { id, event, created_at, data }.');
    }
    return event as CordWebhookEvent;
}

/** Firma un cuerpo como lo hace Cord. Útil para tus pruebas de integración. */
export async function signPayload(payload: string, secret: string, timestamp = Math.floor(Date.now() / 1000)): Promise<string> {
    return `t=${timestamp},v1=${await hmacHex(secret, `${timestamp}.${payload}`)}`;
}

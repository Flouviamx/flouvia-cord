import { CordAPI as BaseCordAPI, CordError } from './api.js';
import { createHmac, timingSafeEqual } from 'node:crypto';

// ⚠️ Debe mantenerse en sync con `WEBHOOK_EVENTS` de src/lib/webhooks.ts (el
// código de la APP, que no se publica a npm — no hay forma de derivarlo
// automáticamente a través del límite del paquete). 'ping' es el evento de
// prueba que dispara sendTestEvent()/"Enviar prueba" en Ajustes › Developers.
export type CordWebhookEventType =
    | 'quote.sent'
    | 'quote.viewed'
    | 'quote.approved'
    | 'quote.rejected'
    | 'quote.paid'
    | 'invoice.stamped'
    | 'ping';

/** Forma real de `data` en cada entrega (ver dispatchQuoteEvent en src/lib/webhooks.ts). */
export interface CordWebhookQuoteData {
    id: string;
    folio: string;
    status: string;
    total: number;
    cliente: string | null;
    link_publico: string;
    /** Solo presente en el evento `ping` de prueba. */
    mensaje?: string;
}

/** Payload real que Cord entrega — `{ event, created_at, data }`, NUNCA `{ type, created }`. */
export interface CordWebhookEvent {
    event: CordWebhookEventType;
    created_at: string;
    data: CordWebhookQuoteData;
}

export interface ConstructEventOptions {
    /** Segundos de tolerancia para la firma V1 (con timestamp). Default 300. */
    tolerance?: number;
    /**
     * Si es `true`, rechaza la entrega cuando el endpoint NO mandó la firma
     * V1 (`X-Cord-Signature-V1`) — es decir, exige protección anti-replay.
     * Default `false` (todavía compatible con integraciones firmadas antes
     * de que existiera V1). Se planea `true` por default en la v2.
     */
    requireTimestamp?: boolean;
}

function hexEqual(expectedHex: string, actualHex: string): boolean {
    const expected = Buffer.from(expectedHex, 'hex');
    const actual = Buffer.from(actualHex, 'hex');
    return expected.length === actual.length && timingSafeEqual(expected, actual);
}

// Header real: `X-Cord-Signature-V1: t=<unix>,v1=<hmac hex de "<t>.<body>">`.
function parseV1Header(header: string): { t: string; v1: string } | null {
    const parts: Record<string, string> = {};
    for (const kv of header.split(',')) {
        const eq = kv.indexOf('=');
        if (eq === -1) continue;
        parts[kv.slice(0, eq).trim()] = kv.slice(eq + 1).trim();
    }
    if (!parts.t || !parts.v1) return null;
    return { t: parts.t, v1: parts.v1 };
}

// Acepta el header legacy (string, retrocompatible una versión) o un mapa de
// headers (Headers real de fetch/Next.js, o un Record plano) — búsqueda
// case-insensitive, como headers HTTP reales.
function extractSignatureHeaders(input: string | Headers | Record<string, string>): {
    legacy: string | null;
    v1: string | null;
} {
    if (typeof input === 'string') return { legacy: input, v1: null };
    if (typeof Headers !== 'undefined' && input instanceof Headers) {
        return { legacy: input.get('x-cord-signature'), v1: input.get('x-cord-signature-v1') };
    }
    const rec = input as Record<string, string>;
    const key = (name: string) => Object.keys(rec).find((k) => k.toLowerCase() === name);
    const legacyKey = key('x-cord-signature');
    const v1Key = key('x-cord-signature-v1');
    return { legacy: legacyKey ? rec[legacyKey] : null, v1: v1Key ? rec[v1Key] : null };
}

let warnedLegacyOnce = false;

export class CordWebhooks {
    /**
     * Valida y decodifica un webhook proveniente de Cord (Node: HMAC SHA-256 vía `node:crypto`).
     * Para runtimes edge/browser sin `node:crypto`, usa `constructEventAsync` (WebCrypto).
     *
     * Verifica PRIMERO `X-Cord-Signature-V1` (con timestamp — protección anti-replay real,
     * respeta `tolerance`). Si el endpoint solo mandó la legacy `X-Cord-Signature` (sin
     * timestamp), cae a esa — nunca lanza solo por faltar V1, a menos que pases
     * `requireTimestamp: true`.
     *
     * @param payload El raw body en formato string/Buffer (ej. `await req.text()`).
     * @param headers `Headers` real, un `Record<string,string>`, o (legacy, retrocompatible
     *   una versión) el valor crudo del header `X-Cord-Signature` como string.
     * @param endpointSecret El secreto del webhook configurado en Ajustes › Developers.
     * @param opts `{ tolerance?, requireTimestamp? }` — o un `number` (legacy: tolerance en segundos).
     */
    public constructEvent(
        payload: string | Buffer,
        headers: string | Headers | Record<string, string>,
        endpointSecret: string,
        opts?: number | ConstructEventOptions,
    ): CordWebhookEvent {
        const payloadString = Buffer.isBuffer(payload) ? payload.toString('utf8') : payload;
        const tolerance = typeof opts === 'number' ? opts : (opts?.tolerance ?? 300);
        const requireTimestamp = typeof opts === 'object' ? !!opts.requireTimestamp : false;

        const { legacy, v1 } = extractSignatureHeaders(headers);

        if (v1) {
            const parsed = parseV1Header(v1);
            if (!parsed) throw new Error('Invalid X-Cord-Signature-V1 header format');
            const age = Math.abs(Math.floor(Date.now() / 1000) - parseInt(parsed.t, 10));
            if (age > tolerance) throw new Error('Webhook signature has expired (fuera de tolerancia)');
            const expected = createHmac('sha256', endpointSecret).update(`${parsed.t}.${payloadString}`).digest('hex');
            if (!hexEqual(expected, parsed.v1)) throw new Error('Webhook signature mismatch');
            return JSON.parse(payloadString);
        }

        if (requireTimestamp) {
            throw new Error('Esta entrega no trae X-Cord-Signature-V1 y requireTimestamp está activo — sin protección anti-replay.');
        }
        if (!legacy) throw new Error('No signature header provided');

        if (!warnedLegacyOnce) {
            warnedLegacyOnce = true;
            console.warn(
                '[Cord] Verificando con la firma legacy (X-Cord-Signature, sin timestamp — sin protección anti-replay). ' +
                'Es temporal: en unos meses este SDK exigirá X-Cord-Signature-V1 por default. No requiere ningún cambio de tu parte, ' +
                'Cord ya manda ambos headers en cada entrega.'
            );
        }

        let signature = legacy;
        if (legacy.startsWith('sha256=')) signature = legacy.replace('sha256=', '').trim();
        if (!signature) throw new Error('Invalid signature header format');
        const expectedSignature = createHmac('sha256', endpointSecret).update(payloadString).digest('hex');
        if (!hexEqual(expectedSignature, signature)) throw new Error('Webhook signature mismatch');
        return JSON.parse(payloadString);
    }

    /**
     * Igual que `constructEvent` pero verifica con WebCrypto (`crypto.subtle`) en vez
     * de `node:crypto` — pensado para runtimes edge/workers.
     *
     * ⚠️ Limitación conocida: este módulo (`@flouviahq/elements/server`) sigue
     * declarando `import ... from 'node:crypto'` a nivel de archivo (lo usa
     * `constructEvent`, el método síncrono). En un runtime que NO exponga
     * `node:crypto` en absoluto (ej. Vercel Edge Runtime sin compat layer),
     * el IMPORT del módulo puede fallar antes de que `constructEventAsync`
     * llegue a ejecutarse. Funciona tal cual en Node y en Cloudflare Workers
     * con el flag `nodejs_compat`. Separar esto en un entrypoint 100%
     * edge-safe (sin ningún import de `node:crypto`) queda como mejora futura.
     */
    public async constructEventAsync(
        payload: string | Buffer,
        headers: string | Headers | Record<string, string>,
        endpointSecret: string,
        opts?: number | ConstructEventOptions,
    ): Promise<CordWebhookEvent> {
        // `typeof Buffer` (no `Buffer.isBuffer` directo): en Edge/Cloudflare
        // Workers/navegador el global `Buffer` no existe — este es el método
        // pensado justo para esos runtimes, así que no puede asumirlo.
        const payloadString = (typeof Buffer !== 'undefined' && Buffer.isBuffer(payload))
            ? payload.toString('utf8')
            : (payload as string);
        const tolerance = typeof opts === 'number' ? opts : (opts?.tolerance ?? 300);
        const requireTimestamp = typeof opts === 'object' ? !!opts.requireTimestamp : false;

        const { legacy, v1 } = extractSignatureHeaders(headers);

        if (v1) {
            const parsed = parseV1Header(v1);
            if (!parsed) throw new Error('Invalid X-Cord-Signature-V1 header format');
            const age = Math.abs(Math.floor(Date.now() / 1000) - parseInt(parsed.t, 10));
            if (age > tolerance) throw new Error('Webhook signature has expired (fuera de tolerancia)');
            const expected = await webCryptoHmacHex(endpointSecret, `${parsed.t}.${payloadString}`);
            if (!timingSafeHexEqual(expected, parsed.v1.toLowerCase())) throw new Error('Webhook signature mismatch');
            return JSON.parse(payloadString);
        }

        if (requireTimestamp) {
            throw new Error('Esta entrega no trae X-Cord-Signature-V1 y requireTimestamp está activo — sin protección anti-replay.');
        }
        if (!legacy) throw new Error('No signature header provided');

        let signature = legacy;
        if (legacy.startsWith('sha256=')) signature = legacy.replace('sha256=', '').trim();
        if (!signature) throw new Error('Invalid signature header format');
        const expectedSignature = await webCryptoHmacHex(endpointSecret, payloadString);
        if (!timingSafeHexEqual(expectedSignature, signature.toLowerCase())) throw new Error('Webhook signature mismatch');
        return JSON.parse(payloadString);
    }
}

async function webCryptoHmacHex(secret: string, message: string): Promise<string> {
    const enc = new TextEncoder();
    const key = await globalThis.crypto.subtle.importKey(
        'raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
    );
    const sig = await globalThis.crypto.subtle.sign('HMAC', key, enc.encode(message));
    return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

// `node:crypto`'s timingSafeEqual no existe en runtimes edge/browser — este
// comparador de tiempo constante evita que un `!==` de string filtre por
// timing en qué posición difieren dos firmas hex.
function timingSafeHexEqual(a: string, b: string): boolean {
    if (a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return diff === 0;
}

export class CordAPI extends BaseCordAPI {
    public readonly webhooks: CordWebhooks;

    constructor(apiKey?: string, baseUrl?: string) {
        super(apiKey, baseUrl);
        this.webhooks = new CordWebhooks();
    }
}

export { CordError };
export type {
    CreateQuoteInput,
    CreateQuoteResponse,
    CreateClientInput,
    CreateProductInput,
    CreateResponse,
    PaginatedResponse,
    CordProduct,
    CordEventDetail,
    CordElementOptions
} from './types.js';

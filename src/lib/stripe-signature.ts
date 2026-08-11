import { createHmac, timingSafeEqual } from 'node:crypto';

export const STRIPE_SIGNATURE_TOLERANCE_SECONDS = 300;

export interface ParsedStripeSignature {
    timestamp: number;
    signatures: string[];
}

/**
 * Parsea Stripe-Signature sin perder firmas v1 durante una rotación de secreto.
 * Se corta cada fragmento en el primer "=" para no corromper valores que también
 * contengan ese carácter.
 */
export function parseStripeSignature(header: string): ParsedStripeSignature | null {
    let timestamp: number | null = null;
    const signatures: string[] = [];

    for (const rawPart of header.split(',')) {
        const part = rawPart.trim();
        const separator = part.indexOf('=');
        if (separator <= 0) continue;
        const key = part.slice(0, separator);
        const value = part.slice(separator + 1);
        if (key === 't' && timestamp === null && /^\d+$/.test(value)) {
            timestamp = Number(value);
        } else if (key === 'v1' && value) {
            signatures.push(value);
        }
    }

    if (!Number.isSafeInteger(timestamp) || !signatures.length) return null;
    return { timestamp: timestamp as number, signatures };
}

export function verifyStripeSignature(
    rawBody: string,
    signatureHeader: string,
    secret: string,
    options: { nowSeconds?: number; toleranceSeconds?: number } = {},
): boolean {
    if (!secret) return false;
    const parsed = parseStripeSignature(signatureHeader);
    if (!parsed) return false;

    const nowSeconds = options.nowSeconds ?? Math.floor(Date.now() / 1000);
    const tolerance = options.toleranceSeconds ?? STRIPE_SIGNATURE_TOLERANCE_SECONDS;
    if (Math.abs(nowSeconds - parsed.timestamp) > tolerance) return false;

    const expected = createHmac('sha256', secret)
        .update(`${parsed.timestamp}.${rawBody}`)
        .digest('hex');
    const expectedBytes = Buffer.from(expected, 'hex');

    return parsed.signatures.some((candidate) => {
        if (!/^[0-9a-fA-F]+$/.test(candidate) || candidate.length % 2 !== 0) return false;
        const candidateBytes = Buffer.from(candidate, 'hex');
        return candidateBytes.length === expectedBytes.length
            && timingSafeEqual(candidateBytes, expectedBytes);
    });
}

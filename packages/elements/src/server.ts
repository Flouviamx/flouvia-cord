import { CordAPI as BaseCordAPI, CordError } from './api';
import * as crypto from 'crypto';
import type { CordEventDetail } from './types';

export class CordWebhooks {
    /**
     * Valida y decodifica un webhook proveniente de Cord usando HMAC SHA-256.
     * @param payload El raw body en formato string (ej. await req.text() en Next.js)
     * @param signatureHeader El header 'Cord-Signature' enviado por Cord
     * @param endpointSecret El secreto del webhook configurado en el Dashboard
     * @param tolerance Tolerancia en segundos para prevenir ataques de repetición (default: 300)
     */
    public constructEvent(
        payload: string | Buffer,
        signatureHeader: string,
        endpointSecret: string,
        tolerance: number = 300
    ): { type: string; data: CordEventDetail; created: number } {
        if (!signatureHeader) {
            throw new Error('No signature header provided');
        }

        const parts = signatureHeader.split(',').reduce((acc, part) => {
            const [k, v] = part.split('=');
            if (k && v) acc[k.trim()] = v.trim();
            return acc;
        }, {} as Record<string, string>);

        const timestamp = parts['t'];
        const signature = parts['v1'];

        if (!timestamp || !signature) {
            throw new Error('Invalid signature header format');
        }

        const age = Math.floor(Date.now() / 1000) - parseInt(timestamp, 10);
        if (age > tolerance) {
            throw new Error('Webhook signature has expired');
        }

        const payloadString = Buffer.isBuffer(payload) ? payload.toString('utf8') : payload;
        const signedPayload = `${timestamp}.${payloadString}`;
        const expectedSignature = crypto
            .createHmac('sha256', endpointSecret)
            .update(signedPayload)
            .digest('hex');

        if (expectedSignature !== signature) {
            throw new Error('Webhook signature mismatch');
        }

        return JSON.parse(payloadString);
    }
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
} from './types';

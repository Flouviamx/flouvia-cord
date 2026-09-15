import { createHmac, timingSafeEqual } from 'node:crypto';

export const HUBSPOT_SIGNATURE_TOLERANCE_MS = 5 * 60 * 1000;
export const MAX_EVENTS_PER_REQUEST = 200;

const DECODE: Record<string, string> = {
    '%3A': ':', '%2F': '/', '%3F': '?', '%40': '@', '%21': '!', '%24': '$',
    '%27': "'", '%28': '(', '%29': ')', '%2A': '*', '%2C': ',', '%3B': ';',
};

export function decodeHubSpotUri(uri: string): string {
    const q = uri.indexOf('?');
    const decode = (s: string) => s.replace(/%(3A|2F|3F|40|21|24|27|28|29|2A|2C|3B)/gi, (m) => DECODE[m.toUpperCase()]);
    return q < 0 ? decode(uri) : `${decode(uri.slice(0, q))}?${decode(uri.slice(q + 1))}`;
}

export function verifyHubSpotSignature(input: {
    secret: string;
    method: string;
    uris: string[];
    body: string;
    signature: string | null;
    timestamp: string | null;
    now?: number;
}): boolean {
    const { secret, method, uris, body, signature, timestamp } = input;
    if (!secret || !signature || !timestamp || !/^\d{10,16}$/.test(timestamp)) return false;
    const now = input.now ?? Date.now();
    if (Math.abs(now - Number(timestamp)) > HUBSPOT_SIGNATURE_TOLERANCE_MS) return false;
    const given = Buffer.from(signature);
    return uris.some((uri) => {
        const expected = Buffer.from(createHmac('sha256', secret).update(`${method.toUpperCase()}${decodeHubSpotUri(uri)}${body}${timestamp}`, 'utf8').digest('base64'));
        return expected.length === given.length && timingSafeEqual(expected, given);
    });
}

export interface HubSpotChange {
    portalId: string;
    objeto: 'company' | 'contact';
    objectId: string;
}

const TYPE_BY_ID: Record<string, 'company' | 'contact'> = { '0-1': 'contact', '0-2': 'company' };
const ACTIONS = new Set(['propertyChange', 'deletion', 'restore', 'creation']);

export function parseHubSpotEvents(payload: unknown): HubSpotChange[] {
    if (!Array.isArray(payload)) return [];
    const seen = new Set<string>();
    const out: HubSpotChange[] = [];
    for (const e of payload.slice(0, MAX_EVENTS_PER_REQUEST)) {
        if (!e || typeof e !== 'object') continue;
        const ev = e as Record<string, unknown>;
        const [prefix, action] = String(ev.subscriptionType ?? '').split('.');
        if (!ACTIONS.has(action)) continue;
        const objeto = prefix === 'company' ? 'company' : prefix === 'contact' ? 'contact' : prefix === 'object' ? TYPE_BY_ID[String(ev.objectTypeId ?? '')] : undefined;
        const portalId = String(ev.portalId ?? '');
        const objectId = String(ev.objectId ?? '');
        if (!objeto || !/^[0-9]{1,20}$/.test(portalId) || !/^[0-9]{1,20}$/.test(objectId)) continue;
        const key = `${portalId}:${objeto}:${objectId}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ portalId, objeto, objectId });
    }
    return out;
}

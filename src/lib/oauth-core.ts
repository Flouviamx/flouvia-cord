import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

export const OAUTH_ACCESS_TTL_S = 3600;
export const OAUTH_REFRESH_TTL_DAYS = 180;
export const OAUTH_CODE_TTL_S = 300;

export type OAuthScope = 'read' | 'write';

export const sha256Hex = (s: string) => createHash('sha256').update(s).digest('hex');

export const newAccessToken = () => `cord_at_${randomBytes(24).toString('hex')}`;
export const newRefreshToken = () => `cord_rt_${randomBytes(32).toString('hex')}`;
export const newAuthCode = () => `cord_ac_${randomBytes(32).toString('hex')}`;

export function tokenDisplay(token: string) {
    return { prefix: token.slice(0, 16), last4: token.slice(-4) };
}

/** Sin scope pide el mínimo. `write` incluye `read`; un scope desconocido no se ignora en silencio. */
export function parseScope(raw: string | null | undefined): OAuthScope | null {
    const parts = String(raw ?? '').split(/[\s,+]+/).filter(Boolean);
    if (parts.length === 0) return 'read';
    if (parts.some((p) => p !== 'read' && p !== 'write')) return null;
    return parts.includes('write') ? 'write' : 'read';
}

/** Coincidencia exacta con lo registrado: sin comodines ni prefijos. */
export function redirectAllowed(registered: readonly string[], uri: string | null | undefined): boolean {
    if (!uri || uri.length > 2048) return false;
    return registered.includes(uri);
}

/**
 * A dónde regresa el navegador. El código queda atado a `requested`, pero si la
 * app atiende el regreso en varios dominios (Make, uno por zona) se usa el
 * dominio del que vino la persona, siempre que esa dirección esté registrada.
 */
export function pickReturnTo(registered: readonly string[], requested: string, hinted: string | null | undefined, referer: string | null | undefined): string {
    if (hinted && registered.includes(hinted)) return hinted;
    if (referer) {
        try {
            const candidate = new URL(referer).origin + new URL(requested).pathname;
            if (registered.includes(candidate)) return candidate;
        } catch {
            return requested;
        }
    }
    return requested;
}

/** Un redirect registrado debe ser https, o http solo hacia la propia máquina. */
export function isValidRedirectUri(uri: string): boolean {
    try {
        const u = new URL(uri);
        if (u.hash) return false;
        if (u.protocol === 'https:') return true;
        return u.protocol === 'http:' && (u.hostname === 'localhost' || u.hostname === '127.0.0.1');
    } catch {
        return false;
    }
}

const VERIFIER_RE = /^[A-Za-z0-9\-._~]{43,128}$/;
const CHALLENGE_RE = /^[A-Za-z0-9\-_]{43}$/;

export function isValidCodeChallenge(challenge: string | null | undefined): boolean {
    return !!challenge && CHALLENGE_RE.test(challenge);
}

function safeEqual(a: string, b: string): boolean {
    const x = Buffer.from(a);
    const y = Buffer.from(b);
    return x.length === y.length && timingSafeEqual(x, y);
}

/** PKCE S256 (RFC 7636). `plain` no se acepta: no protege nada. */
export function verifyPkce(verifier: string | null | undefined, challenge: string): boolean {
    if (!verifier || !VERIFIER_RE.test(verifier)) return false;
    const expected = createHash('sha256').update(verifier).digest('base64url');
    return safeEqual(expected, challenge);
}

export function clientSecretMatches(secret: string | null | undefined, secretHash: string): boolean {
    if (!secret) return false;
    return safeEqual(sha256Hex(secret), secretHash);
}

export interface ClientCredentials {
    clientId: string | null;
    clientSecret: string | null;
}

/** Credenciales del cliente: header Basic (RFC 6749 2.3.1) o campos del cuerpo. */
export function readClientCredentials(authorization: string | null, body: URLSearchParams): ClientCredentials {
    const basic = /^Basic\s+(.+)$/i.exec((authorization ?? '').trim());
    if (basic) {
        const decoded = Buffer.from(basic[1], 'base64').toString('utf8');
        const i = decoded.indexOf(':');
        if (i > 0) {
            try {
                return { clientId: decodeURIComponent(decoded.slice(0, i)), clientSecret: decodeURIComponent(decoded.slice(i + 1)) };
            } catch {
                return { clientId: null, clientSecret: null };
            }
        }
    }
    return { clientId: body.get('client_id'), clientSecret: body.get('client_secret') };
}

export function buildRedirect(redirectUri: string, params: Record<string, string | null | undefined>): string {
    const u = new URL(redirectUri);
    for (const [k, v] of Object.entries(params)) if (v) u.searchParams.set(k, v);
    return u.toString();
}

// OAuth de Shopify (authorization code) y verificación de sus firmas.
//
// Shopify firma DOS cosas con el mismo secreto de la app y de formas distintas:
// el regreso de la instalación (HMAC hex sobre los parámetros ordenados, sin el
// propio `hmac`) y cada webhook (HMAC base64 sobre el cuerpo crudo). Las dos se
// comparan en tiempo constante: una comparación con `===` filtra la firma byte
// a byte, y con ella cualquiera podría fingir una instalación o un evento.

import { createHmac, timingSafeEqual } from 'node:crypto';
import { log } from '../../log';
import { isShopDomain, shopifyCredentials, SHOPIFY_SCOPES } from './config';

const TIMEOUT_MS = 10_000;
/** Un regreso de OAuth viejo no se acepta: es la ventana de replay que Shopify documenta. */
const OAUTH_MAX_AGE_S = 300;

const safeEqual = (a: string, b: string): boolean => {
    const x = Buffer.from(a);
    const y = Buffer.from(b);
    return x.length === y.length && timingSafeEqual(x, y);
};

export function shopifyInstallUrl(shop: string, redirectUri: string, state: string): string | null {
    const creds = shopifyCredentials();
    if (!creds || !isShopDomain(shop)) return null;
    const url = new URL(`https://${shop}/admin/oauth/authorize`);
    url.searchParams.set('client_id', creds.clientId);
    url.searchParams.set('scope', SHOPIFY_SCOPES.join(','));
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('state', state);
    return url.toString();
}

/**
 * Firma del regreso de OAuth: HMAC-SHA256 hex sobre los parámetros ORDENADOS,
 * excluyendo `hmac` y `signature`, unidos con `&` como `clave=valor`.
 */
export function verifyOAuthHmac(params: URLSearchParams, secret: string): boolean {
    const recibido = params.get('hmac') || '';
    if (!recibido || !secret) return false;
    const partes: string[] = [];
    for (const [k, v] of [...params.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
        if (k === 'hmac' || k === 'signature') continue;
        partes.push(`${k}=${v}`);
    }
    return safeEqual(createHmac('sha256', secret).update(partes.join('&')).digest('hex'), recibido);
}

/** El `timestamp` del regreso acota el replay de una instalación ya usada. */
export function oauthTimestampFresh(params: URLSearchParams, now = Date.now()): boolean {
    const ts = Number(params.get('timestamp'));
    if (!Number.isFinite(ts) || ts <= 0) return false;
    return Math.abs(Math.floor(now / 1000) - ts) <= OAUTH_MAX_AGE_S;
}

/** Firma de un webhook: HMAC-SHA256 en base64 sobre el cuerpo CRUDO, sin re-serializar. */
export function verifyWebhookHmac(rawBody: string, header: string | null, secret: string): boolean {
    if (!header || !secret) return false;
    return safeEqual(createHmac('sha256', secret).update(rawBody, 'utf8').digest('base64'), header);
}

export interface ShopifyToken {
    accessToken: string;
    scopes: string[];
}

export function parseTokenResponse(data: any): ShopifyToken | null {
    if (!data || typeof data.access_token !== 'string' || !data.access_token) return null;
    const scope = typeof data.scope === 'string' ? data.scope : '';
    return { accessToken: data.access_token, scopes: scope ? scope.split(',').filter(Boolean) : [] };
}

/** El token de Shopify es "offline": no vence ni se renueva, así que no hay refresh. */
export async function exchangeShopifyCode(shop: string, code: string): Promise<ShopifyToken | null> {
    const creds = shopifyCredentials();
    if (!creds || !isShopDomain(shop)) return null;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
        const res = await fetch(`https://${shop}/admin/oauth/access_token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify({ client_id: creds.clientId, client_secret: creds.clientSecret, code }),
            signal: ctrl.signal,
            redirect: 'error',
        });
        const token = res.ok ? parseTokenResponse(await res.json().catch(() => null)) : null;
        if (!token) log.error('Shopify no entregó el token', { route: 'shopify-oauth', status: res.status });
        return token;
    } catch {
        log.error('Shopify no respondió al canjear el código', { route: 'shopify-oauth' });
        return null;
    } finally {
        clearTimeout(timer);
    }
}

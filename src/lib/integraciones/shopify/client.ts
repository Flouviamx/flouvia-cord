// Cliente de la Admin API de Shopify (GraphQL).
//
// El destino no es libre: se construye con un dominio `*.myshopify.com` ya
// validado, así que no pasa por el guard de SSRF —no hay forma de apuntarlo a
// otro host—. Lo que sí hace falta es no morir en el primer tropiezo: Shopify
// responde 429 y, con más frecuencia, un 200 con `THROTTLED` dentro del cuerpo.

import { log } from '../../log';
import { isShopDomain, SHOPIFY_API_VERSION } from './config';

const TIMEOUT_MS = 20_000;
const MAX_REINTENTOS = 3;

export type GraphQLResult<T> = { ok: true; data: T } | { ok: false; reason: 'auth' | 'red' | 'shopify' };

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function shopifyGraphQL<T>(
    shop: string, token: string, query: string, variables: Record<string, unknown> = {},
): Promise<GraphQLResult<T>> {
    if (!isShopDomain(shop) || !token) return { ok: false, reason: 'auth' };
    const url = `https://${shop}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`;

    for (let intento = 0; intento < MAX_REINTENTOS; intento++) {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
        try {
            const res = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Accept: 'application/json',
                    'X-Shopify-Access-Token': token,
                },
                body: JSON.stringify({ query, variables }),
                signal: ctrl.signal,
                redirect: 'error',
            });
            // 401/403: la tienda desinstaló la app o cambió los permisos. No se
            // reintenta: insistir con una credencial muerta no la revive.
            if (res.status === 401 || res.status === 403) return { ok: false, reason: 'auth' };
            if (res.status === 429 || res.status >= 500) {
                await dormir(500 * (intento + 1));
                continue;
            }
            if (!res.ok) {
                log.error('Shopify rechazó la consulta', { route: 'shopify-client', status: res.status });
                return { ok: false, reason: 'shopify' };
            }
            const body: any = await res.json();
            const throttled = Array.isArray(body?.errors)
                && body.errors.some((e: any) => String(e?.extensions?.code || '') === 'THROTTLED');
            if (throttled) {
                await dormir(1000 * (intento + 1));
                continue;
            }
            if (Array.isArray(body?.errors) && body.errors.length) {
                log.error('Shopify devolvió errores de GraphQL', {
                    route: 'shopify-client', codigos: body.errors.map((e: any) => e?.extensions?.code ?? 'sin_codigo'),
                });
                return { ok: false, reason: 'shopify' };
            }
            return { ok: true, data: body?.data as T };
        } catch {
            if (intento === MAX_REINTENTOS - 1) {
                log.error('Shopify no respondió', { route: 'shopify-client' });
                return { ok: false, reason: 'red' };
            }
            await dormir(500 * (intento + 1));
        } finally {
            clearTimeout(timer);
        }
    }
    return { ok: false, reason: 'shopify' };
}

/** `gid://shopify/Product/123` → `123`. Los vínculos guardan el número, no el gid. */
export function idFromGid(gid: unknown): string | null {
    const m = /^gid:\/\/shopify\/[A-Za-z]+\/(\d{1,20})$/.exec(String(gid ?? ''));
    return m ? m[1] : null;
}

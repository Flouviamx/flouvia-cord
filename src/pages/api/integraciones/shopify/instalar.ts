// /api/integraciones/shopify/instalar — la App URL que Shopify abre.
//
// Shopify entra por aquí cuando alguien abre la app desde el panel de la
// tienda. Cord no es una app embebida: aquí no hay sesión de Cord ni forma de
// saber a qué espacio pertenece esa tienda, así que esto solo lleva a la
// tarjeta de Shopify dentro de Cord, donde la persona sí está identificada y
// elige el espacio. Firmar y validar igual evita que sirva de redirección
// abierta con el nombre de Cord.
export const prerender = false;

import type { APIRoute } from 'astro';
import { isShopDomain, shopifyCredentials } from '../../../../lib/integraciones/shopify/config';
import { oauthTimestampFresh, verifyOAuthHmac } from '../../../../lib/integraciones/shopify/oauth';

export const GET: APIRoute = async ({ url, redirect }) => {
    const creds = shopifyCredentials();
    const shop = url.searchParams.get('shop') ?? '';
    const firmado = !!creds
        && verifyOAuthHmac(url.searchParams, creds.clientSecret)
        && oauthTimestampFresh(url.searchParams);
    if (!isShopDomain(shop) || !firmado) return redirect('/app/ajustes/integraciones/shopify');
    return redirect(`/app/ajustes/integraciones/shopify?tienda=${encodeURIComponent(shop)}`);
};

// /api/integraciones/shopify/callback — regreso de la instalación.
//
// Shopify firma este regreso con el secreto de la app; sin esa firma cualquiera
// podría provocar un canje de código contra una tienda ajena. Se verifica la
// firma, la frescura del timestamp, el dominio y el state de Cord antes de tocar
// nada.
export const prerender = false;

import type { APIRoute } from 'astro';
import { getActiveOrgId, logAudit, reqIp } from '../../../../lib/db';
import { requirePerm } from '../../../../lib/queries';
import { currentUserId } from '../../../../lib/context';
import { after } from '../../../../lib/after';
import { consumeOAuthState } from '../../../../lib/integraciones/conexiones';
import { isShopDomain, shopifyCredentials } from '../../../../lib/integraciones/shopify/config';
import { exchangeShopifyCode, oauthTimestampFresh, verifyOAuthHmac } from '../../../../lib/integraciones/shopify/oauth';
import { leerNombreTienda, registrarWebhooks, saveShopifyConexion, syncShopify } from '../../../../lib/integraciones/shopify/service';
import { siteOrigin } from '../../../../lib/email';

const VUELTA = '/app/ajustes/integraciones/shopify';

export const GET: APIRoute = async ({ request, url, redirect }) => {
    const denied = await requirePerm('ajustes'); if (denied) return denied;
    const orgId = await getActiveOrgId();
    const userId = currentUserId();

    const creds = shopifyCredentials();
    if (!creds) return redirect(`${VUELTA}?shopify=error`);

    const shop = url.searchParams.get('shop') ?? '';
    const code = url.searchParams.get('code') ?? '';
    const state = url.searchParams.get('state') ?? '';
    if (!isShopDomain(shop) || !code) return redirect(`${VUELTA}?shopify=cancelada`);
    if (!verifyOAuthHmac(url.searchParams, creds.clientSecret) || !oauthTimestampFresh(url.searchParams)) {
        return redirect(`${VUELTA}?shopify=firma`);
    }
    if (!userId || !state || !(await consumeOAuthState(orgId, userId, 'shopify', state))) {
        return redirect(`${VUELTA}?shopify=estado`);
    }

    const token = await exchangeShopifyCode(shop, code.slice(0, 500));
    if (!token) return redirect(`${VUELTA}?shopify=error`);

    const tienda = await leerNombreTienda(shop, token.accessToken);
    await saveShopifyConexion({ orgId, userId, shop, token: token.accessToken, scopes: token.scopes, tienda });
    await logAudit(orgId, {
        accion: 'integracion.shopify_conectada', entidad: 'org', entidad_id: orgId,
        detalle: `Tienda ${tienda ?? shop}`, ip: reqIp(request),
    });

    // La primera sincronización puede tardar: la persona no espera frente a una
    // pantalla en blanco, ve la tarjeta conectada y el catálogo llega solo.
    after((async () => {
        await registrarWebhooks(orgId, `${siteOrigin()}/api/integraciones/shopify/webhook`);
        await syncShopify(orgId);
    })());
    return redirect(`${VUELTA}?shopify=conectada`);
};

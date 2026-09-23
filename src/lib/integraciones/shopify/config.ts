// Credenciales y constantes de la app de Cord en Shopify.
//
// Sin `SHOPIFY_CLIENT_ID`/`SHOPIFY_CLIENT_SECRET` la integración no se ofrece:
// la tarjeta dice "Próximamente" en vez de enseñar un botón que va a fallar
// (regla 15). El secreto firma dos cosas distintas —el regreso de OAuth y cada
// webhook—, así que vive solo en el servidor.

export const SHOPIFY_API_VERSION = '2026-07';

/**
 * Escribir borradores de pedido es lo único que Cord necesita para cerrar la
 * venta en la tienda; `read_orders` sirve para leer el pedido que resulta. Una
 * tienda conectada ANTES de la fase 2 no tiene estos permisos: la tarjeta se lo
 * dice y le pide volver a conectar, en vez de fallar contra el proveedor.
 */
export const SHOPIFY_SCOPES = ['read_products', 'read_customers', 'write_draft_orders', 'read_orders'] as const;

export const shopifyCredentials = () => {
    const clientId = import.meta.env.SHOPIFY_CLIENT_ID || process.env.SHOPIFY_CLIENT_ID;
    const clientSecret = import.meta.env.SHOPIFY_CLIENT_SECRET || process.env.SHOPIFY_CLIENT_SECRET;
    return clientId && clientSecret ? { clientId, clientSecret } : null;
};

/**
 * El dominio `*.myshopify.com` es la identidad de la tienda y viaja en la URL de
 * instalación, en el regreso de OAuth y en cada webhook. Se valida con forma
 * estricta porque con él se construye la dirección a la que Cord va a llamar:
 * aceptar cualquier texto sería dejar que el atacante elija el destino.
 */
export const isShopDomain = (v: unknown): v is string =>
    typeof v === 'string' && /^[a-z0-9][a-z0-9-]{0,59}\.myshopify\.com$/.test(v);

/** Normaliza lo que teclea el usuario: acepta la URL completa o solo el nombre. */
export function normalizeShopDomain(raw: string): string | null {
    let v = String(raw || '').trim().toLowerCase();
    if (!v) return null;
    if (v.includes('://')) {
        try { v = new URL(v).hostname; } catch { return null; }
    }
    v = v.replace(/\/.*$/, '');
    if (!v.includes('.')) v = `${v}.myshopify.com`;
    return isShopDomain(v) ? v : null;
}

// Shopify → Cord: catálogo y clientes.
//
// Dirección ÚNICA en esta fase: lo que existe en la tienda entra a Cord para
// poder cotizarlo con datos reales. Nada sale hacia Shopify todavía, así que
// ningún error de aquí puede tocar inventario ni pedidos de la tienda.
//
// El aislamiento es el de siempre (regla 30): el webhook resuelve la
// organización con `cord_resolve_integracion` —una función estrecha— y desde ahí
// todo vuelve a `withOrgTx`. El dominio de la tienda identifica, no autoriza.

import { sql, withOrgTx } from '../../db';
import { log } from '../../log';
import { decryptSecret, encryptRequiredSecret } from '../../crypto-secret';
import { idFromGid, shopifyGraphQL } from './client';
import { huellaDe, mapCustomer, mapProductVariants, type ClienteExterno, type ProductoExterno } from './mapping';
import { isShopDomain } from './config';

export interface ShopifyConexion {
    id: string;
    shop: string;
    estado: 'activa' | 'error' | 'desconectada';
    tienda: string | null;
    ultimaSync: string | null;
    ultimoError: string | null;
}

export async function getShopifyConexion(orgId: string): Promise<ShopifyConexion | null> {
    const [[row]] = await withOrgTx(orgId, sql`
        select id, cuenta_externa, cuenta_nombre, estado, ultima_sync_at, ultimo_error
          from integracion_conexiones where org_id = ${orgId} and proveedor = 'shopify'`);
    if (!row) return null;
    return {
        id: row.id as string,
        shop: row.cuenta_externa as string,
        estado: row.estado as ShopifyConexion['estado'],
        tienda: (row.cuenta_nombre as string) ?? null,
        ultimaSync: row.ultima_sync_at ? new Date(row.ultima_sync_at as string).toISOString() : null,
        ultimoError: (row.ultimo_error as string) ?? null,
    };
}

async function accessToken(orgId: string): Promise<{ shop: string; token: string; conexionId: string } | null> {
    const [[row]] = await withOrgTx(orgId, sql`
        select id, cuenta_externa, access_token_enc, estado from integracion_conexiones
         where org_id = ${orgId} and proveedor = 'shopify'`);
    if (!row || row.estado === 'desconectada') return null;
    const token = decryptSecret(row.access_token_enc as string);
    if (!token || !isShopDomain(row.cuenta_externa)) return null;
    return { shop: row.cuenta_externa as string, token, conexionId: row.id as string };
}

export async function saveShopifyConexion(input: {
    orgId: string; userId: string | null; shop: string; token: string; scopes: string[]; tienda: string | null;
}): Promise<string> {
    const [[row]] = await withOrgTx(input.orgId, sql`
        insert into integracion_conexiones
            (org_id, proveedor, estado, cuenta_externa, cuenta_nombre, scopes, access_token_enc, conectada_por)
        values (${input.orgId}, 'shopify', 'activa', ${input.shop}, ${input.tienda},
                ${input.scopes}::text[], ${encryptRequiredSecret(input.token)}, ${input.userId})
        on conflict (org_id, proveedor) do update set
            estado = 'activa', cuenta_externa = excluded.cuenta_externa, cuenta_nombre = excluded.cuenta_nombre,
            scopes = excluded.scopes, access_token_enc = excluded.access_token_enc,
            ultimo_error = null, ultimo_error_at = null, updated_at = now()
        returning id`);
    return row.id as string;
}

export async function disconnectShopify(orgId: string): Promise<boolean> {
    const [rows] = await withOrgTx(orgId, sql`
        update integracion_conexiones
           set estado = 'desconectada', access_token_enc = null, refresh_token_enc = null, updated_at = now()
         where org_id = ${orgId} and proveedor = 'shopify' and estado <> 'desconectada'
        returning id`);
    return rows.length === 1;
}

/** La tienda desinstaló la app: el token ya no sirve y hay que dejar de intentarlo. */
export async function marcarDesinstalada(orgId: string): Promise<void> {
    await withOrgTx(orgId, sql`
        update integracion_conexiones
           set estado = 'desconectada', access_token_enc = null, refresh_token_enc = null, updated_at = now()
         where org_id = ${orgId} and proveedor = 'shopify'`);
}

async function marcarError(orgId: string, mensaje: string): Promise<void> {
    await withOrgTx(orgId, sql`
        update integracion_conexiones
           set estado = 'error', ultimo_error = ${mensaje.slice(0, 500)}, ultimo_error_at = now(), updated_at = now()
         where org_id = ${orgId} and proveedor = 'shopify' and estado <> 'desconectada'`);
}

const PRODUCTOS_QUERY = `query($cursor: String) {
  products(first: 50, after: $cursor) {
    pageInfo { hasNextPage endCursor }
    nodes {
      id title description status
      variants(first: 100) { nodes { id title sku price availableForSale } }
    }
  }
}`;

const CLIENTES_QUERY = `query($cursor: String) {
  customers(first: 100, after: $cursor) {
    pageInfo { hasNextPage endCursor }
    nodes {
      id firstName lastName
      defaultEmailAddress { emailAddress }
      defaultPhoneNumber { phoneNumber }
      defaultAddress { company }
    }
  }
}`;

export interface SyncResumen {
    ok: boolean;
    productos: number;
    clientes: number;
    motivo?: 'sin_conexion' | 'auth' | 'shopify';
}

/**
 * Trae todo el catálogo y todos los clientes. Es un barrido completo y no
 * incremental a propósito: Shopify ya manda webhooks para lo que cambia, y un
 * barrido que se apoya en "lo modificado desde" pierde en silencio lo que se
 * movió mientras el token estaba caído.
 */
export async function syncShopify(orgId: string, limitePaginas = 40): Promise<SyncResumen> {
    const cred = await accessToken(orgId);
    if (!cred) return { ok: false, productos: 0, clientes: 0, motivo: 'sin_conexion' };

    let productos = 0;
    let clientes = 0;
    let cursor: string | null = null;

    for (let pagina = 0; pagina < limitePaginas; pagina++) {
        const res: any = await shopifyGraphQL<any>(cred.shop, cred.token, PRODUCTOS_QUERY, { cursor });
        if (!res.ok) {
            if (res.reason === 'auth') await marcarDesinstalada(orgId);
            else await marcarError(orgId, 'Shopify no entregó el catálogo');
            return { ok: false, productos, clientes, motivo: res.reason === 'auth' ? 'auth' : 'shopify' };
        }
        const page = res.data?.products;
        for (const node of page?.nodes ?? []) {
            for (const p of mapProductVariants(node)) {
                if (await upsertProducto(orgId, cred.conexionId, p)) productos += 1;
            }
        }
        if (!page?.pageInfo?.hasNextPage) break;
        cursor = page.pageInfo.endCursor;
    }

    cursor = null;
    for (let pagina = 0; pagina < limitePaginas; pagina++) {
        const res: any = await shopifyGraphQL<any>(cred.shop, cred.token, CLIENTES_QUERY, { cursor });
        if (!res.ok) {
            if (res.reason === 'auth') await marcarDesinstalada(orgId);
            else await marcarError(orgId, 'Shopify no entregó los clientes');
            return { ok: false, productos, clientes, motivo: res.reason === 'auth' ? 'auth' : 'shopify' };
        }
        const page = res.data?.customers;
        for (const node of page?.nodes ?? []) {
            const c = mapCustomer(node);
            if (c && await upsertCliente(orgId, cred.conexionId, c)) clientes += 1;
        }
        if (!page?.pageInfo?.hasNextPage) break;
        cursor = page.pageInfo.endCursor;
    }

    await withOrgTx(orgId, sql`
        update integracion_conexiones set ultima_sync_at = now(), estado = 'activa',
               ultimo_error = null, ultimo_error_at = null, updated_at = now()
         where org_id = ${orgId} and proveedor = 'shopify' and estado <> 'desconectada'`);
    return { ok: true, productos, clientes };
}

/** Devuelve true solo si escribió: una huella igual significa que Shopify repitió el mismo dato. */
async function upsertProducto(orgId: string, conexionId: string, p: ProductoExterno): Promise<boolean> {
    const huella = huellaDe([p.sku, p.nombre, p.descripcion, p.precio, p.activo]);
    const [[vinculo]] = await withOrgTx(orgId, sql`
        select local_id, huella from integracion_vinculos
         where conexion_id = ${conexionId} and org_id = ${orgId}
           and externo_tipo = 'shopify_product' and externo_id = ${p.externoId}`);
    if (vinculo?.huella === huella) return false;

    if (vinculo) {
        await withOrgTx(orgId,
            sql`update productos set sku = ${p.sku}, nombre = ${p.nombre}, descripcion = ${p.descripcion},
                       precio_lista = ${p.precio}, activo = ${p.activo}
                 where id = ${vinculo.local_id as string} and org_id = ${orgId}`,
            sql`update integracion_vinculos set huella = ${huella}, sincronizado_at = now()
                 where conexion_id = ${conexionId} and org_id = ${orgId}
                   and externo_tipo = 'shopify_product' and externo_id = ${p.externoId}`);
        return true;
    }

    const [[creado]] = await withOrgTx(orgId, sql`
        insert into productos (org_id, sku, nombre, descripcion, precio_lista, activo)
        values (${orgId}, ${p.sku}, ${p.nombre}, ${p.descripcion}, ${p.precio}, ${p.activo})
        returning id`);
    await withOrgTx(orgId, sql`
        insert into integracion_vinculos (org_id, conexion_id, objeto, local_id, externo_tipo, externo_id, huella, sincronizado_at)
        values (${orgId}, ${conexionId}, 'product', ${creado.id as string}, 'shopify_product', ${p.externoId}, ${huella}, now())
        on conflict (conexion_id, externo_tipo, externo_id) do nothing`);
    return true;
}

async function upsertCliente(orgId: string, conexionId: string, c: ClienteExterno): Promise<boolean> {
    const huella = huellaDe([c.empresa, c.contacto, c.email, c.telefono]);
    const [[vinculo]] = await withOrgTx(orgId, sql`
        select local_id, huella from integracion_vinculos
         where conexion_id = ${conexionId} and org_id = ${orgId}
           and externo_tipo = 'shopify_customer' and externo_id = ${c.externoId}`);
    if (vinculo?.huella === huella) return false;

    if (vinculo) {
        await withOrgTx(orgId,
            sql`update clientes set empresa = ${c.empresa}, contacto = ${c.contacto},
                       email = ${c.email}, telefono = ${c.telefono}
                 where id = ${vinculo.local_id as string} and org_id = ${orgId}`,
            sql`update integracion_vinculos set huella = ${huella}, sincronizado_at = now()
                 where conexion_id = ${conexionId} and org_id = ${orgId}
                   and externo_tipo = 'shopify_customer' and externo_id = ${c.externoId}`);
        return true;
    }

    // Un cliente que ya existe en Cord con ese correo no se duplica: se adopta.
    const [[existente]] = c.email
        ? await withOrgTx(orgId, sql`
            select id from clientes where org_id = ${orgId} and lower(email) = ${c.email.toLowerCase()} limit 1`)
        : [[]];
    const localId = existente?.id as string | undefined ?? (await withOrgTx(orgId, sql`
        insert into clientes (org_id, empresa, contacto, email, telefono)
        values (${orgId}, ${c.empresa}, ${c.contacto}, ${c.email}, ${c.telefono})
        returning id`))[0][0].id as string;

    if (existente) {
        await withOrgTx(orgId, sql`
            update clientes set contacto = coalesce(contacto, ${c.contacto}), telefono = coalesce(telefono, ${c.telefono})
             where id = ${localId} and org_id = ${orgId}`);
    }
    await withOrgTx(orgId, sql`
        insert into integracion_vinculos (org_id, conexion_id, objeto, local_id, externo_tipo, externo_id, huella, sincronizado_at)
        values (${orgId}, ${conexionId}, 'client', ${localId}, 'shopify_customer', ${c.externoId}, ${huella}, now())
        on conflict (conexion_id, externo_tipo, externo_id) do nothing`);
    return true;
}

/** Un webhook trae UN objeto ya listo: se aplica sin volver a pedir el catálogo entero. */
export async function aplicarWebhook(orgId: string, topic: string, payload: any): Promise<void> {
    const cred = await accessToken(orgId);
    if (!cred) return;
    try {
        if (topic === 'products/create' || topic === 'products/update') {
            const node = {
                id: `gid://shopify/Product/${payload?.id}`,
                title: payload?.title,
                description: payload?.body_html ? String(payload.body_html).replace(/<[^>]*>/g, ' ').trim() : null,
                status: payload?.status,
                variants: {
                    nodes: (payload?.variants ?? []).map((v: any) => ({
                        id: `gid://shopify/ProductVariant/${v?.id}`,
                        title: v?.title, sku: v?.sku, price: v?.price,
                        availableForSale: v?.available !== false,
                    })),
                },
            };
            for (const p of mapProductVariants(node)) await upsertProducto(orgId, cred.conexionId, p);
            return;
        }
        if (topic === 'customers/create' || topic === 'customers/update') {
            const c = mapCustomer({
                id: `gid://shopify/Customer/${payload?.id}`,
                firstName: payload?.first_name, lastName: payload?.last_name,
                defaultEmailAddress: { emailAddress: payload?.email },
                defaultPhoneNumber: { phoneNumber: payload?.phone },
                defaultAddress: { company: payload?.default_address?.company },
            });
            if (c) await upsertCliente(orgId, cred.conexionId, c);
            return;
        }
        if (topic === 'products/delete') {
            // El producto se desactiva, no se borra: pudo quedar dentro de una
            // cotización ya enviada, y borrarlo dejaría esa venta sin respaldo.
            const externoId = String(payload?.id ?? '');
            if (!/^\d{1,20}$/.test(externoId)) return;
            await withOrgTx(orgId, sql`
                update productos p set activo = false
                  from integracion_vinculos v
                 where v.org_id = ${orgId} and v.conexion_id = ${cred.conexionId}
                   and v.externo_tipo = 'shopify_product' and v.externo_id = ${externoId}
                   and p.id = v.local_id and p.org_id = ${orgId}`);
        }
    } catch (err) {
        log.error('no se pudo aplicar el webhook de Shopify', { route: 'shopify-service', orgId, topic, err });
    }
}

const WEBHOOK_TOPICS = [
    'PRODUCTS_CREATE', 'PRODUCTS_UPDATE', 'PRODUCTS_DELETE',
    'CUSTOMERS_CREATE', 'CUSTOMERS_UPDATE', 'APP_UNINSTALLED',
] as const;

/** Suscribe la tienda a los eventos que Cord necesita. Idempotente del lado de Shopify. */
export async function registrarWebhooks(orgId: string, callbackUrl: string): Promise<number> {
    const cred = await accessToken(orgId);
    if (!cred) return 0;
    let creados = 0;
    for (const topic of WEBHOOK_TOPICS) {
        const res = await shopifyGraphQL<any>(cred.shop, cred.token, `
            mutation($topic: WebhookSubscriptionTopic!, $url: URL!) {
              webhookSubscriptionCreate(topic: $topic, webhookSubscription: { callbackUrl: $url, format: JSON }) {
                userErrors { field message }
                webhookSubscription { id }
              }
            }`, { topic, url: callbackUrl });
        if (res.ok && res.data?.webhookSubscriptionCreate?.webhookSubscription?.id) creados += 1;
    }
    return creados;
}

/** Nombre visible de la tienda, para que la tarjeta no muestre solo el dominio. */
export async function leerNombreTienda(shop: string, token: string): Promise<string | null> {
    const res = await shopifyGraphQL<any>(shop, token, `{ shop { name } }`);
    const nombre = res.ok ? res.data?.shop?.name : null;
    return typeof nombre === 'string' && nombre.trim() ? nombre.trim().slice(0, 200) : null;
}

export { idFromGid };

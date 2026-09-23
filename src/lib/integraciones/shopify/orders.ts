// Cord → Shopify: el pedido cuando la cotización cierra.
//
// Es la PRIMERA dirección en la que Cord escribe en la tienda, así que todo aquí
// está pensado para no inventar nada en el negocio de alguien más:
//
//  - **No se crea nada sin que el comerciante lo pida.** El disparador vive en
//    los ajustes de la conexión y nace apagado: crear pedidos toca inventario y
//    números de la tienda, y eso no puede aparecer por sorpresa (regla 15).
//  - **Un pedido por cotización, garantizado por el vínculo**, no por un `if`:
//    si ya existe, se reusa. Un evento repetido no acuña un segundo pedido.
//  - **Una divisa distinta no se "convierte".** Si la cotización va en otra
//    divisa que la tienda, no se crea el pedido y se dice por qué (regla 21):
//    mandar el número sin su divisa lo cobraría en la equivocada.
//  - **El impuesto lo calcula Shopify** con la configuración de la tienda. Cord
//    manda precios unitarios y cantidades; el documento fiscal sigue siendo el
//    de Cord.

import { sql, withOrgTx } from '../../db';
import { log } from '../../log';
import { decryptSecret } from '../../crypto-secret';
import { normalizeCurrency } from '../../currency';
import { idFromGid, shopifyGraphQL } from './client';
import { isShopDomain } from './config';

/** Cuándo crear el pedido. Nace apagado a propósito. */
export type DisparadorPedido = 'no' | 'aprobada' | 'pagada';

export const DISPARADORES: readonly DisparadorPedido[] = ['no', 'aprobada', 'pagada'];

export const SCOPE_PEDIDOS = 'write_draft_orders';

interface Conexion {
    conexionId: string;
    shop: string;
    token: string;
    scopes: string[];
    disparador: DisparadorPedido;
    monedaTienda: string | null;
}

async function leerConexion(orgId: string): Promise<Conexion | null> {
    const [[row]] = await withOrgTx(orgId, sql`
        select id, cuenta_externa, access_token_enc, scopes, ajustes, estado
          from integracion_conexiones where org_id = ${orgId} and proveedor = 'shopify'`);
    if (!row || row.estado !== 'activa') return null;
    const token = decryptSecret(row.access_token_enc as string);
    if (!token || !isShopDomain(row.cuenta_externa)) return null;
    const ajustes = (row.ajustes ?? {}) as Record<string, unknown>;
    const disparador = String(ajustes.pedidos ?? 'no') as DisparadorPedido;
    return {
        conexionId: row.id as string,
        shop: row.cuenta_externa as string,
        token,
        scopes: Array.isArray(row.scopes) ? (row.scopes as string[]) : [],
        disparador: DISPARADORES.includes(disparador) ? disparador : 'no',
        monedaTienda: typeof ajustes.moneda === 'string' ? ajustes.moneda : null,
    };
}

export interface LineaCotizacion {
    descripcion?: unknown;
    cantidad?: unknown;
    precio_unitario?: unknown;
    precio_negociado?: unknown;
    descuento_pct?: unknown;
    /** Id de la variante en Shopify cuando el producto está vinculado. */
    variante?: unknown;
}

/**
 * De las líneas de la cotización a las del pedido. El precio que viaja es el
 * NEGOCIADO con su descuento aplicado: mandar el de lista cobraría de más en la
 * tienda por una venta que el cliente aceptó a otro precio.
 *
 * Una línea con producto de la tienda va como variante —así el pedido descuenta
 * inventario y el surtido sabe qué empacar— y una línea libre va como concepto
 * suelto con su precio, en vez de perderse.
 */
export function mapLineItems(items: LineaCotizacion[], moneda: string): Record<string, unknown>[] {
    return items.map((i) => {
        const negociado = Number(i.precio_negociado);
        const base = Number.isFinite(negociado) && i.precio_negociado !== null && i.precio_negociado !== undefined
            ? negociado
            : Number(i.precio_unitario) || 0;
        const descuento = Number(i.descuento_pct) || 0;
        const precio = Math.max(0, (Number.isFinite(base) ? base : 0) * (1 - descuento / 100));
        const quantity = Math.max(1, Math.round(Number(i.cantidad) || 1));
        return i.variante
            ? {
                variantId: `gid://shopify/ProductVariant/${i.variante}`,
                quantity,
                priceOverride: { amount: precio.toFixed(2), currencyCode: moneda },
            }
            : {
                title: String(i.descripcion || 'Concepto').slice(0, 200),
                quantity,
                originalUnitPrice: precio.toFixed(2),
            };
    });
}

export interface ResultadoPedido {
    ok: boolean;
    pedido?: string;
    motivo?: 'sin_conexion' | 'apagado' | 'sin_permiso' | 'divisa' | 'sin_lineas' | 'shopify' | 'ya_existe';
}

/** Lo que el evento de dominio dispara. Nunca lanza: un fallo aquí no rompe la venta. */
export async function onQuoteEvent(orgId: string, type: string, quoteId: string): Promise<void> {
    if (type !== 'quote.approved' && type !== 'quote.paid') return;
    try {
        const cx = await leerConexion(orgId);
        if (!cx || cx.disparador === 'no') return;
        if (type === 'quote.approved' && cx.disparador !== 'aprobada') return;
        if (type === 'quote.paid' && cx.disparador !== 'pagada') return;
        await crearPedido(orgId, quoteId, { pagado: type === 'quote.paid' });
    } catch (err) {
        log.error('no se pudo crear el pedido en Shopify', { route: 'shopify-orders', orgId, type, err });
    }
}

const CREAR = `mutation($input: DraftOrderInput!) {
  draftOrderCreate(input: $input) {
    draftOrder { id name }
    userErrors { field message }
  }
}`;

const COMPLETAR = `mutation($id: ID!) {
  draftOrderComplete(id: $id, paymentPending: false) {
    draftOrder { id order { id name } }
    userErrors { field message }
  }
}`;

export async function crearPedido(
    orgId: string, quoteId: string, opts: { pagado: boolean },
): Promise<ResultadoPedido> {
    const cx = await leerConexion(orgId);
    if (!cx) return { ok: false, motivo: 'sin_conexion' };
    // El permiso se pide al instalar: una tienda conectada ANTES de esta función
    // no lo tiene, y hay que decirlo en vez de fallar contra el proveedor.
    if (!cx.scopes.includes(SCOPE_PEDIDOS)) return { ok: false, motivo: 'sin_permiso' };

    const [[q]] = await withOrgTx(orgId, sql`
        select c.id, c.folio, c.base_currency, c.cliente_id, cl.email as cliente_email
          from cotizaciones c
          left join clientes cl on cl.id = c.cliente_id and cl.org_id = c.org_id
         where c.id = ${quoteId} and c.org_id = ${orgId}`);
    if (!q) return { ok: false, motivo: 'sin_lineas' };

    const [[vinculo]] = await withOrgTx(orgId, sql`
        select externo_id, externo_tipo from integracion_vinculos
         where conexion_id = ${cx.conexionId} and org_id = ${orgId}
           and objeto = 'quote' and local_id = ${quoteId}`);
    // Ya hay pedido: si además se pagó, se completa; si no, no se duplica.
    if (vinculo) {
        if (!opts.pagado || vinculo.externo_tipo === 'shopify_order') return { ok: false, motivo: 'ya_existe' };
        return await completarPedido(orgId, cx, quoteId, String(vinculo.externo_id));
    }

    const moneda = normalizeCurrency(q.base_currency as string);
    if (cx.monedaTienda && moneda !== cx.monedaTienda) return { ok: false, motivo: 'divisa' };

    const [items] = await withOrgTx(orgId, sql`
        select i.descripcion, i.cantidad, i.precio_unitario, i.precio_negociado, i.descuento_pct,
               v.externo_id as variante
          from cotizacion_items i
          left join integracion_vinculos v
                 on v.local_id = i.producto_id and v.org_id = ${orgId}
                and v.conexion_id = ${cx.conexionId} and v.externo_tipo = 'shopify_product'
         where i.cotizacion_id = ${quoteId}
         order by i.orden asc`);
    if (!items.length) return { ok: false, motivo: 'sin_lineas' };

    const lineItems = mapLineItems(items, moneda);

    const [[clienteVinculo]] = q.cliente_id
        ? await withOrgTx(orgId, sql`
            select externo_id from integracion_vinculos
             where conexion_id = ${cx.conexionId} and org_id = ${orgId}
               and externo_tipo = 'shopify_customer' and local_id = ${q.cliente_id}`)
        : [[]];

    const input: Record<string, unknown> = {
        lineItems,
        note: `Cotización ${q.folio} de Cord`,
        tags: ['cord'],
        customAttributes: [{ key: 'Cord', value: String(q.folio) }],
    };
    if (clienteVinculo?.externo_id) input.purchasingEntity = { customerId: `gid://shopify/Customer/${clienteVinculo.externo_id}` };
    else if (q.cliente_email) input.email = q.cliente_email;

    const res: any = await shopifyGraphQL<any>(cx.shop, cx.token, CREAR, { input });
    const errores = res.ok ? res.data?.draftOrderCreate?.userErrors ?? [] : [];
    const draftId = res.ok ? idFromGid(res.data?.draftOrderCreate?.draftOrder?.id) : null;
    if (!draftId) {
        log.error('Shopify no creó el pedido', {
            route: 'shopify-orders', orgId,
            motivos: errores.map((e: any) => e?.message ?? 'sin mensaje').slice(0, 3),
        });
        return { ok: false, motivo: 'shopify' };
    }

    await withOrgTx(orgId,
        sql`insert into integracion_vinculos (org_id, conexion_id, objeto, local_id, externo_tipo, externo_id, sincronizado_at)
            values (${orgId}, ${cx.conexionId}, 'quote', ${quoteId}, 'shopify_draft_order', ${draftId}, now())
            on conflict (conexion_id, objeto, local_id) do nothing`,
        sql`insert into eventos (org_id, cotizacion_id, tipo, detalle)
            values (${orgId}, ${quoteId}, 'nota', ${`Pedido creado en Shopify (borrador ${res.data.draftOrderCreate.draftOrder.name ?? draftId})`})`);

    if (opts.pagado) return await completarPedido(orgId, cx, quoteId, draftId);
    return { ok: true, pedido: draftId };
}

/** El dinero ya entró por Cord: el borrador pasa a pedido pagado en la tienda. */
async function completarPedido(orgId: string, cx: Conexion, quoteId: string, draftId: string): Promise<ResultadoPedido> {
    const res: any = await shopifyGraphQL<any>(cx.shop, cx.token, COMPLETAR, { id: `gid://shopify/DraftOrder/${draftId}` });
    const orderId = res.ok ? idFromGid(res.data?.draftOrderComplete?.draftOrder?.order?.id) : null;
    if (!orderId) {
        log.error('Shopify no completó el pedido', { route: 'shopify-orders', orgId, draftId });
        return { ok: false, motivo: 'shopify' };
    }
    const nombre = res.data?.draftOrderComplete?.draftOrder?.order?.name ?? orderId;
    await withOrgTx(orgId,
        sql`update integracion_vinculos set externo_tipo = 'shopify_order', externo_id = ${orderId}, sincronizado_at = now()
             where conexion_id = ${cx.conexionId} and org_id = ${orgId} and objeto = 'quote' and local_id = ${quoteId}`,
        sql`insert into eventos (org_id, cotizacion_id, tipo, detalle)
            values (${orgId}, ${quoteId}, 'nota', ${`Pedido ${nombre} marcado como pagado en Shopify`})`);
    return { ok: true, pedido: orderId };
}

/** Guarda el disparador que eligió el comerciante. */
export async function guardarDisparador(orgId: string, disparador: DisparadorPedido): Promise<boolean> {
    if (!DISPARADORES.includes(disparador)) return false;
    const [rows] = await withOrgTx(orgId, sql`
        update integracion_conexiones
           set ajustes = jsonb_set(coalesce(ajustes, '{}'::jsonb), '{pedidos}', to_jsonb(${disparador}::text), true),
               updated_at = now()
         where org_id = ${orgId} and proveedor = 'shopify' and estado <> 'desconectada'
        returning id`);
    return rows.length === 1;
}

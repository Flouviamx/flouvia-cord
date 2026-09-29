// Tienda → Cord: la factura de un pedido que nace en Shopify.
//
// Nace apagado, como el pedido de vuelta: facturar es una decisión fiscal del
// negocio. Cuando se enciende, cada pedido PAGADO de la tienda crea un BORRADOR
// de factura en Cord; emitirlo sigue siendo decisión de una persona, porque el
// CFDI es irreversible y consume timbrado.
//
//  - **Un pedido, una factura**, garantizado por el vínculo `shopify_order`: si
//    el pedido ya está ligado a algo (a su factura, o a la cotización de Cord
//    que lo creó), no se hace nada.
//  - **Los pedidos que creó Cord no se facturan aquí.** Llevan la etiqueta `cord`
//    y ya tienen su cotización, que es de donde sale su factura.
//  - **La divisa es la que pagó el cliente** (`presentment_currency`), con sus
//    importes; Cord no convierte nada.

import { sql, withOrgTx } from '../../db';
import { log } from '../../log';
import { createInvoiceDraft, type DraftLineInput } from '../../fiscal/invoices';
import { mapCustomer } from './mapping';
import { accessToken, registrarWebhooks, upsertCliente } from './service';

export type DisparadorFactura = 'no' | 'pagado';
export const DISPARADORES_FACTURA: readonly DisparadorFactura[] = ['no', 'pagado'];

const dinero = (set: any, fallback: unknown) => {
    const n = Number(set?.presentment_money?.amount ?? fallback);
    return Number.isFinite(n) ? n : 0;
};
const redondear = (n: number) => Math.round(n * 100) / 100;

export interface PedidoMapeado {
    moneda: string;
    impuestoIncluido: boolean;
    lineas: (DraftLineInput & { varianteId: string | null })[];
}

/** Del pedido de Shopify (webhook REST) a las líneas de un borrador de Cord. */
export function mapearPedido(order: any): PedidoMapeado {
    const lineas: PedidoMapeado['lineas'] = [];
    for (const li of Array.isArray(order?.line_items) ? order.line_items : []) {
        const cantidad = Number(li?.quantity) || 0;
        if (cantidad <= 0) continue;
        const precio = dinero(li?.price_set, li?.price);
        const descuentos = Array.isArray(li?.discount_allocations) && li.discount_allocations.length
            ? li.discount_allocations.reduce((s: number, d: any) => s + dinero(d?.amount_set, d?.amount), 0)
            : dinero(li?.total_discount_set, li?.total_discount);
        const titulo = [li?.title, li?.variant_title].filter((v) => v && String(v).toLowerCase() !== 'default title').join(' · ');
        const tasa = li?.taxable === false
            ? 0
            : (Array.isArray(li?.tax_lines) ? li.tax_lines.reduce((s: number, t: any) => s + (Number(t?.rate) || 0), 0) : null);
        lineas.push({
            descripcion: String(titulo || 'Producto').slice(0, 500),
            cantidad,
            precioUnitario: redondear(Math.max(0, precio - descuentos / cantidad)),
            taxRate: tasa,
            varianteId: li?.variant_id ? String(li.variant_id) : null,
        });
    }
    for (const envio of Array.isArray(order?.shipping_lines) ? order.shipping_lines : []) {
        const monto = dinero(envio?.price_set, envio?.price);
        if (monto <= 0) continue;
        const tasa = Array.isArray(envio?.tax_lines) && envio.tax_lines.length
            ? envio.tax_lines.reduce((s: number, t: any) => s + (Number(t?.rate) || 0), 0) : 0;
        lineas.push({ descripcion: String(envio?.title || 'Envío').slice(0, 500), cantidad: 1, precioUnitario: redondear(monto), taxRate: tasa, varianteId: null });
    }
    return {
        moneda: String(order?.presentment_currency || order?.currency || '').toUpperCase(),
        impuestoIncluido: order?.taxes_included === true,
        lineas,
    };
}

export function esPedidoDeCord(order: any): boolean {
    return String(order?.tags ?? '').split(',').map((t) => t.trim().toLowerCase()).includes('cord');
}

export async function guardarFacturas(orgId: string, valor: DisparadorFactura, webhookUrl: string): Promise<boolean> {
    if (!DISPARADORES_FACTURA.includes(valor)) return false;
    const [rows] = await withOrgTx(orgId, sql`
        update integracion_conexiones
           set ajustes = jsonb_set(coalesce(ajustes, '{}'::jsonb), '{facturas}', to_jsonb(${valor}::text), true),
               updated_at = now()
         where org_id = ${orgId} and proveedor = 'shopify' and estado <> 'desconectada'
        returning id`);
    // Una tienda conectada antes de esta función no tiene el aviso de pedido
    // pagado: se registra al encenderla. Shopify rechaza el duplicado solo.
    if (rows.length === 1 && valor === 'pagado') await registrarWebhooks(orgId, webhookUrl);
    return rows.length === 1;
}

/** Lo dispara el webhook `orders/paid`. Nunca lanza: un fallo aquí no rompe nada de la tienda. */
export async function facturarPedido(orgId: string, order: any): Promise<void> {
    try {
        const cred = await accessToken(orgId);
        if (!cred) return;
        const [[cx]] = await withOrgTx(orgId, sql`
            select ajustes from integracion_conexiones where id = ${cred.conexionId} and org_id = ${orgId}`);
        if ((cx?.ajustes as any)?.facturas !== 'pagado') return;
        if (esPedidoDeCord(order)) return;

        const orderId = String(order?.id ?? '');
        if (!/^\d{1,20}$/.test(orderId)) return;
        const [[ya]] = await withOrgTx(orgId, sql`
            select 1 from integracion_vinculos
             where org_id = ${orgId} and conexion_id = ${cred.conexionId}
               and externo_tipo = 'shopify_order' and externo_id = ${orderId}`);
        if (ya) return;

        // Sin cliente no hay a quién facturar: el pedido de invitado se registra
        // y se deja para que el negocio decida.
        const cliente = order?.customer?.id ? mapCustomer({
            id: `gid://shopify/Customer/${order.customer.id}`,
            firstName: order.customer.first_name, lastName: order.customer.last_name,
            defaultEmailAddress: { emailAddress: order.customer.email ?? order.email },
            defaultPhoneNumber: { phoneNumber: order.customer.phone },
            defaultAddress: { company: order.customer.default_address?.company ?? order.billing_address?.company },
        }) : null;
        if (!cliente) {
            log.info('pedido de Shopify sin cliente: no se factura', { route: 'shopify-facturas', orgId, orderId });
            return;
        }
        await upsertCliente(orgId, cred.conexionId, cliente);
        const [[vc]] = await withOrgTx(orgId, sql`
            select local_id from integracion_vinculos
             where org_id = ${orgId} and conexion_id = ${cred.conexionId}
               and externo_tipo = 'shopify_customer' and externo_id = ${cliente.externoId}`);
        if (!vc) return;

        const pedido = mapearPedido(order);
        if (!pedido.lineas.length || !pedido.moneda) return;
        const variantes = pedido.lineas.map((l) => l.varianteId).filter(Boolean) as string[];
        const [prods] = variantes.length ? await withOrgTx(orgId, sql`
            select local_id, externo_id from integracion_vinculos
             where org_id = ${orgId} and conexion_id = ${cred.conexionId}
               and externo_tipo = 'shopify_product' and externo_id = any(${variantes}::text[])`) : [[]];
        const productoDe = new Map((prods as any[]).map((p) => [String(p.externo_id), String(p.local_id)]));

        const r = await createInvoiceDraft(orgId, {
            clienteId: String(vc.local_id),
            currency: pedido.moneda,
            ivaIncluido: pedido.impuestoIncluido,
            notes: `Pedido ${order?.name ?? orderId} de Shopify`,
            items: pedido.lineas.map(({ varianteId, ...l }) => ({ ...l, productoId: varianteId ? productoDe.get(varianteId) ?? null : null })),
        });
        if (!r.ok || !r.documentId) {
            log.error('Shopify: no se pudo crear el borrador de factura', { route: 'shopify-facturas', orgId, orderId, detalle: r.error });
            return;
        }
        await withOrgTx(orgId, sql`
            insert into integracion_vinculos (org_id, conexion_id, objeto, local_id, externo_tipo, externo_id, sincronizado_at)
            values (${orgId}, ${cred.conexionId}, 'invoice', ${r.documentId}, 'shopify_order', ${orderId}, now())
            on conflict (conexion_id, externo_tipo, externo_id) do nothing`);
    } catch (err) {
        log.error('Shopify: fallo al facturar el pedido', { route: 'shopify-facturas', orgId, err });
    }
}

// POST /api/cotizaciones/[id]/duplicate — copia una cotización a un nuevo borrador.
// Clona cliente, términos, notas, divisas, modo de precio e items con su tasa;
// asigna folio y public_token nuevos, status 'draft' y vigencia fresca (+30
// días). Responde { id, folio }.
//
// Pasa por createCotizacion, el mismo camino que un alta normal: antes copiaba
// filas a mano y la copia perdía la tasa de cada línea (un concepto exento
// volvía gravado), la divisa (una venta en USD se duplicaba en la de la
// organización), el precio con impuesto incluido y las retenciones; tampoco
// pedía permiso de cotizar, ni respetaba el tope de cotizaciones activas del
// plan, y su folio podía repetirse.
export const prerender = false;

import type { APIRoute } from 'astro';
import { sql, getActiveOrgId, reqIp, withOrgTx } from '../../../../lib/db';
import { requirePerm } from '../../../../lib/queries';
import { createCotizacion, QuoteError, type NewQuoteItem } from '../../../../lib/cotizaciones';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const POST: APIRoute = async ({ params, request }) => {
    const denied = await requirePerm('cotizar');
    if (denied) return denied;
    const id = params.id ?? '';
    if (!UUID_RE.test(id)) return json({ error: 'Cotización no encontrada' }, 404);
    const orgId = await getActiveOrgId();

    const [srcRows, items] = await withOrgTx(orgId,
        sql`select id, folio, cliente_id, terminos, notas, base_currency, fiscal_currency, moneda,
                   iva_incluido, anticipo_pct, es_recurrente
              from cotizaciones where id = ${id} and org_id = ${orgId}`,
        sql`select i.producto_id, i.descripcion, i.cantidad, i.precio_unitario, i.precio_negociado,
                   i.costo_unitario, i.tax_rate, i.exemption_reason
              from cotizacion_items i
              join cotizaciones c on c.id = i.cotizacion_id and c.org_id = ${orgId}
             where i.cotizacion_id = ${id}
             order by i.orden`,
    );
    const src = srcRows[0];
    if (!src) return json({ error: 'Cotización no encontrada' }, 404);

    try {
        const result = await createCotizacion(orgId, {
            cliente_id: (src.cliente_id as string) || null,
            terminos: (src.terminos as string) || undefined,
            notas: (src.notas as string) || null,
            base_currency: (src.base_currency as string) || (src.moneda as string) || null,
            fiscal_currency: (src.fiscal_currency as string) || null,
            iva_incluido: Boolean(src.iva_incluido),
            anticipo_pct: src.anticipo_pct === null || src.anticipo_pct === undefined ? null : Number(src.anticipo_pct),
            es_recurrente: Boolean(src.es_recurrente),
            send: false,
            // La tasa congelada de cada línea viaja tal cual; createCotizacion la
            // valida contra el catálogo VIGENTE (una tasa retirada cae a la
            // predeterminada, como en cualquier documento nuevo). `null` es una
            // línea anterior al impuesto por línea y conserva ese significado.
            items: (items as any[]).map((it): NewQuoteItem => ({
                producto_id: (it.producto_id as string) || null,
                descripcion: String(it.descripcion ?? ''),
                cantidad: Number(it.cantidad),
                precio_unitario: Number(it.precio_unitario),
                precio_negociado: it.precio_negociado === null || it.precio_negociado === undefined ? null : Number(it.precio_negociado),
                costo_unitario: it.costo_unitario === null || it.costo_unitario === undefined ? null : Number(it.costo_unitario),
                tax_rate: it.tax_rate === null || it.tax_rate === undefined ? null : Number(it.tax_rate),
                exemption_reason: (it.exemption_reason as string) || null,
            })),
        }, {
            origin: new URL(request.url).origin,
            ip: reqIp(request),
            duplicateOf: { id: String(src.id), folio: String(src.folio) },
        });
        return json({ id: result.id, folio: result.folio });
    } catch (e) {
        if (e instanceof QuoteError) return json({ error: e.message }, e.status);
        throw e;
    }
};

function json(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

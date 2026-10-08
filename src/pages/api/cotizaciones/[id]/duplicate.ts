// POST /api/cotizaciones/[id]/duplicate — copia una cotización a un nuevo borrador.
// Responde { id, folio }.
//
// La copia pasa por `createCotizacion`, el mismo camino que un alta normal. La
// versión anterior insertaba la fila a mano y olvidaba la mitad de las
// columnas: una cotización en USD se duplicaba como MXN con los importes en
// dólares; con precios con IVA incluido, el link mostraba un total y Stripe
// cobraba otro; las líneas exentas volvían a gravarse porque `tax_rate` no se
// copiaba. Tampoco revisaba permiso ni el límite de cotizaciones del plan.
// Rehacer el alta por el camino canónico trae todo eso de vuelta (totales
// recalculados con el motor, folio atómico, límite de plan, versión 1).
export const prerender = false;

import type { APIRoute } from 'astro';
import { sql, getActiveOrgId, reqIp, withOrgTx } from '../../../../lib/db';
import { requirePerm } from '../../../../lib/queries';
import { createCotizacion, QuoteError } from '../../../../lib/cotizaciones';
import { taxCatalogFor, TaxCatalogUnavailableError } from '../../../../lib/impuestos-db';

export const POST: APIRoute = async ({ params, request }) => {
    const denied = await requirePerm('cotizar');
    if (denied) return denied;

    const id = params.id ?? '';
    const orgId = await getActiveOrgId();

    const [srcRows, items] = await withOrgTx(orgId,
        sql`select id, folio, cliente_id, terminos, notas, base_currency, fiscal_currency, iva_incluido,
                   anticipo_pct, es_recurrente
              from cotizaciones where id = ${id} and org_id = ${orgId}`,
        sql`select ci.producto_id, ci.descripcion, ci.cantidad, ci.precio_unitario, ci.precio_negociado,
                   ci.costo_unitario, ci.tax_rate
              from cotizacion_items ci join cotizaciones c on c.id = ci.cotizacion_id
             where ci.cotizacion_id = ${id} and c.org_id = ${orgId}
             order by ci.orden`);
    const src = srcRows[0];
    if (!src) return json({ error: 'Cotización no encontrada' }, 404);
    if (!items.length) return json({ error: 'La cotización no tiene líneas que copiar.' }, 400);
    // Una copia es un documento NUEVO: si la tasa con la que se capturó la
    // original ya no está en el catálogo, la copia nace con la predeterminada
    // (el vendedor la revisa en el borrador) en vez de fallar sin forma de
    // corregirla desde aquí.
    let catalogo;
    try {
        catalogo = await taxCatalogFor(orgId);
    } catch (error) {
        if (error instanceof TaxCatalogUnavailableError) return json({ error: error.message }, 503);
        throw error;
    }
    const tasaVigente = (rate: unknown) => {
        if (rate === null || rate === undefined) return null;
        return Number.isNaN(catalogo.resolve(rate, Number.NaN)) ? null : Number(rate);
    };

    try {
        const result = await createCotizacion(orgId, {
            cliente_id: (src.cliente_id as string) || null,
            terminos: (src.terminos as string) || undefined,
            notas: (src.notas as string) || null,
            send: false,
            base_currency: (src.base_currency as string) || null,
            fiscal_currency: (src.fiscal_currency as string) || null,
            // El tipo de cambio NO se copia: una cotización nueva congela la tasa
            // de hoy (regla 22). El colchón es el predeterminado del editor.
            fx_buffer_pct: 2,
            iva_incluido: !!src.iva_incluido,
            anticipo_pct: src.anticipo_pct === null ? null : Number(src.anticipo_pct),
            es_recurrente: !!src.es_recurrente,
            items: (items as any[]).map((it) => ({
                producto_id: it.producto_id,
                descripcion: it.descripcion,
                cantidad: Number(it.cantidad),
                precio_unitario: Number(it.precio_unitario),
                precio_negociado: it.precio_negociado === null ? null : Number(it.precio_negociado),
                costo_unitario: it.costo_unitario === null ? null : Number(it.costo_unitario),
                // `null` = línea anterior al impuesto por línea: el alta cae a la
                // tasa predeterminada, que es como se calculaba entonces.
                tax_rate: tasaVigente(it.tax_rate),
            })),
        }, {
            origin: new URL(request.url).origin,
            ip: reqIp(request),
            duplicateOf: { id: String(src.id), folio: String(src.folio) },
        });
        return json({ id: result.id, folio: result.folio });
    } catch (error) {
        if (error instanceof QuoteError) return json({ error: error.message }, error.status);
        throw error;
    }
};

function json(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

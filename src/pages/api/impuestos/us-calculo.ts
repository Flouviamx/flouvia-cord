// /api/impuestos/us-calculo — vista previa del sales tax de EE. UU. por
// dirección para los editores de cotizaciones y facturas.
//   POST { cliente_id, currency, iva_incluido, items: [{ cantidad, precio_unitario, precio_negociado? }],
//          descuento? | cupon?, us_tax_calculo_id?, documento? }
//     → { aplica: false }
//     | { aplica: true, calculo_id, lineas: [{ tasa, impuesto, desglose }], impuestos }
//
// El cálculo queda GUARDADO (us_tax_calculos) y el editor manda su id al
// guardar el documento: el servidor lo reusa solo si coincide con lo que se
// guarda —si no, calcula el suyo—, así que la vista previa no cuesta un
// segundo cálculo y la tasa nunca la decide el navegador. Sin cálculo posible
// responde qué falta (regla 22); nunca un mensaje del proveedor (regla 14).
//
// `documento` ('cotizacion:<id>', 'documento:<id>' o 'borrador:<id>' por
// sesión de un documento nuevo) solo alimenta el tope de cálculos por
// documento y por día (US_TAX_CALCULOS_DOCUMENTO_DIA): un editor abierto no
// puede pedir cálculos sin fin. No es una credencial; lo que no se le puede
// creer lo acotan los topes por organización.
export const prerender = false;

import type { APIRoute } from 'astro';
import { getActiveOrgId } from '../../../lib/db';
import { requirePermAny } from '../../../lib/queries';
import { limitConnectMutation } from '../../../lib/connect-security';
import { sanitizeItem } from '../../../../packages/elements/src/engine';
import { MAX_ITEMS, hasNegativeLine, NEGATIVE_LINE_ERROR } from '../../../lib/cotizaciones';
import { leerDescuentoBody, descuentoParaMotor, type DescuentoDef } from '../../../lib/descuentos';
import { DescuentoError, resolverDescuento } from '../../../lib/cupones';
import { currencyDecimals, normalizeCurrency } from '../../../lib/currency';
import { prepareUsTaxForDocument, usTaxCalculoLineas } from '../../../lib/us-tax/calculo';
import { UsTaxError } from '../../../lib/us-tax/core';

export const POST: APIRoute = async ({ request }) => {
    const denied = await requirePermAny(['cotizar', 'cobranza']); if (denied) return denied;
    const orgId = await getActiveOrgId();
    // Cada cálculo le cuesta a Cord: además del tope por organización que
    // aplica us-tax/calculo.ts, la vista previa tiene el suyo por persona e IP.
    const limited = await limitConnectMutation(request, 'us-tax-preview', orgId, 30);
    if (limited) return limited;
    let body: any;
    try { body = await request.json(); } catch { return json({ error: 'JSON inválido' }, 400); }

    const raw = Array.isArray(body?.items) ? body.items : [];
    if (!raw.length) return json({ aplica: false });
    if (raw.length > MAX_ITEMS) return json({ error: `Demasiadas líneas (máximo ${MAX_ITEMS}).` }, 400);
    if (hasNegativeLine(raw)) return json({ error: NEGATIVE_LINE_ERROR, code: 'invalid_request' }, 400);
    const items = raw.map((it: any) => sanitizeItem({
        cantidad: it?.cantidad, precio_unitario: it?.precio_unitario, precio_negociado: it?.precio_negociado,
    }));
    const currency = normalizeCurrency(body?.currency);
    const clienteId = typeof body?.cliente_id === 'string' && body.cliente_id ? body.cliente_id : null;

    // El mismo descuento que aplicará el guardado: las bases tienen que ser
    // las mismas para que el servidor pueda reusar este cálculo.
    const pedido = leerDescuentoBody(body ?? {});
    if ('error' in pedido) return json({ error: pedido.error, code: 'invalid_discount' }, 400);
    let descuento: DescuentoDef | null = null;
    if (pedido.presente) {
        try {
            descuento = await resolverDescuento(orgId, pedido.solicitud, { moneda: currency, clienteId });
        } catch (error) {
            if (error instanceof DescuentoError) return json({ error: error.message, code: error.code }, error.status);
            throw error;
        }
    }

    try {
        const usTax = await prepareUsTaxForDocument(orgId, {
            clienteId, currency, ivaIncluido: body?.iva_incluido === true,
            descuento: descuentoParaMotor(descuento), items, calculoId: body?.us_tax_calculo_id,
            documentoClave: body?.documento,
        });
        if (!usTax) return json({ aplica: false });
        const lineas = await usTaxCalculoLineas(orgId, usTax.calculoId);
        if (!lineas) return json({ aplica: false });
        const f = 10 ** currencyDecimals(currency);
        return json({
            aplica: true,
            calculo_id: usTax.calculoId,
            lineas: lineas.map((l) => ({ tasa: l.tasa, impuesto: l.impuesto / f, desglose: l.desglose })),
            impuestos: lineas.reduce((s, l) => s + l.impuesto, 0) / f,
        });
    } catch (error) {
        if (error instanceof UsTaxError) return json({ error: error.message, code: `us_tax_${error.code}` }, error.status);
        throw error;
    }
};

function json(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
}

// src/lib/cobros-settle.ts
// Liquidar un cobro de cotización cuando llega el dinero.
//
// Los tres pasos son los mismos para cualquier riel, y el orden importa:
//
//   1. marcar ESE cobro como pagado — acepta también 'cancelado', porque un
//      cobro en vuelo puede liquidarse después de que el vendedor lo canceló y
//      el dinero llegó de todos modos;
//   2. si lo pagado ya cubre el total, cancelar los pendientes que sobran;
//   3. marcar la cotización como pagada SOLO si no queda ningún pendiente. El
//      flip es atómico e idempotente: el pago que caiga al último la salda.
//
// El riel de Stripe conserva su propia copia de esta lógica dentro de su
// webhook; unificarla exige antes cubrirla con pruebas, y tocar el camino de
// dinero vivo sin ellas es peor que tener dos copias declaradas.

import { sql, withOrgTx, logAudit } from './db';
import { after } from './after';
import { dispatchQuoteEvent } from './webhooks';
import { notifyQuoteEvent } from './notify';
import { trackPaymentReceived } from './posthog-server';
import { currencyDecimals, normalizeCurrency } from './currency';
import { quoteLedgerLock } from './fiscal/quote-ledger';

export interface SettleInput {
    cotizacionId: string;
    cobroId: string;
    monto: number;
    moneda: string;
    /** Método tal como lo entiende Cord: 'tarjeta', 'spei', 'mercadopago'… */
    metodo: string;
    /** Id del pago en el proveedor; viaja a analítica como clave de idempotencia. */
    pagoId: string;
    proveedor: string;
}

export type SettleResult = 'saldada' | 'parcial' | 'sin_cobro' | 'repetida';

/**
 * Importe con su divisa. No se usa `money()` de fmt-server: esa lee la divisa
 * del request, y un webhook de proveedor no trae request del vendedor — el dato
 * correcto es la divisa del pago (regla 21).
 */
function importe(monto: number, moneda: string): string {
    const code = normalizeCurrency(moneda);
    const decimals = currencyDecimals(code);
    try {
        return new Intl.NumberFormat('es-MX', { style: 'currency', currency: code, minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(monto);
    } catch {
        return `${monto.toFixed(decimals)} ${code}`;
    }
}

export async function settleQuoteCobro(orgId: string, input: SettleInput): Promise<SettleResult> {
    const { cotizacionId: cid, cobroId, metodo } = input;

    // Los tres pasos en UNA transacción y bajo el candado de la cotización
    // (src/lib/fiscal/quote-ledger.ts). Antes eran tres transacciones: si la
    // segunda o la tercera fallaba, el reintento del proveedor veía el cobro
    // "ya pagado", lo tomaba por un reenvío y la cotización se quedaba en
    // `approved` para siempre. Ahora los pasos 2 y 3 corren también en el
    // reintento —son idempotentes— y reparan cualquier estado a medias.
    const [, [antes], marked, , flipped] = await withOrgTx(orgId,
        quoteLedgerLock(orgId, cid),
        sql`select status from cotizacion_cobros
             where id = ${cobroId} and org_id = ${orgId} and cotizacion_id = ${cid}
             for update`,
        sql`update cotizacion_cobros
               set status = 'pagado', paid_at = now(), payment_method = ${metodo}
             where id = ${cobroId} and org_id = ${orgId} and cotizacion_id = ${cid}
               and status in ('pendiente', 'cancelado')
            returning tipo, numero_cuota, monto`,
        // 2) Si lo pagado ya cubre el total, los pendientes que sobran se cancelan.
        //    Solo si ESTE cobro está pagado: un pago sin cobro que lo respalde no
        //    puede mover nada más de la cotización.
        sql`update cotizacion_cobros set status = 'cancelado'
             where org_id = ${orgId} and cotizacion_id = ${cid} and status = 'pendiente'
               and exists (select 1 from cotizacion_cobros x
                            where x.id = ${cobroId} and x.org_id = ${orgId} and x.cotizacion_id = ${cid}
                              and x.status = 'pagado')
               and (select coalesce(sum(monto), 0) from cotizacion_cobros
                     where org_id = ${orgId} and cotizacion_id = ${cid} and status = 'pagado')
                   >= (select total from cotizaciones where id = ${cid} and org_id = ${orgId}) - 0.01`,
        // 3) Flip atómico: la cotización se salda SOLO si este cobro está pagado
        //    y ya no queda ningún pendiente.
        sql`update cotizaciones
               set status = 'paid', paid_at = now(), payment_method = ${metodo}
             where id = ${cid} and org_id = ${orgId} and status in ('approved', 'invoiced')
               and exists (select 1 from cotizacion_cobros x
                            where x.id = ${cobroId} and x.org_id = ${orgId} and x.cotizacion_id = ${cid}
                              and x.status = 'pagado')
               and not exists (
                   select 1 from cotizacion_cobros
                    where org_id = ${orgId} and cotizacion_id = ${cid} and status = 'pendiente')
            returning id`,
    );

    if (!antes) {
        // Dinero sin fila que lo respalde: se deja rastro para conciliación a
        // mano, nunca un flip automático sobre algo que no cuadra.
        await withOrgTx(orgId, sql`
            insert into eventos (org_id, cotizacion_id, tipo, detalle)
            values (${orgId}, ${cid}, 'paid', ${`Pago recibido sin cobro vigente (${input.proveedor}); revisar conciliación`})`);
        await logAudit(orgId, { accion: 'cotizacion.pago_no_conciliado', entidad: 'cotizacion', entidad_id: cid, detalle: `${input.proveedor} ${input.pagoId}` });
        return 'sin_cobro';
    }

    const [[flags]] = await withOrgTx(orgId, sql`
        select (o.sandbox_of is not null) as is_sandbox, o.is_demo
          from cotizaciones c join orgs o on o.id = c.org_id
         where c.id = ${cid} and c.org_id = ${orgId}`);

    if (!marked.length && !flipped.length) return 'repetida';

    if (flipped.length) {
        await withOrgTx(orgId, sql`
            insert into eventos (org_id, cotizacion_id, tipo, detalle)
            values (${orgId}, ${cid}, 'paid', ${`Pago recibido con ${input.proveedor}; cotización saldada`})`);
        await logAudit(orgId, { accion: 'cotizacion.paid', entidad: 'cotizacion', entidad_id: cid, detalle: `Pago en línea con ${input.proveedor}` });
        await trackPaymentReceived(
            orgId, input.monto, input.moneda, metodo, false, cid,
            !!flags?.is_sandbox, !!flags?.is_demo,
            { payment_id: input.pagoId, cobro_id: cobroId, payment_kind: 'settlement' },
        );
        after(dispatchQuoteEvent(orgId, cid, 'quote.paid'));
        after(notifyQuoteEvent(orgId, cid, 'quote_paid'));
        return 'saldada';
    }

    // Reintento que solo reparó estado (el cobro ya estaba pagado): nada que
    // anunciar dos veces.
    if (!marked.length) return 'repetida';

    // Pago PARCIAL: evento informativo. Avisarle a las integraciones que "se
    // pagó todo" cuando solo cayó el anticipo sería mentirles.
    const co = marked[0];
    const label = co.tipo === 'anticipo' ? 'Anticipo'
        : co.tipo === 'saldo' ? 'Saldo'
            : co.tipo === 'cuota' ? `Cuota ${co.numero_cuota}` : 'Pago';
    await withOrgTx(orgId, sql`
        insert into eventos (org_id, cotizacion_id, tipo, detalle)
        values (${orgId}, ${cid}, 'paid', ${`${label} de ${importe(Number(co.monto), input.moneda)} pagado con ${input.proveedor} — saldo pendiente`})`);
    await logAudit(orgId, { accion: 'cotizacion.cobro_pagado', entidad: 'cotizacion', entidad_id: cid, detalle: `${label} pagado con ${input.proveedor}` });
    await trackPaymentReceived(
        orgId, input.monto, input.moneda, metodo, false, cid,
        !!flags?.is_sandbox, !!flags?.is_demo,
        { payment_id: input.pagoId, cobro_id: cobroId, payment_kind: 'partial' },
    );
    after(dispatchQuoteEvent(orgId, cid, 'payment.partial', {
        monto: Number(co.monto), tipo: co.tipo, moneda: input.moneda,
    }));
    return 'parcial';
}

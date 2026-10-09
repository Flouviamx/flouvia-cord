// src/lib/cobros-settle.ts
// Liquidar un cobro de cotización cuando llega el dinero. Es el ÚNICO camino:
// Cord Payments (webhook de Stripe) y Mercado Pago (webhook y conciliación)
// pasan por aquí.
//
// Los tres pasos son los mismos para cualquier riel, y el orden importa:
//
//   1. marcar ESE cobro como pagado — acepta también 'cancelado' (un plan de
//      cuotas que lo reemplazó, un SPEI en vuelo), salvo que la cotización ya
//      esté saldada: ahí el dinero es de más y se trata como pago duplicado;
//   2. si lo pagado ya cubre el total, cancelar los pendientes que sobran;
//   3. marcar la cotización como pagada SOLO si no queda ningún pendiente y lo
//      pagado cubre el total. El pago que caiga al último la salda.
//
// Antes el riel de Stripe tenía su propia copia de esta lógica en tres
// transacciones separadas: una falla a la mitad dejaba el cobro "pagado" y la
// cotización en `approved` para siempre, porque el reintento veía el cobro ya
// pagado y se salía. Ahora los tres pasos y la historia viajan en UNA
// transacción, y el reintento repara cualquier estado a medias.

import { sql, withOrgTx, logAudit } from './db';
import { after } from './after';
import { dispatchPaymentPartial, dispatchQuoteEvent } from './webhooks';
import { notifyQuoteEvent } from './notify';
import { trackPaymentReceived } from './posthog-server';
import { sendOpsAlert } from './ops-alert';
import { currencyDecimals, normalizeCurrency } from './currency';
import { quoteLedgerLock } from './fiscal/quote-ledger';
import { log } from './log';

/** Qué pago del proveedor llegó. Decide si un cobro ya pagado es un reenvío o un segundo cobro. */
export type OrigenPago = { stripePaymentIntentId: string } | { mpPaymentId: string };

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
    origen: OrigenPago;
}

/**
 * - `saldada`: este pago completó la cotización.
 * - `parcial`: anticipo, saldo o cuota; queda saldo pendiente.
 * - `repetida`: reenvío del mismo pago (nada nuevo, o solo se reparó estado).
 * - `duplicado`: el cobro ya lo pagó OTRO pago, o la cotización ya estaba
 *   saldada: el dinero es de más. Se avisa y el llamador lo aplica a la
 *   factura como importe por devolver; nunca se pierde ni se cuenta como ingreso.
 * - `sin_cobro`: no existe la fila que respalde el pago.
 */
export type SettleResult = 'saldada' | 'parcial' | 'sin_cobro' | 'repetida' | 'duplicado';

/**
 * Importe con su divisa. No se usa `money()` de fmt-server: esa lee la divisa
 * del request, y un webhook de proveedor no trae request del vendedor — el dato
 * correcto es la divisa del pago (regla 21).
 */
export function importe(monto: number, moneda: string): string {
    const code = normalizeCurrency(moneda);
    const decimals = currencyDecimals(code);
    try {
        return new Intl.NumberFormat('es-MX', { style: 'currency', currency: code, minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(monto);
    } catch {
        return `${monto.toFixed(decimals)} ${code}`;
    }
}

function etiquetaCobro(tipo: unknown, numeroCuota: unknown): string {
    return tipo === 'anticipo' ? 'Anticipo'
        : tipo === 'saldo' ? 'Saldo'
            : tipo === 'cuota' ? `Cuota ${numeroCuota}` : 'Pago';
}

/**
 * ¿El pago que llega es el mismo que ya pagó el cobro?
 *
 * Stripe guarda en el cobro el PaymentIntent que lo pagó; Mercado Pago, el id
 * del pago que lo reclamó. Un cobro pagado con Stripe ANTES de que existiera
 * `paid_payment_intent_id` no tiene con qué compararse: se asume el mismo pago
 * (es lo que el código hacía antes), salvo que lo haya pagado Mercado Pago.
 */
function esMismoPago(antes: Record<string, unknown>, origen: OrigenPago): boolean {
    const paidPi = antes.paid_payment_intent_id ? String(antes.paid_payment_intent_id) : null;
    const mp = antes.mp_payment_id ? String(antes.mp_payment_id) : null;
    if ('stripePaymentIntentId' in origen) {
        if (paidPi) return paidPi === origen.stripePaymentIntentId;
        return !mp && antes.payment_method !== 'mercadopago';
    }
    return !paidPi && mp === origen.mpPaymentId;
}

export async function settleQuoteCobro(orgId: string, input: SettleInput): Promise<SettleResult> {
    const { cotizacionId: cid, cobroId, metodo } = input;
    const pi = 'stripePaymentIntentId' in input.origen && input.origen.stripePaymentIntentId.startsWith('pi_')
        ? input.origen.stripePaymentIntentId
        : null;
    const mpId = 'mpPaymentId' in input.origen ? input.origen.mpPaymentId : null;

    // Tipo, cuota y monto de un cobro no cambian después de creado: se leen
    // antes para escribir la historia DENTRO de la transacción del dinero.
    const [[cobro]] = await withOrgTx(orgId, sql`
        select tipo, numero_cuota, monto from cotizacion_cobros
         where id = ${cobroId} and org_id = ${orgId} and cotizacion_id = ${cid}`);
    if (!cobro) return sinCobro(orgId, input);

    const textoSaldada = `Pago recibido con ${input.proveedor}; cotización saldada`;
    const textoParcial = `${etiquetaCobro(cobro.tipo, cobro.numero_cuota)} de ${importe(Number(cobro.monto), input.moneda)} pagado con ${input.proveedor}; saldo pendiente`;

    // Todo en UNA transacción bajo el candado de la cotización
    // (src/lib/fiscal/quote-ledger.ts). `now()` es constante dentro de una
    // transacción de Postgres: es como la historia sabe qué cambió AQUÍ y no
    // en un intento anterior.
    const [, [antes], marked, , flipped, , , [sums]] = await withOrgTx(orgId,
        quoteLedgerLock(orgId, cid),
        sql`select cc.status, cc.paid_payment_intent_id, cc.mp_payment_id, cc.payment_method,
                   c.paid_at as cotizacion_pagada_at
              from cotizacion_cobros cc
              join cotizaciones c on c.id = cc.cotizacion_id and c.org_id = cc.org_id
             where cc.id = ${cobroId} and cc.org_id = ${orgId} and cc.cotizacion_id = ${cid}
             for update of cc`,
        // 1) Marcar. Un cobro cancelado de una cotización YA saldada (por su
        //    factura, por otro riel o a mano) no se marca: ese dinero es de más.
        //    El pago que lo paga queda escrito en la MISMA sentencia (el
        //    PaymentIntent o el pago de Mercado Pago): reclamarlo aparte, fuera
        //    del candado, dejaba ganar a otro riel en medio y el cobro terminaba
        //    "pagado por Stripe" con el id de Mercado Pago escrito.
        sql`update cotizacion_cobros
               set status = 'pagado', paid_at = now(), payment_method = ${metodo},
                   paid_payment_intent_id = coalesce(paid_payment_intent_id, ${pi}),
                   mp_payment_id = coalesce(${mpId}::text, mp_payment_id),
                   pago_en_proceso_at = null, pago_en_proceso_ref = null
             where id = ${cobroId} and org_id = ${orgId} and cotizacion_id = ${cid}
               and (status = 'pendiente'
                    or (status = 'cancelado' and not exists (
                          select 1 from cotizaciones c
                           where c.id = ${cid} and c.org_id = ${orgId} and c.paid_at is not null)))
            returning id`,
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
        // 3) Flip atómico: la cotización se salda SOLO si este cobro está pagado,
        //    ya no queda ningún pendiente Y lo pagado cubre el total.
        sql`update cotizaciones
               set status = 'paid', paid_at = now(), payment_method = ${metodo}
             where id = ${cid} and org_id = ${orgId} and status in ('approved', 'invoiced')
               and paid_at is null
               and exists (select 1 from cotizacion_cobros x
                            where x.id = ${cobroId} and x.org_id = ${orgId} and x.cotizacion_id = ${cid}
                              and x.status = 'pagado')
               and not exists (
                   select 1 from cotizacion_cobros
                    where org_id = ${orgId} and cotizacion_id = ${cid} and status = 'pendiente')
               and (select coalesce(sum(monto), 0) from cotizacion_cobros
                     where org_id = ${orgId} and cotizacion_id = ${cid} and status = 'pagado') >= total - 0.01
            returning id`,
        // Historia en la MISMA transacción: si el dinero se registró, su
        // historia también. Antes se escribía después y una caída entre las dos
        // dejaba el pago sin rastro visible para el vendedor.
        sql`insert into eventos (org_id, cotizacion_id, tipo, detalle)
            select ${orgId}, ${cid}, 'paid', ${textoSaldada}
             where exists (select 1 from cotizaciones
                            where id = ${cid} and org_id = ${orgId} and status = 'paid' and paid_at = now())`,
        sql`insert into eventos (org_id, cotizacion_id, tipo, detalle)
            select ${orgId}, ${cid}, 'paid', ${textoParcial}
             where exists (select 1 from cotizacion_cobros
                            where id = ${cobroId} and org_id = ${orgId} and status = 'pagado' and paid_at = now())
               and not exists (select 1 from cotizaciones
                                where id = ${cid} and org_id = ${orgId} and paid_at = now())`,
        sql`select c.total,
                   (select coalesce(sum(monto), 0) from cotizacion_cobros
                     where org_id = ${orgId} and cotizacion_id = ${cid} and status = 'pagado') as pagado
              from cotizaciones c where c.id = ${cid} and c.org_id = ${orgId}`,
    );

    if (!antes) return sinCobro(orgId, input);

    // ¿Dinero de más? El cobro ya lo pagó otro pago, o era un cobro cancelado
    // de una cotización ya saldada. Se decide con el estado BLOQUEADO de antes.
    const duplicado = !marked.length && (
        (antes.status === 'pagado' && !esMismoPago(antes, input.origen))
        || (antes.status === 'cancelado' && antes.cotizacion_pagada_at != null)
    );

    // Los efectos fuera de la transacción NO pueden tumbar el webhook: el
    // dinero ya quedó registrado, y un reintento por una falla de analítica o
    // de correo vería "repetida" y no volvería a avisar. Los avisos que tienen
    // que salir se registran primero (after), lo demás es best-effort.
    const flags = await flagsDeAnalitica(orgId, cid);

    if (flipped.length) {
        after(dispatchQuoteEvent(orgId, cid, 'quote.paid'));
        after(notifyQuoteEvent(orgId, cid, 'quote_paid'));
        if (!duplicado) {
            after(trackPaymentReceived(
                orgId, input.monto, input.moneda, metodo, false, cid, flags.isSandbox, flags.isDemo,
                { payment_id: input.pagoId, cobro_id: cobroId, payment_kind: 'settlement' },
            ));
        }
        await auditar(orgId, { accion: 'cotizacion.paid', entidad: 'cotizacion', entidad_id: cid, detalle: `Pago en línea con ${input.proveedor}` });
    } else if (marked.length) {
        // Pago PARCIAL: evento informativo. Avisarle a las integraciones que "se
        // pagó todo" cuando solo cayó el anticipo sería mentirles. Mismo payload
        // para los dos rieles: antes Mercado Pago mandaba menos campos.
        after(dispatchPaymentPartial(orgId, cid, {
            tipo: String(cobro.tipo),
            monto: Number(cobro.monto),
            numero_cuota: Number(cobro.numero_cuota ?? 0),
            saldo_pendiente: Math.max(0, Number(sums?.total ?? 0) - Number(sums?.pagado ?? 0)),
            payment_method: metodo,
        }));
        after(trackPaymentReceived(
            orgId, input.monto, input.moneda, metodo, false, cid, flags.isSandbox, flags.isDemo,
            { payment_id: input.pagoId, cobro_id: cobroId, payment_kind: 'partial' },
        ));
        await auditar(orgId, { accion: 'cotizacion.cobro_pagado', entidad: 'cotizacion', entidad_id: cid, detalle: `${etiquetaCobro(cobro.tipo, cobro.numero_cuota)} pagado con ${input.proveedor}` });
    }

    if (duplicado) {
        await avisarPagoDuplicado(orgId, cid, {
            proveedor: input.proveedor, pagoId: input.pagoId, monto: input.monto, moneda: input.moneda,
        });
        return 'duplicado';
    }
    if (flipped.length) return 'saldada';
    if (marked.length) return 'parcial';
    return 'repetida';
}

async function sinCobro(orgId: string, input: SettleInput): Promise<SettleResult> {
    // Dinero sin fila que lo respalde: se deja rastro para conciliación a mano,
    // nunca un flip automático sobre algo que no cuadra. Una vez por pago.
    await avisarUnaVez(orgId, 'cotizacion.pago_no_conciliado', input.pagoId, async () => {
        await withOrgTx(orgId, sql`
            insert into eventos (org_id, cotizacion_id, tipo, detalle)
            values (${orgId}, ${input.cotizacionId}, 'paid',
                    ${`Pago de ${importe(input.monto, input.moneda)} recibido con ${input.proveedor} sin cobro vigente; revisar conciliación`})`);
        after(sendOpsAlert('Pago sin fila conciliable',
            `Organización ${orgId}; cotización ${input.cotizacionId}; cobro ${input.cobroId}; ${input.proveedor} ${input.pagoId}`));
    }, 'cotizacion');
    return 'sin_cobro';
}

async function flagsDeAnalitica(orgId: string, cid: string): Promise<{ isSandbox: boolean; isDemo: boolean }> {
    try {
        const [[f]] = await withOrgTx(orgId, sql`
            select (o.sandbox_of is not null) as is_sandbox, o.is_demo
              from cotizaciones c join orgs o on o.id = c.org_id
             where c.id = ${cid} and c.org_id = ${orgId}`);
        return { isSandbox: !!f?.is_sandbox, isDemo: !!f?.is_demo };
    } catch {
        return { isSandbox: false, isDemo: false };
    }
}

async function auditar(orgId: string, entry: Parameters<typeof logAudit>[1]): Promise<void> {
    try {
        await logAudit(orgId, entry);
    } catch (err) {
        log.error('no se pudo auditar el pago', { route: 'cobros-settle', orgId, err });
    }
}

// ── Avisos compartidos por los dos rieles ────────────────────────────────────

/**
 * Corre `efecto` solo la primera vez para esta clave. El proveedor manda varios
 * avisos del mismo pago (creado, actualizado) y la conciliación diaria lo vuelve
 * a ver: sin esto, cada uno repetía la historia y la alerta.
 *
 * Primero el efecto, después la marca: si el efecto falla, el error sube, el
 * proveedor reintenta y el aviso no se pierde.
 */
export async function avisarUnaVez(
    orgId: string,
    accion: string,
    clave: string,
    efecto: () => Promise<void>,
    entidad = 'pago',
): Promise<void> {
    const [ya] = await withOrgTx(orgId, sql`
        select 1 from audit_log where org_id = ${orgId} and accion = ${accion} and entidad_id = ${clave} limit 1`);
    if (ya.length) return;
    await efecto();
    await logAudit(orgId, { accion, entidad, entidad_id: clave, detalle: clave });
}

/**
 * Un cobro recibió dinero de más: un segundo pago del mismo cobro, o un pago a
 * un cobro cancelado cuando la cotización ya estaba saldada. Queda a la vista
 * del vendedor y de operaciones; el llamador lo aplica a la factura viva, donde
 * aparece como importe por devolver.
 */
export async function avisarPagoDuplicado(
    orgId: string,
    cotizacionId: string,
    pago: { proveedor: string; pagoId: string; monto: number; moneda: string },
): Promise<void> {
    await avisarUnaVez(orgId, 'cotizacion.pago_duplicado', pago.pagoId, async () => {
        await withOrgTx(orgId, sql`
            insert into eventos (org_id, cotizacion_id, tipo, detalle)
            values (${orgId}, ${cotizacionId}, 'paid',
                    ${`Se recibió un pago de ${importe(pago.monto, pago.moneda)} con ${pago.proveedor} para un cobro que ya estaba pagado o cancelado. Si es el mismo dinero que registraste a mano, no hay nada que hacer; si no, hay que devolverlo.`})`);
        after(sendOpsAlert(`Pago duplicado en ${pago.proveedor}`,
            `Organización ${orgId}; cotización ${cotizacionId}; pago ${pago.pagoId}; ${pago.monto} ${pago.moneda}`));
    }, 'cotizacion');
}

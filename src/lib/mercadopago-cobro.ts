// src/lib/mercadopago-cobro.ts
// Qué hace Cord con un pago de Mercado Pago que YA leyó del proveedor.
//
// Lo comparten el webhook (camino rápido) y la conciliación diaria (red de
// seguridad), así que tiene que ser idempotente de punta a punta: el mismo pago
// puede llegar diez veces por cualquiera de los dos caminos y el dinero se
// registra una.
//
// Contratos (auditoría de oct 2026):
//
//   - **Nunca se confía en el cuerpo del aviso.** Importe, divisa, estado y
//     dueño salen del pago leído con la credencial de la organización, y el
//     pago tiene que ser de SU cuenta (`collector_id`).
//   - **El importe y la divisa tienen que cuadrar con el cobro.** Un pago que
//     no cuadra es dinero real que no se aplica a ciegas: se registra, se avisa
//     y se concilia a mano.
//   - **Un pago de prueba no salda un documento real** en producción.
//   - **Un error permanente se avisa UNA vez y se da por atendido**; uno
//     temporal (base de datos, proveedor) se propaga para que el proveedor
//     reintente. Confundirlos era perder pagos o mandar alertas en bucle.
//   - **El pago de una cotización también baja el saldo de su factura**, igual
//     que en Cord Payments (src/lib/fiscal/quote-ledger.ts).

import { sql, withOrgTx, logAudit } from './db';
import { after } from './after';
import { isSupportedCurrency, normalizeCurrency, toMinorUnits } from './currency';
import { MP_INVOICE_REF, type MpPayment } from './mercadopago';
import { settleQuoteCobro } from './cobros-settle';
import { applyPayment } from './fiscal/payments';
import { recordMpInvoiceRefund } from './fiscal/reconciliation';
import { sendOpsAlert } from './ops-alert';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface MpProcessResult {
    /** false = el pago no es de esta organización: el llamador prueba la siguiente. */
    propio: boolean;
    estado: string;
}

/** ¿Pago de prueba en producción? Ahí no salda nada real. */
export function pagoDePruebaEnProduccion(p: MpPayment): boolean {
    if (p.liveMode !== false) return false;
    const env = import.meta.env.VERCEL_ENV || process.env.VERCEL_ENV;
    return env === 'production';
}

/**
 * Aplica un pago leído del proveedor. `mpUserId` es la cuenta de Mercado Pago
 * conectada a la organización: un pago cobrado por otra cuenta no es suyo.
 */
export async function processMpPayment(orgId: string, mpUserId: string | null, pago: MpPayment): Promise<MpProcessResult> {
    if (mpUserId && pago.collectorId && pago.collectorId !== mpUserId) return { propio: false, estado: 'otra_cuenta' };
    if (!pago.referencia) return { propio: false, estado: 'sin_referencia' };
    // Sin una divisa reconocible no hay forma honesta de registrar el importe
    // (regla 21). No se reintenta: se avisa para revisarlo a mano.
    if (!isSupportedCurrency(pago.moneda)) {
        await avisarUnaVez(orgId, 'mercadopago.divisa_invalida', pago.id, async () => {
            after(sendOpsAlert('Pago de Mercado Pago sin divisa reconocible',
                `Organización ${orgId}; pago ${pago.id}; referencia ${pago.referencia}; divisa "${pago.moneda}"`));
        });
        return { propio: true, estado: 'divisa_invalida' };
    }
    if (pago.referencia.startsWith(MP_INVOICE_REF)) return procesarFactura(orgId, pago);
    if (!UUID.test(pago.referencia)) return { propio: false, estado: 'referencia_ajena' };
    return procesarCobro(orgId, pago);
}

// ── Cotización ───────────────────────────────────────────────────────────────

async function procesarCobro(orgId: string, pago: MpPayment): Promise<MpProcessResult> {
    const [[cobro]] = await withOrgTx(orgId, sql`
        select cc.id, cc.cotizacion_id, cc.monto, cc.status, cc.mp_payment_id,
               c.base_currency, o.moneda
          from cotizacion_cobros cc
          join cotizaciones c on c.id = cc.cotizacion_id and c.org_id = cc.org_id
          join orgs o on o.id = cc.org_id
         where cc.id = ${pago.referencia} and cc.org_id = ${orgId}`);
    // La referencia no es un cobro de ESTA organización: puede ser de otra que
    // comparte la cuenta de Mercado Pago. No se toca nada.
    if (!cobro) return { propio: false, estado: 'ajeno' };
    const cotizacionId = String(cobro.cotizacion_id);

    // Un reembolso llega como una notificación más del mismo pago. Se registra
    // antes de mirar el estado: un pago devuelto por completo deja de estar
    // `approved` y saldría sin que nadie lo anotara.
    await registrarReembolsosDeCobro(orgId, pago, String(cobro.id), cotizacionId);
    if (pago.status !== 'approved') {
        await avisarReversa(orgId, pago, { cotizacionId });
        return { propio: true, estado: pago.status };
    }
    if (pagoDePruebaEnProduccion(pago)) {
        await avisarUnaVez(orgId, 'mercadopago.pago_de_prueba', pago.id, async () => {
            await withOrgTx(orgId, sql`
                insert into eventos (org_id, cotizacion_id, tipo, detalle)
                values (${orgId}, ${cotizacionId}, 'paid', ${`Mercado Pago avisó un pago de PRUEBA (${pago.id}); no se marcó como pagado`})`);
        });
        return { propio: true, estado: 'prueba' };
    }

    // Importe y divisa del pago contra los del cobro, en unidades mínimas.
    const divisa = normalizeCurrency(String(cobro.base_currency || cobro.moneda || ''), pago.moneda);
    const cuadra = pago.moneda === divisa && toMinorUnits(pago.monto, divisa) === toMinorUnits(Number(cobro.monto), divisa);
    if (!cuadra) {
        await avisarUnaVez(orgId, 'mercadopago.pago_no_coincide', pago.id, async () => {
            await withOrgTx(orgId, sql`
                insert into eventos (org_id, cotizacion_id, tipo, detalle)
                values (${orgId}, ${cotizacionId}, 'paid',
                        ${`Se recibió un pago de Mercado Pago por ${pago.monto} ${pago.moneda} que no coincide con el cobro (${cobro.monto} ${divisa}); revisa la conciliación`})`);
            after(sendOpsAlert('Pago de Mercado Pago que no coincide con su cobro',
                `Organización ${orgId}; cotización ${cotizacionId}; pago ${pago.id}; ${pago.monto} ${pago.moneda} contra ${cobro.monto} ${divisa}`));
        });
        return { propio: true, estado: 'no_coincide' };
    }

    // El índice único hace el trabajo: el cobro se reclama UNA vez por un pago.
    // Solo se reclama un cobro todavía cobrable: si otro riel ya lo pagó, este
    // pago es un segundo cobro, no el primero.
    const [reclamado] = await withOrgTx(orgId, sql`
        update cotizacion_cobros set mp_payment_id = ${pago.id}
         where id = ${cobro.id} and org_id = ${orgId} and mp_payment_id is null
           and status in ('pendiente', 'cancelado')
        returning id`);
    if (!reclamado.length) {
        const [[actual]] = await withOrgTx(orgId, sql`
            select mp_payment_id from cotizacion_cobros where id = ${cobro.id} and org_id = ${orgId}`);
        if (String(actual?.mp_payment_id ?? '') !== pago.id) {
            // Dinero que llegó dos veces. No se pierde: se aplica a la factura
            // (donde queda como importe por devolver) y se avisa.
            await avisarUnaVez(orgId, 'cotizacion.pago_duplicado', pago.id, () => avisarDobleCobro(orgId, cotizacionId, pago));
            await aplicarAFactura(orgId, cotizacionId, pago, null);
            return { propio: true, estado: 'duplicado' };
        }
        // Mismo pago: un reintento. Si el intento anterior se cortó antes de
        // liquidar, se liquida ahora (settleQuoteCobro es idempotente).
    }

    const resultado = await settleQuoteCobro(orgId, {
        cotizacionId,
        cobroId: String(cobro.id),
        monto: pago.monto,
        moneda: pago.moneda,
        metodo: 'mercadopago',
        pagoId: pago.id,
        proveedor: 'Mercado Pago',
    });
    await aplicarAFactura(orgId, cotizacionId, pago, String(cobro.id));
    return { propio: true, estado: resultado };
}

/**
 * El pago de una cotización también baja el saldo de su factura viva, como en
 * Cord Payments. Si no hay factura, no pasa nada: la factura que se emita
 * después lo hereda.
 */
async function aplicarAFactura(orgId: string, cotizacionId: string, pago: MpPayment, cobroId: string | null): Promise<void> {
    const [rows] = await withOrgTx(orgId, sql`
        select id from documentos_fiscales
         where org_id = ${orgId} and cotizacion_id = ${cotizacionId}
           and status = 'issued' and lifecycle in ('open', 'paid', 'uncollectible')
           and credit_note_of is null and document_type not in ('credit_note', 'cfdi_egreso')
         order by created_at desc limit 1`);
    if (!rows.length) return;
    const documentoId = String(rows[0].id);
    const r = await applyPayment(orgId, documentoId, {
        monto: pago.monto, currency: pago.moneda, metodo: 'mercadopago',
        mpPaymentId: pago.id, referencia: pago.id, cobroId,
    });
    if (!r.ok) {
        await avisarUnaVez(orgId, 'mercadopago.factura_no_aplicada', `${pago.id}:${documentoId}`, async () => {
            after(sendOpsAlert('Pago de Mercado Pago sin aplicar a la factura de su cotización',
                `Organización ${orgId}; documento ${documentoId}; pago ${pago.id}; ${r.error}`));
        });
        return;
    }
    if (r.justPaid) after(import('./webhooks').then((w) => w.dispatchInvoiceEvent(orgId, documentoId, 'invoice.paid')));
}

/**
 * Reembolsos de un cobro de COTIZACIÓN. Mismo ledger que Cord Payments
 * (`cobro_reembolsos`): el saldo devuelto se recalcula desde las filas, nunca
 * se incrementa. Y también el de la factura (`documento_reembolsos`), por si
 * este pago se aplicó a una: sin eso, la factura seguía "pagada" con el dinero
 * ya devuelto.
 */
async function registrarReembolsosDeCobro(orgId: string, pago: MpPayment, cobroId: string, cotizacionId: string): Promise<void> {
    if (!pago.reembolsos.length) return;
    const [previos] = await withOrgTx(orgId, sql`
        select mp_refund_id, status from cobro_reembolsos
         where org_id = ${orgId} and cobro_id = ${cobroId} and mp_refund_id is not null`);
    const antes = new Map(previos.map((r: any) => [String(r.mp_refund_id), String(r.status)]));

    // Solo si este pago es el del cobro: un pago duplicado no reembolsa el cobro.
    const [[esDelCobro]] = await withOrgTx(orgId, sql`
        select 1 as ok from cotizacion_cobros where id = ${cobroId} and org_id = ${orgId} and mp_payment_id = ${pago.id}`);
    for (const r of pago.reembolsos) {
        if (esDelCobro) {
            await withOrgTx(orgId,
                sql`insert into cobro_reembolsos
                      (org_id, cobro_id, mp_refund_id, amount_cents, currency, status, updated_at)
                    values (${orgId}, ${cobroId}, ${r.id}, ${toMinorUnits(r.monto, pago.moneda)},
                            ${pago.moneda}, ${r.status}, now())
                    on conflict (mp_refund_id) where mp_refund_id is not null
                    do update set status = excluded.status, updated_at = now()`,
                sql`update cotizacion_cobros c set
                      reembolsado_cents = coalesce((select sum(x.amount_cents) from cobro_reembolsos x
                                                    where x.cobro_id = c.id and x.status in ('succeeded', 'pending')), 0),
                      reembolso_status = ${r.status},
                      refunded_at = case when ${r.status} = 'succeeded' then coalesce(c.refunded_at, now()) else c.refunded_at end
                    where c.id = ${cobroId} and c.org_id = ${orgId}`);
        }
        await recordMpInvoiceRefund(orgId, {
            id: r.id, paymentId: pago.id, amount: r.monto, currency: pago.moneda, status: r.status,
        });
        if (antes.get(r.id) !== r.status) {
            await logAudit(orgId, {
                accion: 'cord_pagos.reembolso_actualizado', entidad: 'refund', entidad_id: r.id,
                detalle: `Mercado Pago ${r.monto} ${pago.moneda}; ${r.status}`,
            });
        }
        // El vendedor lo ve en la cotización UNA vez, cuando el reembolso se hace efectivo.
        if (r.status === 'succeeded' && antes.get(r.id) !== 'succeeded') {
            await withOrgTx(orgId, sql`
                insert into eventos (org_id, cotizacion_id, tipo, detalle)
                values (${orgId}, ${cotizacionId}, 'paid', ${`Reembolso de ${r.monto} ${pago.moneda} hecho en Mercado Pago`})`);
        }
    }
}

// ── Factura ──────────────────────────────────────────────────────────────────

/**
 * Pago de una FACTURA desde su hosted invoice page. El ledger del documento es
 * otro que el de la cotización, y `applyPayment` es idempotente por el id del
 * pago de Mercado Pago (índice único), así que un reenvío no abona dos veces.
 */
async function procesarFactura(orgId: string, pago: MpPayment): Promise<MpProcessResult> {
    const documentoId = pago.referencia!.slice(MP_INVOICE_REF.length);
    if (!UUID.test(documentoId)) return { propio: false, estado: 'referencia_ajena' };
    const [dueno] = await withOrgTx(orgId, sql`
        select id from documentos_fiscales where id = ${documentoId} and org_id = ${orgId}`);
    if (!dueno.length) return { propio: false, estado: 'ajeno' };

    for (const r of pago.reembolsos) {
        await recordMpInvoiceRefund(orgId, {
            id: r.id, paymentId: pago.id, amount: r.monto, currency: pago.moneda, status: r.status,
        });
    }
    if (pago.status !== 'approved') {
        await avisarReversa(orgId, pago, { documentoId });
        return { propio: true, estado: pago.status };
    }
    if (pagoDePruebaEnProduccion(pago)) {
        await avisarUnaVez(orgId, 'mercadopago.pago_de_prueba', pago.id, async () => {
            const { logInvoiceEvent } = await import('./fiscal/timeline');
            await logInvoiceEvent(orgId, documentoId, 'payment', `Mercado Pago avisó un pago de PRUEBA (${pago.id}); no se aplicó`);
        });
        return { propio: true, estado: 'prueba' };
    }

    const resultado = await applyPayment(orgId, documentoId, {
        monto: pago.monto,
        currency: pago.moneda,
        metodo: 'mercadopago',
        mpPaymentId: pago.id,
        referencia: pago.id,
    });
    if (!resultado.ok) {
        // Factura anulada, nota de crédito o divisa distinta: reintentar no lo
        // arregla. Antes esto lanzaba, el proveedor reintentaba durante días y
        // Ops recibía una alerta por intento. Ahora queda en la historia de la
        // factura y se avisa UNA vez: el dinero está en la cuenta del negocio y
        // hay que devolverlo o aplicarlo a mano.
        await avisarUnaVez(orgId, 'mercadopago.factura_no_aplicada', `${pago.id}:${documentoId}`, async () => {
            const { logInvoiceEvent } = await import('./fiscal/timeline');
            await logInvoiceEvent(orgId, documentoId, 'payment',
                `Se recibió un pago de Mercado Pago (${pago.monto} ${pago.moneda}) que no se pudo aplicar: ${resultado.error}`);
            after(sendOpsAlert('Pago de Mercado Pago sin aplicar a factura',
                `Organización ${orgId}; documento ${documentoId}; pago ${pago.id}; ${resultado.error}`));
        });
        return { propio: true, estado: 'no_aplicado' };
    }
    if (resultado.justPaid) after(import('./webhooks').then((w) => w.dispatchInvoiceEvent(orgId, documentoId, 'invoice.paid')));
    if (!resultado.duplicate) {
        after((async () => {
            const [[flags]] = await withOrgTx(orgId, sql`
                select (sandbox_of is not null) as is_sandbox, is_demo from orgs where id = ${orgId}`);
            const { trackPaymentReceived } = await import('./posthog-server');
            await trackPaymentReceived(
                orgId, pago.monto, pago.moneda, 'mercadopago', false, undefined,
                !!flags?.is_sandbox, !!flags?.is_demo,
                { payment_id: pago.id, invoice_id: documentoId, payment_kind: 'invoice' },
            );
        })());
    }
    return { propio: true, estado: resultado.lifecycle ?? 'aplicado' };
}

// ── Avisos ───────────────────────────────────────────────────────────────────

/**
 * Corre `efecto` solo la primera vez para esta clave. El proveedor manda varios
 * avisos del mismo pago (creado, actualizado) y la conciliación diaria lo vuelve
 * a ver: sin esto, cada uno repetía la historia y la alerta.
 */
async function avisarUnaVez(orgId: string, accion: string, clave: string, efecto: () => Promise<void>): Promise<void> {
    const [ya] = await withOrgTx(orgId, sql`
        select 1 from audit_log where org_id = ${orgId} and accion = ${accion} and entidad_id = ${clave} limit 1`);
    if (ya.length) return;
    // Primero el efecto, después la marca: si el efecto falla, el error sube,
    // el proveedor reintenta y el aviso no se pierde.
    await efecto();
    await logAudit(orgId, { accion, entidad: 'mercadopago', entidad_id: clave, detalle: `Mercado Pago ${clave}` });
}

/** Un cobro recibió dinero por segunda vez: queda a la vista del vendedor y de operaciones. */
async function avisarDobleCobro(orgId: string, cotizacionId: string, pago: MpPayment): Promise<void> {
    await withOrgTx(orgId, sql`
        insert into eventos (org_id, cotizacion_id, tipo, detalle)
        values (${orgId}, ${cotizacionId}, 'paid',
                ${`Se recibió un segundo pago de ${pago.monto} ${pago.moneda} por Mercado Pago para un cobro ya pagado; revisa si hay que reembolsarlo`})`);
    after(sendOpsAlert('Pago duplicado en Mercado Pago', `Organización ${orgId}; cotización ${cotizacionId}; pago ${pago.id}; ${pago.monto} ${pago.moneda}`));
}

/**
 * Contracargo o mediación: el dinero ya no es seguro. Mientras no exista el
 * flujo completo de disputas de Mercado Pago, al menos se VE: historia del
 * documento y alerta a Ops, una vez por estado.
 */
async function avisarReversa(orgId: string, pago: MpPayment, doc: { cotizacionId?: string; documentoId?: string }): Promise<void> {
    if (!['charged_back', 'in_mediation'].includes(pago.status)) return;
    const texto = pago.status === 'charged_back'
        ? `Mercado Pago revirtió el pago ${pago.id} por un contracargo (${pago.monto} ${pago.moneda})`
        : `El pago ${pago.id} de Mercado Pago entró en mediación (${pago.monto} ${pago.moneda})`;
    await avisarUnaVez(orgId, `mercadopago.${pago.status}`, pago.id, async () => {
        if (doc.cotizacionId) {
            await withOrgTx(orgId, sql`
                insert into eventos (org_id, cotizacion_id, tipo, detalle)
                values (${orgId}, ${doc.cotizacionId}, 'paid', ${texto})`);
        } else if (doc.documentoId) {
            const { logInvoiceEvent } = await import('./fiscal/timeline');
            await logInvoiceEvent(orgId, doc.documentoId, 'payment', texto);
        }
        after(sendOpsAlert(pago.status === 'charged_back' ? 'Contracargo en Mercado Pago' : 'Mediación en Mercado Pago',
            `Organización ${orgId}; pago ${pago.id}; ${pago.monto} ${pago.moneda}`));
    });
}

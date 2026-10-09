// Cobro automático: cada factura vencida de un cliente con el cobro
// automático activo se carga a su método guardado. Lo corre el cron diario
// (/api/cron/cobro-automatico); el barrido entre organizaciones va por el
// carril de sistema y el trabajo de cada cliente vuelve a withOrgTx.
//
// Qué se cobra, con todo lo que tiene que ser cierto a la vez:
//   - la factura está emitida, abierta, con saldo, sin débito en proceso, sin
//     cancelación en trámite y no es de prueba;
//   - venció (o, sin vencimiento, se emitió) HOY o antes, y al menos un día
//     después de emitida: el cliente la recibe antes de que se le cargue;
//   - vence a partir del día en que el cliente autorizó el cobro automático:
//     lo que ya debía antes no se le carga por sorpresa (lo paga desde el
//     portal);
//   - el método cubre la divisa (SEPA solo EUR, ACH solo USD) y el negocio
//     sigue aceptando ese método;
//   - el ciclo de reintentos no está detenido ni esperando su fecha.
// Todas las facturas de la misma divisa van en UN cargo: un solo débito en el
// estado de cuenta del cliente y una sola comisión fija.

import { sql, withOrgTx } from '../db';
import { stripe } from '../billing';
import { log } from '../log';
import { normalizeCurrency } from '../currency';
import {
    cancelarPagoAgrupado, crearIntentAgrupado, crearPagoAgrupado, fallarPagoAgrupado, leerPagoAgrupado,
    marcarPagoEnProceso, metodosDelCobro, type OrgParaCobro, type PagoAgrupado, type PagoAgrupadoRow,
} from './agrupados';
import { avisarFalloCobro } from './avisos';
import { cobroCancelado, cobroConfirmado, cobroEnProceso, cobroFallido } from './webhook';
import { esDomiciliacion, DOMICILIACION, type MetodoCobro } from './metodos';

export type ResultadoCliente =
    | 'cobrado' | 'en_proceso' | 'rechazado' | 'sin_facturas' | 'esperando' | 'detenido'
    | 'no_cubre' | 'en_vuelo' | 'error';

const HORA = 3_600_000;

/** Decide si el método guardado cubre una divisa. */
export function metodoCubre(tipo: string, currency: string): boolean {
    if (tipo === 'card') return true;
    return esDomiciliacion(tipo) && DOMICILIACION[tipo].divisa === normalizeCurrency(currency);
}

/**
 * Cobra las facturas vencidas de UN cliente en UNA divisa. Nunca lanza: el
 * resultado lo cuenta el cron y el detalle va al log.
 */
export async function cobrarCliente(orgId: string, clienteId: string, currency: string, ahora = new Date()): Promise<ResultadoCliente> {
    try {
        const [[c], [estado], abiertos] = await withOrgTx(orgId,
            sql`select c.autopay_activo, c.autopay_payment_method_id, c.autopay_metodo, c.autopay_consentimiento,
                       c.stripe_customer_id, c.stripe_customer_account, c.empresa,
                       o.nombre, o.stripe_account_id, o.stripe_charges_enabled, o.acepta_tarjeta, o.acepta_domiciliacion,
                       o.stripe_capacidades, o.fee_enabled, o.fee_terms_version, o.cobro_automatico_permitido,
                       o.sandbox_of, o.is_demo
                  from clientes c join orgs o on o.id = c.org_id
                 where c.id = ${clienteId} and c.org_id = ${orgId}`,
            sql`select siguiente_at, detenido_motivo from cobro_automatico_estado
                 where org_id = ${orgId} and cliente_id = ${clienteId} and currency = ${currency}`,
            sql`select id, origen, created_at from pagos_agrupados
                 where org_id = ${orgId} and cliente_id = ${clienteId} and currency = ${currency}
                   and estado in ('creado', 'procesando')`);
        if (!c?.autopay_activo || !c.autopay_payment_method_id || c.cobro_automatico_permitido === false) return 'detenido';
        if (c.sandbox_of || c.is_demo || !c.stripe_account_id || !c.stripe_charges_enabled) return 'detenido';
        if (estado?.detenido_motivo) return 'detenido';
        if (estado?.siguiente_at && new Date(estado.siguiente_at).getTime() > ahora.getTime()) return 'esperando';
        const account = String(c.stripe_account_id);
        if (!c.stripe_customer_id || c.stripe_customer_account !== account) return 'detenido';

        const tipo = String((c.autopay_metodo as any)?.tipo || '') as MetodoCobro;
        const org: OrgParaCobro = {
            nombre: String(c.nombre || ''), stripeAccountId: account,
            aceptaTarjeta: !!c.acepta_tarjeta, aceptaDomiciliacion: !!c.acepta_domiciliacion,
            capacidades: c.stripe_capacidades, feeEnabled: c.fee_enabled, feeTermsVersion: c.fee_terms_version,
        };
        if (!metodoCubre(tipo, currency) || !metodosDelCobro(org, currency).includes(tipo)) return 'no_cubre';

        // Un cobro vivo de este cliente y divisa: el del portal que nadie
        // confirmó en una hora se cancela; uno más reciente o en proceso espera.
        for (const row of abiertos) {
            const viejo = ahora.getTime() - new Date(row.created_at).getTime() > HORA;
            if (row.origen === 'automatico' || !viejo) return 'en_vuelo';
            const pago = await leerPagoAgrupado(orgId, String(row.id));
            if (pago && await cancelarPagoAgrupado(orgId, pago, account) === 'en_vuelo') return 'en_vuelo';
        }

        const desde = String((c.autopay_consentimiento as any)?.aceptado_at || '').slice(0, 10);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(desde)) return 'detenido';
        const hoy = ahora.toISOString().slice(0, 10);
        const [facturas] = await withOrgTx(orgId, sql`
            select d.id, d.stripe_payment_intent_id,
                   exists (select 1 from documento_pagos p where p.documento_id = d.id and p.org_id = d.org_id
                            and p.stripe_payment_intent_id = d.stripe_payment_intent_id) as intento_aplicado
              from documentos_fiscales d
             where d.org_id = ${orgId} and d.cliente_id = ${clienteId} and d.currency = ${currency}
               and d.status = 'issued' and d.lifecycle = 'open' and d.amount_remaining > 0
               and d.credit_note_of is null and d.document_type not in ('credit_note', 'cfdi_egreso')
               and d.pago_en_proceso_pi is null
               and coalesce(d.provider_data->>'simulado', '') <> 'true'
               and coalesce(d.provider_data->>'livemode', '') <> 'false'
               and coalesce(d.provider_data->'cancelacion'->>'status', '') not in ('pending', 'verifying')
               -- México: ni un CFDI sustituido o en sustitución ni una factura global.
               and d.sustituida_por is null and d.informacion_global is null
               and not exists (select 1 from documentos_fiscales r
                                where r.sustituye_a = d.id and r.org_id = d.org_id and r.lifecycle <> 'void')
               and coalesce(d.due_date, d.issued_at::date) <= ${hoy}::date
               and coalesce(d.due_date, d.issued_at::date) >= ${desde}::date
               and coalesce(d.issued_at, d.created_at)::date < ${hoy}::date
               and not exists (select 1 from pago_agrupado_documentos a
                                join pagos_agrupados p on p.id = a.pago_id and p.org_id = a.org_id
                               where a.org_id = d.org_id and a.documento_id = d.id and p.estado in ('creado', 'procesando'))
             order by coalesce(d.due_date, d.issued_at::date), d.id
             limit 50`);
        if (!facturas.length) return 'sin_facturas';

        // Una factura con un pago propio en vuelo desde /i: si el cliente lo
        // dejó a medias hace más de una hora se cancela; si está en curso, esa
        // factura no entra en este cargo.
        const ids: string[] = [];
        for (const f of facturas) {
            if (!f.stripe_payment_intent_id || f.intento_aplicado) { ids.push(String(f.id)); continue; }
            const intent = await stripe(`/v1/payment_intents/${encodeURIComponent(String(f.stripe_payment_intent_id))}`, undefined, 'GET', { stripeAccount: account })
                .catch(() => null);
            const status = String(intent?.status || '');
            if (status === 'canceled') { ids.push(String(f.id)); continue; }
            const abandonado = ['requires_payment_method', 'requires_confirmation'].includes(status)
                && ahora.getTime() - Number(intent.created) * 1000 > HORA;
            if (!abandonado) continue;
            const cancelado = await stripe(`/v1/payment_intents/${encodeURIComponent(String(intent.id))}/cancel`, undefined, 'POST', {
                stripeAccount: account, idempotencyKey: `cord-autopay-cancel-${f.id}-${intent.id}`,
            }).catch(() => null);
            if (cancelado?.status === 'canceled') ids.push(String(f.id));
        }
        if (!ids.length) return 'en_vuelo';

        const creado = await crearPagoAgrupado(orgId, { clienteId, origen: 'automatico', currency, documentos: ids });
        if (!creado.ok) return 'en_vuelo';
        return await cargar(orgId, clienteId, creado.pago, org, {
            customerId: String(c.stripe_customer_id), paymentMethodId: String(c.autopay_payment_method_id), tipo,
        });
    } catch (err) {
        log.error('cobro automático: no se pudo procesar al cliente', { route: 'cron/cobro-automatico', orgId, clienteId, err });
        return 'error';
    }
}

async function cargar(orgId: string, clienteId: string, pago: PagoAgrupado, org: OrgParaCobro, m: {
    customerId: string; paymentMethodId: string; tipo: MetodoCobro;
}): Promise<ResultadoCliente> {
    try {
        const intent = await crearIntentAgrupado(orgId, pago, org, {
            customerId: m.customerId, clienteId, metodos: [m.tipo],
            descripcion: `${pago.asignaciones.length === 1 ? 'Factura' : `${pago.asignaciones.length} facturas`} — ${org.nombre}`,
            offSession: { paymentMethodId: m.paymentMethodId, tipo: m.tipo },
        });
        // El asiento lo hace el webhook (con la comisión y los eventos); aquí
        // solo se adelanta la marca de "en proceso" de un débito.
        if (intent.status === 'processing') { await marcarPagoEnProceso(orgId, intent); return 'en_proceso'; }
        if (intent.status === 'succeeded') return 'cobrado';
        // Cualquier otro estado tras confirmar sin el cliente presente es un
        // rechazo (p. ej. el banco pide autenticación).
        const r = await fallarPagoAgrupado(orgId, pago.id, {
            codigo: String(intent.last_payment_error?.code || (intent.status === 'requires_action' ? 'authentication_required' : 'payment_failed')),
            declineCode: intent.last_payment_error?.decline_code ?? null, tipoMetodo: m.tipo,
        });
        if (r?.decision) await avisarFalloCobro(orgId, r.pago, r.decision);
        return 'rechazado';
    } catch (error: any) {
        // El proveedor rechazó el cargo: el error trae el intento y el motivo.
        if (error?.paymentIntent?.id || error?.declineCode || error?.code === 'card_declined' || error?.code === 'authentication_required') {
            const r = await fallarPagoAgrupado(orgId, pago.id, {
                codigo: error.code ?? null, declineCode: error.declineCode ?? null, tipoMetodo: m.tipo,
            });
            if (r?.decision) await avisarFalloCobro(orgId, r.pago, r.decision);
            return 'rechazado';
        }
        // Sin respuesta clara (red, caída del proveedor): el cobro queda
        // `creado` y la siguiente corrida lo reintenta con la MISMA clave de
        // idempotencia — si el cargo sí salió, el proveedor devuelve ese mismo.
        log.error('cobro automático: respuesta incierta del proveedor', { route: 'cron/cobro-automatico', orgId, pago: pago.id, err: error });
        return 'error';
    }
}

/**
 * Concilia los cobros automáticos que quedaron sin cerrar: el webhook no llegó,
 * o la corrida anterior no tuvo respuesta del proveedor. Mismos manejadores que
 * el webhook, leyendo el estado vigente del intento.
 */
export async function conciliarPendiente(orgId: string, pagoId: string, ahora = new Date()): Promise<void> {
    const pago = await leerPagoAgrupado(orgId, pagoId);
    if (!pago || !['creado', 'procesando'].includes(pago.estado)) return;
    const [[o]] = await withOrgTx(orgId, sql`select stripe_account_id from orgs where id = ${orgId}`);
    const account = o?.stripe_account_id ? String(o.stripe_account_id) : '';
    if (!account) return;
    if (!pago.pi) {
        await reintentarSinIntento(orgId, pago, account, ahora);
        return;
    }
    const intent = await stripe(`/v1/payment_intents/${encodeURIComponent(pago.pi)}`, undefined, 'GET', { stripeAccount: account });
    switch (String(intent?.status || '')) {
        case 'succeeded': await cobroConfirmado(intent, account); break;
        case 'processing': await cobroEnProceso(intent, account); break;
        case 'canceled': await cobroCancelado(intent, account); break;
        case 'requires_payment_method': await cobroFallido(intent, account); break;
        default: break;
    }
}

/**
 * Un cobro automático `creado` sin intento: la corrida anterior no supo si el
 * proveedor lo creó. Antes de 20 horas se reintenta con la misma clave (el
 * proveedor la recuerda 24): si el cargo existía, vuelve ese mismo. Después se
 * cancela: si el cargo hubiera salido, su webhook ya lo habría ligado.
 */
async function reintentarSinIntento(orgId: string, pago: PagoAgrupadoRow, account: string, ahora: Date): Promise<void> {
    if (pago.origen !== 'automatico' || !pago.clienteId) return;
    if (ahora.getTime() - pago.createdAt.getTime() > 20 * HORA) {
        await withOrgTx(orgId, sql`
            update pagos_agrupados set estado = 'cancelado', error_codigo = 'sin_respuesta', updated_at = now()
             where id = ${pago.id} and org_id = ${orgId} and estado = 'creado' and stripe_payment_intent_id is null`);
        return;
    }
    const [[c]] = await withOrgTx(orgId, sql`
        select c.autopay_activo, c.autopay_payment_method_id, c.autopay_metodo, c.stripe_customer_id,
               o.nombre, o.acepta_tarjeta, o.acepta_domiciliacion, o.stripe_capacidades, o.fee_enabled, o.fee_terms_version
          from clientes c join orgs o on o.id = c.org_id
         where c.id = ${pago.clienteId} and c.org_id = ${orgId}`);
    const tipo = String((c?.autopay_metodo as any)?.tipo || '') as MetodoCobro;
    if (!c?.autopay_activo || !c.autopay_payment_method_id || !c.stripe_customer_id || !tipo) {
        await withOrgTx(orgId, sql`
            update pagos_agrupados set estado = 'cancelado', updated_at = now()
             where id = ${pago.id} and org_id = ${orgId} and estado = 'creado' and stripe_payment_intent_id is null`);
        return;
    }
    await cargar(orgId, pago.clienteId, { id: pago.id, monto: pago.monto, currency: pago.currency, asignaciones: pago.asignaciones }, {
        nombre: String(c.nombre || ''), stripeAccountId: account,
        aceptaTarjeta: !!c.acepta_tarjeta, aceptaDomiciliacion: !!c.acepta_domiciliacion,
        capacidades: c.stripe_capacidades, feeEnabled: c.fee_enabled, feeTermsVersion: c.fee_terms_version,
    }, { customerId: String(c.stripe_customer_id), paymentMethodId: String(c.autopay_payment_method_id), tipo });
}

// Reembolso del pago de una FACTURA desde Cord (oct 2026).
//
// Hasta esta entrega solo se reembolsaban desde Cord los cobros de COTIZACIÓN
// (`/api/cobros/[cobroId]/reembolso`). El pago de una factura —su link, el
// portal del cliente o el cobro automático— solo se devolvía fuera de Cord, y
// Cord lo leía por webhook. Contrato:
//
//  - **Qué se reembolsa aquí.** Un pago EN LÍNEA que entró por el carril de la
//    factura: Stripe (tarjeta, SEPA, ACH) o Mercado Pago. Un pago que entró por
//    la cotización se devuelve desde su cobro (Ingresos › Cobros), para que el
//    mismo dinero no tenga dos puertas con dos ledgers. Uno registrado a mano no
//    lo movió Cord: no hay nada que devolver desde aquí.
//  - **Los límites del proveedor se dicen ANTES** (`evaluarReembolso`, pura):
//    ACH solo completo; SEPA y ACH dentro de 180 días; un pago que el proveedor
//    no da por cobrado no se devuelve; SPEI (transferencia) todavía no.
//    Fuente: docs.stripe.com/payments/ach-direct-debit ("Partial refunds ✗,
//    Full refunds ✓", 180 días) y /payments/sepa-debit (parciales sí, 180 días),
//    consultadas el 10 oct 2026.
//  - **El monto se RESERVA antes de llamar al proveedor**, bajo el lock del
//    cobro, contra el ledger local Y contra lo que el proveedor ya devolvió. La
//    clave de idempotencia es el id de esa solicitud reservada (regla 33): un
//    reintento de red no devuelve dos veces.
//  - **El ledger se escribe por el mismo camino que el webhook**
//    (`recordInvoiceRefund` / `recordMpInvoiceRefund`): su índice único hace que
//    el aviso que llega después solo actualice el estado, nunca reste dos veces.
//  - **Cobro agrupado.** El reembolso sale de UNA factura, acotado a lo que ese
//    cobro le aplicó (alcance 'factura'), o devuelve el cargo completo (alcance
//    'cobro', repartido por la regla general). Ver `allocateInvoiceRefund`.

import { createHash, randomBytes } from 'node:crypto';
import { sql, withOrgTx } from '../db';
import { stripe } from '../billing';
import { currencyDecimals, fromMinorUnits, normalizeCurrency } from '../currency';
import { merchantError } from '../pay-errors';
import { log } from '../log';
import { invoicePaymentLock, recordInvoiceRefund, recordMpInvoiceRefund } from '../fiscal/reconciliation';
import { logInvoiceEvent } from '../fiscal/timeline';
import { createMpRefund, fetchMpPayment } from '../mercadopago';
import { tipoMetodoDeIntent } from './agrupados';

// ── Reglas puras ────────────────────────────────────────────────────────────

/** Por qué un pago no se puede reembolsar desde Cord, dicho antes de intentarlo. */
export type MotivoBloqueo =
    | 'manual'             // registrado a mano: Cord no movió ese dinero
    | 'cotizacion'         // entró por la cotización: se devuelve desde su cobro
    | 'transferencia'      // SPEI / transferencia bancaria: todavía no desde aquí
    | 'metodo'             // un método sin reembolso en línea desde Cord
    | 'no_confirmado'      // el proveedor no lo da por cobrado (en proceso, en disputa)
    | 'plazo'              // venció la ventana del proveedor (SEPA y ACH: 180 días)
    | 'reembolsado'        // ya no queda nada por devolver
    | 'pendiente_registro' // el proveedor devolvió algo que Cord todavía no registra
    | 'sin_cuenta'         // la cuenta de cobro ya no está disponible
    | 'proveedor';         // no se pudo leer el pago en el proveedor

export interface ReglaMetodo {
    /** Admite devolver una parte. */
    parcial: boolean;
    /** Días desde el cobro en que el proveedor acepta el reembolso (null: sin tope propio). */
    plazoDias: number | null;
}

const REGLAS: Readonly<Record<string, ReglaMetodo>> = {
    card: { parcial: true, plazoDias: null },
    // Link guarda una tarjeta (o cuenta) y se reembolsa como tarjeta.
    link: { parcial: true, plazoDias: null },
    sepa_debit: { parcial: true, plazoDias: 180 },
    us_bank_account: { parcial: false, plazoDias: 180 },
    mercadopago: { parcial: true, plazoDias: null },
};

/** La regla del método con que se cobró; null si Cord no lo reembolsa en línea. */
export function reglaMetodo(tipo: string | null | undefined): ReglaMetodo | null {
    return REGLAS[String(tipo || '')] ?? null;
}

export interface DatosEvaluacion {
    /** card | sepa_debit | us_bank_account | customer_balance | mercadopago | … */
    tipo: string;
    /** El proveedor da el pago por cobrado. */
    confirmado: boolean;
    edadDias: number;
    /** Lo que cobró el proveedor (unidades mayores). */
    cobrado: number;
    /** Reembolsos vivos (no fallidos) que el proveedor ya tiene. */
    devueltoProveedor: number;
    /** Reembolsos vivos en el ledger de Cord más las solicitudes en vuelo. */
    registrado: number;
    /** Lo que este cobro le aplicó a ESTA factura y sigue sin devolverse. */
    capacidadFactura: number;
    /** Lo mismo, sumando todas las facturas que pagó el cobro. */
    capacidadCobro: number;
    /** Facturas que pagó el cobro. */
    facturas: number;
    decimales: number;
}

export interface Evaluacion {
    bloqueo: MotivoBloqueo | null;
    parcial: boolean;
    plazoDias: number | null;
    /** Tope desde esta factura (0: no se ofrece). */
    maxFactura: number;
    /** El cargo completo que queda (0 si el cobro pagó una sola factura). */
    maxCobro: number;
}

/**
 * Qué se puede devolver de un pago y hasta cuánto. Pura: la llaman el diálogo
 * (para decirlo antes) y el envío (para no confiar en lo que mande el navegador).
 */
export function evaluarReembolso(d: DatosEvaluacion): Evaluacion {
    const regla = reglaMetodo(d.tipo);
    const factor = 10 ** d.decimales;
    const r = (n: number) => Math.round((Math.max(n, 0) + Number.EPSILON) * factor) / factor;
    const eps = 0.5 / factor;
    const cerrado = (bloqueo: MotivoBloqueo): Evaluacion => ({
        bloqueo, parcial: regla?.parcial ?? false, plazoDias: regla?.plazoDias ?? null, maxFactura: 0, maxCobro: 0,
    });
    if (!regla) return cerrado(d.tipo === 'customer_balance' ? 'transferencia' : 'metodo');
    if (!d.confirmado) return cerrado('no_confirmado');
    if (regla.plazoDias !== null && d.edadDias > regla.plazoDias) return cerrado('plazo');
    // Algo salió en el proveedor y no está en el ledger (un reembolso hecho fuera
    // cuyo aviso no ha llegado): sin saber a qué factura se asignará, no se
    // reserva encima. Se dice y se espera al aviso.
    if (d.devueltoProveedor > d.registrado + eps) return cerrado('pendiente_registro');

    const restante = r(d.cobrado - d.devueltoProveedor);
    let maxCobro = d.facturas > 1 ? r(Math.min(d.capacidadCobro, restante)) : 0;
    let maxFactura = r(Math.min(d.capacidadFactura, d.capacidadCobro, restante));
    if (!regla.parcial) {
        // ACH: solo el cargo COMPLETO y una sola vez. De un cobro que pagó varias
        // facturas, devolver solo la parte de una sería un reembolso parcial.
        const completo = r(d.cobrado);
        const intacto = d.devueltoProveedor <= eps && d.registrado <= eps;
        maxFactura = intacto && d.facturas === 1 && d.capacidadFactura + eps >= completo ? completo : 0;
        maxCobro = intacto && d.facturas > 1 && d.capacidadCobro + eps >= completo ? completo : 0;
    }
    if (maxFactura <= 0 && maxCobro <= 0) return cerrado('reembolsado');
    return { bloqueo: null, parcial: regla.parcial, plazoDias: regla.plazoDias, maxFactura, maxCobro };
}

export type Alcance = 'factura' | 'cobro';
export type ErrorMonto = 'alcance' | 'monto' | 'completo';

/**
 * El monto pedido cabe en lo evaluado. El alcance 'cobro' siempre devuelve el
 * cargo completo que queda, y un método sin parciales (ACH) también.
 */
export function validarMonto(ev: Evaluacion, alcance: Alcance, monto: number, decimales: number): ErrorMonto | null {
    const eps = 0.5 / 10 ** decimales;
    const max = alcance === 'cobro' ? ev.maxCobro : ev.maxFactura;
    if (!(max > 0)) return 'alcance';
    if (!(monto > 0) || monto > max + eps) return 'monto';
    if ((alcance === 'cobro' || !ev.parcial) && Math.abs(monto - max) > eps) return 'completo';
    return null;
}

// ── Lectura ─────────────────────────────────────────────────────────────────

type Proveedor = 'stripe' | 'mercadopago';

interface PagoFactura {
    pagoId: string;
    documentoId: string;
    aplicado: number;
    currency: string;
    proveedor: Proveedor | null;
    /** Id del pago en su proveedor: PaymentIntent o pago de Mercado Pago. */
    proveedorId: string | null;
    deCotizacion: boolean;
    metodoAgrupado: string | null;
    stripeAccountId: string | null;
    /** México con CFDI: el reembolso no lo cancela (ver la guía de la UI). */
    cfdi: boolean;
}

async function leerPago(orgId: string, documentoId: string, pagoId: string): Promise<PagoFactura | null> {
    if (!/^[0-9a-f-]{36}$/i.test(pagoId) || !/^[0-9a-f-]{36}$/i.test(documentoId)) return null;
    const [[p]] = await withOrgTx(orgId, sql`
        select p.id, p.documento_id, p.monto, p.currency, p.stripe_payment_intent_id, p.mp_payment_id, p.cobro_id,
               d.country_code, d.document_type, d.provider_data, o.stripe_account_id,
               exists (select 1 from cotizacion_cobros cc where cc.org_id = p.org_id
                        and ((p.stripe_payment_intent_id is not null and cc.stripe_payment_intent_id = p.stripe_payment_intent_id)
                          or (p.mp_payment_id is not null and cc.mp_payment_id = p.mp_payment_id))) as de_cotizacion,
               (select pa.metodo from pagos_agrupados pa
                 where pa.org_id = p.org_id and pa.stripe_payment_intent_id = p.stripe_payment_intent_id limit 1) as metodo_agrupado
          from documento_pagos p
          join documentos_fiscales d on d.id = p.documento_id and d.org_id = p.org_id
          join orgs o on o.id = p.org_id
         where p.id = ${pagoId} and p.documento_id = ${documentoId} and p.org_id = ${orgId}`);
    if (!p) return null;
    const pi = p.stripe_payment_intent_id ? String(p.stripe_payment_intent_id) : null;
    const mp = p.mp_payment_id ? String(p.mp_payment_id) : null;
    const pd = (p.provider_data ?? {}) as Record<string, unknown>;
    return {
        pagoId: String(p.id),
        documentoId: String(p.documento_id),
        aplicado: Number(p.monto) || 0,
        currency: normalizeCurrency(String(p.currency || '')),
        proveedor: pi ? 'stripe' : mp ? 'mercadopago' : null,
        proveedorId: pi ?? mp,
        deCotizacion: !!p.cobro_id || !!p.de_cotizacion,
        metodoAgrupado: p.metodo_agrupado ? String(p.metodo_agrupado) : null,
        stripeAccountId: p.stripe_account_id ? String(p.stripe_account_id) : null,
        cfdi: String(p.country_code || '').toUpperCase() === 'MX' && String(p.document_type) === 'cfdi_40' && pd.simulado !== true,
    };
}

interface Capacidad {
    facturas: number;
    aplicado: number;
    registrado: number;
    capacidadFactura: number;
    capacidadCobro: number;
}

/**
 * Lo que el ledger dice de un cobro: cuánto aplicó a esta factura, cuánto queda
 * por devolver de ella y del cargo, y lo ya registrado o en vuelo. Una
 * solicitud 'enviada' reserva hasta que su reembolso queda registrado (o 24 h,
 * la ventana de idempotencia del proveedor).
 */
const capacidadQuery = (orgId: string, documentoId: string, proveedor: Proveedor, proveedorId: string, currency: string) => sql`
    with pagos as (
        select p.documento_id, sum(p.monto) as aplicado from documento_pagos p
         where p.org_id = ${orgId} and p.currency = ${currency}
           and ((${proveedor} = 'stripe' and p.stripe_payment_intent_id = ${proveedorId})
             or (${proveedor} = 'mercadopago' and p.mp_payment_id = ${proveedorId}))
         group by p.documento_id
    ), vivos as (
        select r.stripe_refund_id, r.monto from documento_reembolsos r
         where r.org_id = ${orgId} and r.currency = ${currency} and r.status not in ('failed', 'canceled')
           and ((${proveedor} = 'stripe' and r.stripe_payment_intent_id = ${proveedorId})
             or (${proveedor} = 'mercadopago' and r.mp_payment_id = ${proveedorId}))
    ), en_vuelo as (
        select coalesce(sum(s.monto), 0) as total,
               coalesce(sum(s.monto) filter (where s.alcance = 'cobro' or s.documento_id = ${documentoId}), 0) as factura
          from documento_reembolso_solicitudes s
         where s.org_id = ${orgId} and s.estado = 'enviada' and s.updated_at > now() - interval '24 hours'
           and ((${proveedor} = 'stripe' and s.stripe_payment_intent_id = ${proveedorId})
             or (${proveedor} = 'mercadopago' and s.mp_payment_id = ${proveedorId}))
    )
    select (select count(*) from pagos)::int as facturas,
           coalesce((select aplicado from pagos where documento_id = ${documentoId}), 0) as aplicado,
           coalesce((select sum(monto) from vivos), 0) + (select total from en_vuelo) as registrado,
           greatest(coalesce((select aplicado from pagos where documento_id = ${documentoId}), 0)
             - coalesce((select sum(a.monto) from documento_reembolso_asignaciones a join vivos v on v.stripe_refund_id = a.stripe_refund_id
                          where a.org_id = ${orgId} and a.documento_id = ${documentoId}), 0)
             - coalesce((select sum(v.monto) from vivos v where v.stripe_refund_id is null
                          or not exists (select 1 from documento_reembolso_asignaciones a
                                          where a.org_id = ${orgId} and a.stripe_refund_id = v.stripe_refund_id)), 0)
             - (select factura from en_vuelo), 0) as capacidad_factura,
           greatest(coalesce((select sum(aplicado) from pagos), 0) - coalesce((select sum(monto) from vivos), 0)
             - (select total from en_vuelo), 0) as capacidad_cobro`;

async function leerCapacidad(orgId: string, pago: PagoFactura): Promise<Capacidad> {
    const [[c]] = await withOrgTx(orgId, capacidadQuery(orgId, pago.documentoId, pago.proveedor as Proveedor, pago.proveedorId as string, pago.currency));
    return {
        facturas: Number(c?.facturas ?? 0),
        aplicado: Number(c?.aplicado ?? 0),
        registrado: Number(c?.registrado ?? 0),
        capacidadFactura: Number(c?.capacidad_factura ?? 0),
        capacidadCobro: Number(c?.capacidad_cobro ?? 0),
    };
}

interface EstadoProveedor {
    tipo: string;
    confirmado: boolean;
    cobrado: number;
    devuelto: number;
    edadDias: number;
}

/** El pago y sus reembolsos, leídos en la cuenta conectada: la verdad del proveedor. */
async function estadoStripe(cuenta: string, pi: string, currency: string, tipoConocido: string | null): Promise<EstadoProveedor> {
    const intent = await stripe(`/v1/payment_intents/${encodeURIComponent(pi)}`, { 'expand[]': 'latest_charge' }, 'GET', { stripeAccount: cuenta });
    if (!intent || intent.id !== pi) throw new Error('No se pudo leer el pago.');
    if (normalizeCurrency(String(intent.currency || '')) !== currency) throw new Error('La divisa del pago no coincide.');
    const lista = await stripe('/v1/refunds', { payment_intent: pi, limit: '100' }, 'GET', { stripeAccount: cuenta });
    if (!Array.isArray(lista?.data) || lista.has_more) throw new Error('Historial de reembolsos incompleto.');
    const devuelto = lista.data
        .filter((r: any) => !['failed', 'canceled'].includes(String(r?.status)))
        .reduce((s: number, r: any) => s + fromMinorUnits(Number(r?.amount) || 0, currency), 0);
    const charge = typeof intent.latest_charge === 'object' ? intent.latest_charge : null;
    return {
        tipo: charge?.payment_method_details?.type ? String(charge.payment_method_details.type) : (tipoConocido || tipoMetodoDeIntent(intent)),
        confirmado: intent.status === 'succeeded',
        cobrado: fromMinorUnits(Number(intent.amount_received) || 0, currency),
        devuelto,
        edadDias: Math.floor((Date.now() - Number(intent.created || 0) * 1000) / 86_400_000),
    };
}

async function estadoMercadoPago(orgId: string, paymentId: string, currency: string): Promise<EstadoProveedor | null> {
    const pago = await fetchMpPayment(orgId, paymentId);
    if (!pago || pago.id !== paymentId) return null;
    if (normalizeCurrency(pago.moneda) !== currency) throw new Error('La divisa del pago no coincide.');
    return {
        tipo: 'mercadopago',
        // Un pago devuelto por completo pasa a `refunded`: sigue siendo un cobro
        // confirmado, solo que ya no le queda nada.
        confirmado: ['approved', 'refunded'].includes(pago.status),
        cobrado: pago.monto,
        devuelto: pago.reembolsos.filter((r) => r.status !== 'failed').reduce((s, r) => s + r.monto, 0),
        edadDias: 0,
    };
}

// ── Preparar (el diálogo) ───────────────────────────────────────────────────

export interface OpcionReembolso {
    pagoId: string;
    proveedor: Proveedor | null;
    /** Método con que se cobró (card, sepa_debit, us_bank_account, mercadopago…). */
    metodo: string | null;
    currency: string;
    decimales: number;
    /** Lo que este cobro le aplicó a la factura. */
    aplicado: number;
    /** Facturas que pagó el mismo cobro. */
    facturas: number;
    bloqueo: MotivoBloqueo | null;
    parcial: boolean;
    plazoDias: number | null;
    maxFactura: number;
    maxCobro: number;
    /** México con CFDI timbrado: guía de la nota de crédito (CFDI de egreso). */
    cfdi: boolean;
    nonce?: string;
    expiresIn?: number;
}

const hashNonce = (nonce: string) => createHash('sha256').update(nonce).digest('hex');
const NONCE_TTL_SECONDS = 600;

/** El estado de un pago para el diálogo y, si se puede devolver, su autorización de un solo uso. */
export async function prepararReembolso(orgId: string, documentoId: string, pagoId: string, userId: string | null): Promise<OpcionReembolso | null> {
    const pago = await leerPago(orgId, documentoId, pagoId);
    if (!pago) return null;
    const decimales = currencyDecimals(pago.currency);
    const opcion: OpcionReembolso = {
        pagoId: pago.pagoId, proveedor: pago.proveedor, metodo: pago.proveedor === 'mercadopago' ? 'mercadopago' : pago.metodoAgrupado,
        currency: pago.currency, decimales, aplicado: pago.aplicado, facturas: 1,
        bloqueo: null, parcial: false, plazoDias: null, maxFactura: 0, maxCobro: 0, cfdi: pago.cfdi,
    };
    const evaluado = await evaluarPago(orgId, pago);
    if (!('ev' in evaluado)) return { ...opcion, bloqueo: evaluado.bloqueo };
    const { ev, cap, estado } = evaluado;
    Object.assign(opcion, {
        metodo: estado.tipo, facturas: Math.max(cap.facturas, 1), aplicado: cap.aplicado || pago.aplicado,
        bloqueo: ev.bloqueo, parcial: ev.parcial, plazoDias: ev.plazoDias, maxFactura: ev.maxFactura, maxCobro: ev.maxCobro,
    });
    if (ev.bloqueo) return opcion;

    const nonce = randomBytes(32).toString('base64url');
    await withOrgTx(orgId, sql`
        insert into documento_reembolso_solicitudes
          (org_id, documento_id, pago_id, proveedor, stripe_payment_intent_id, mp_payment_id, currency,
           nonce_hash, max_factura, max_cobro, expires_at, creado_por)
        values (${orgId}, ${pago.documentoId}, ${pago.pagoId}, ${pago.proveedor},
                ${pago.proveedor === 'stripe' ? pago.proveedorId : null}, ${pago.proveedor === 'mercadopago' ? pago.proveedorId : null},
                ${pago.currency}, ${hashNonce(nonce)}, ${ev.maxFactura}, ${ev.maxCobro},
                now() + make_interval(secs => ${NONCE_TTL_SECONDS}), ${userId})`);
    return { ...opcion, nonce, expiresIn: NONCE_TTL_SECONDS };
}

interface Evaluado { ev: Evaluacion; cap: Capacidad; estado: EstadoProveedor }

/** Lo que dicen el ledger y el proveedor de ESE pago, ahora. */
async function evaluarPago(orgId: string, pago: PagoFactura): Promise<Evaluado | { bloqueo: MotivoBloqueo }> {
    if (!pago.proveedor || !pago.proveedorId) return { bloqueo: 'manual' };
    if (pago.deCotizacion) return { bloqueo: 'cotizacion' };
    let estado: EstadoProveedor | null;
    try {
        if (pago.proveedor === 'stripe') {
            if (!pago.stripeAccountId) return { bloqueo: 'sin_cuenta' };
            estado = await estadoStripe(pago.stripeAccountId, pago.proveedorId, pago.currency, pago.metodoAgrupado);
        } else {
            estado = await estadoMercadoPago(orgId, pago.proveedorId, pago.currency);
        }
    } catch (err) {
        log.error('no se pudo leer el pago para reembolsar', { route: 'cobros/reembolsos', orgId, err });
        return { bloqueo: 'proveedor' };
    }
    if (!estado) return { bloqueo: 'proveedor' };
    const cap = await leerCapacidad(orgId, pago);
    const ev = evaluarReembolso({
        tipo: estado.tipo, confirmado: estado.confirmado, edadDias: estado.edadDias,
        cobrado: estado.cobrado, devueltoProveedor: estado.devuelto, registrado: cap.registrado,
        capacidadFactura: cap.capacidadFactura, capacidadCobro: cap.capacidadCobro,
        facturas: Math.max(cap.facturas, 1), decimales: currencyDecimals(pago.currency),
    });
    return { ev, cap, estado };
}

// ── Ejecutar ────────────────────────────────────────────────────────────────

export type ResultadoReembolso =
    | { ok: true; solicitudId: string; estado: string; monto: number; currency: string; alcance: Alcance; cfdi: boolean }
    | { ok: false; error: 'autorizacion' | 'capacidad' | ErrorMonto | MotivoBloqueo }
    /** El proveedor lo rechazó: la reserva se liberó. */
    | { ok: false; error: 'rechazo'; mensaje: string; referencia: string }
    /** Sin respuesta segura: la reserva sigue hasta que el aviso del proveedor la resuelva. */
    | { ok: false; error: 'incierto'; referencia: string };

const idempotencia = (solicitudId: string) => `cord-reembolso-factura-${solicitudId}`;

/**
 * Devuelve el pago. Consume la autorización al reservar el monto (bajo el lock
 * del cobro) y solo entonces llama al proveedor.
 */
export async function ejecutarReembolso(orgId: string, documentoId: string, input: {
    nonce: string; alcance: Alcance; montoMinimo: number; motivo: string | null; userId: string | null;
}): Promise<ResultadoReembolso> {
    const nonceHash = hashNonce(input.nonce);
    const [[sol]] = await withOrgTx(orgId, sql`
        select id, pago_id, proveedor, stripe_payment_intent_id, mp_payment_id, currency, max_factura, max_cobro
          from documento_reembolso_solicitudes
         where org_id = ${orgId} and documento_id = ${documentoId} and nonce_hash = ${nonceHash}
           and estado = 'autorizada' and expires_at > now()`);
    if (!sol) return { ok: false, error: 'autorizacion' };
    const pago = await leerPago(orgId, documentoId, String(sol.pago_id));
    const proveedorId = String(sol.stripe_payment_intent_id || sol.mp_payment_id || '');
    if (!pago || pago.proveedor !== sol.proveedor || pago.proveedorId !== proveedorId || pago.currency !== sol.currency) {
        return { ok: false, error: 'autorizacion' };
    }

    const evaluado = await evaluarPago(orgId, pago);
    if (!('ev' in evaluado)) return { ok: false, error: evaluado.bloqueo };
    const { ev, cap, estado } = evaluado;
    if (ev.bloqueo) return { ok: false, error: ev.bloqueo };
    const decimales = currencyDecimals(pago.currency);
    if (!Number.isSafeInteger(input.montoMinimo) || input.montoMinimo <= 0) return { ok: false, error: 'monto' };
    const monto = fromMinorUnits(input.montoMinimo, pago.currency);
    const invalido = validarMonto(ev, input.alcance, monto, decimales);
    if (invalido) return { ok: false, error: invalido };
    const restanteProveedor = Math.max(estado.cobrado - estado.devuelto, 0);

    // Reserva: el monto cabe en lo que el ledger permite AHORA (no en lo que vio
    // el diálogo) y en lo que el proveedor aún tiene. Bajo el lock del cobro, dos
    // solicitudes a la vez no reservan la misma capacidad.
    const prov = pago.proveedor as Proveedor;
    const [, [reservada]] = await withOrgTx(orgId, invoicePaymentLock(orgId, proveedorId), sql`
        with pagos as (
            select p.documento_id, sum(p.monto) as aplicado from documento_pagos p
             where p.org_id = ${orgId} and p.currency = ${pago.currency}
               and ((${prov} = 'stripe' and p.stripe_payment_intent_id = ${proveedorId})
                 or (${prov} = 'mercadopago' and p.mp_payment_id = ${proveedorId}))
             group by p.documento_id
        ), vivos as (
            select r.stripe_refund_id, r.monto from documento_reembolsos r
             where r.org_id = ${orgId} and r.currency = ${pago.currency} and r.status not in ('failed', 'canceled')
               and ((${prov} = 'stripe' and r.stripe_payment_intent_id = ${proveedorId})
                 or (${prov} = 'mercadopago' and r.mp_payment_id = ${proveedorId}))
        ), en_vuelo as (
            select coalesce(sum(s.monto), 0) as total,
                   coalesce(sum(s.monto) filter (where s.alcance = 'cobro' or s.documento_id = ${documentoId}), 0) as factura
              from documento_reembolso_solicitudes s
             where s.org_id = ${orgId} and s.estado = 'enviada' and s.updated_at > now() - interval '24 hours'
               and ((${prov} = 'stripe' and s.stripe_payment_intent_id = ${proveedorId})
                 or (${prov} = 'mercadopago' and s.mp_payment_id = ${proveedorId}))
        ), cap as (
            select greatest(coalesce((select aplicado from pagos where documento_id = ${documentoId}), 0)
                     - coalesce((select sum(a.monto) from documento_reembolso_asignaciones a join vivos v on v.stripe_refund_id = a.stripe_refund_id
                                  where a.org_id = ${orgId} and a.documento_id = ${documentoId}), 0)
                     - coalesce((select sum(v.monto) from vivos v where v.stripe_refund_id is null
                                  or not exists (select 1 from documento_reembolso_asignaciones a
                                                  where a.org_id = ${orgId} and a.stripe_refund_id = v.stripe_refund_id)), 0)
                     - (select factura from en_vuelo), 0) as factura,
                   greatest(coalesce((select sum(aplicado) from pagos), 0) - coalesce((select sum(monto) from vivos), 0)
                     - (select total from en_vuelo), 0) as cobro,
                   (select count(*) from pagos) as facturas
        )
        update documento_reembolso_solicitudes s
           set estado = 'enviada', alcance = ${input.alcance}, monto = ${monto}, motivo = ${input.motivo},
               creado_por = coalesce(s.creado_por, ${input.userId}::uuid), updated_at = now()
          from cap
         where s.org_id = ${orgId} and s.id = ${sol.id} and s.estado = 'autorizada' and s.expires_at > now()
           and (${input.alcance} = 'factura' or cap.facturas > 1)
           and ${monto}::numeric <= case when ${input.alcance} = 'cobro' then least(cap.cobro, s.max_cobro)
                                else least(cap.factura, cap.cobro, s.max_factura) end + ${0.5 / 10 ** decimales}::numeric
           and ${monto}::numeric <= ${restanteProveedor}::numeric + ${0.5 / 10 ** decimales}::numeric
        returning s.id`);
    if (!reservada) return { ok: false, error: 'capacidad' };
    const solicitudId = String(reservada.id);
    const etiqueta = `${monto.toFixed(decimales)} ${pago.currency}`;

    const liberar = (ref: string) => withOrgTx(orgId, sql`
        update documento_reembolso_solicitudes set estado = 'fallida', error_ref = ${ref}, updated_at = now()
         where org_id = ${orgId} and id = ${solicitudId} and estado = 'enviada'`);
    const marcarIncierto = (ref: string) => withOrgTx(orgId, sql`
        update documento_reembolso_solicitudes set error_ref = ${ref}, updated_at = now()
         where org_id = ${orgId} and id = ${solicitudId}`);

    let estadoReembolso = 'pending';
    if (prov === 'stripe') {
        let refund: any;
        try {
            refund = await stripe('/v1/refunds', {
                payment_intent: proveedorId,
                amount: String(input.montoMinimo),
                reason: 'requested_by_customer',
                // La tarifa de Cord no se devuelve sola: mismo contrato que la cotización.
                refund_application_fee: 'false',
                'metadata[cord_reembolso]': solicitudId,
                'metadata[org_id]': orgId,
                'metadata[documento_id]': documentoId,
                'metadata[alcance]': input.alcance,
            }, 'POST', { stripeAccount: pago.stripeAccountId as string, idempotencyKey: idempotencia(solicitudId) });
        } catch (err) {
            const safe = merchantError(err);
            const status = Number((err as any)?.stripeStatus || 0);
            // 4xx (salvo 409, otra petición con la misma llave en curso): el
            // proveedor no creó nada. Sin respuesta o 5xx: no se sabe, y la reserva
            // se queda hasta que el aviso del reembolso la ligue (o venza).
            if (status >= 400 && status < 500 && status !== 409) {
                await liberar(safe.reference);
                log.error('el proveedor rechazó el reembolso de la factura', { route: 'cobros/reembolsos', orgId, documentoId, reference: safe.reference });
                return { ok: false, error: 'rechazo', mensaje: safe.message, referencia: safe.reference };
            }
            await marcarIncierto(safe.reference);
            log.error('reembolso de factura sin respuesta del proveedor', { route: 'cobros/reembolsos', orgId, documentoId, reference: safe.reference });
            return { ok: false, error: 'incierto', referencia: safe.reference };
        }
        estadoReembolso = String(refund?.status || 'pending');
        try {
            await recordInvoiceRefund(orgId, {
                id: String(refund.id), paymentIntentId: proveedorId,
                amount: fromMinorUnits(Number(refund.amount), pago.currency), currency: pago.currency,
                status: estadoReembolso, eventCreated: 0, solicitudId,
            });
        } catch (err) {
            // El dinero ya salió: el aviso del proveedor lo registrará (la metadata
            // lleva la solicitud). No se responde como fallo.
            log.error('reembolso hecho sin registrar todavía', { route: 'cobros/reembolsos', orgId, documentoId, err });
        }
    } else {
        const res = await createMpRefund(orgId, { paymentId: proveedorId, monto, idempotencyKey: idempotencia(solicitudId) });
        if (!res.ok) {
            const referencia = randomBytes(4).toString('hex').toUpperCase();
            if (res.reason === 'red') {
                await marcarIncierto(referencia);
                return { ok: false, error: 'incierto', referencia };
            }
            await liberar(referencia);
            return {
                ok: false, error: 'rechazo', referencia,
                mensaje: res.reason === 'sin_credenciales'
                    ? 'La conexión con Mercado Pago ya no está activa. Vuelve a conectarla en Ajustes › Cobros.'
                    : `Mercado Pago no aceptó el reembolso (ref: ${referencia}).`,
            };
        }
        estadoReembolso = res.refund.status;
        try {
            await recordMpInvoiceRefund(orgId, {
                id: res.refund.id, paymentId: proveedorId, amount: res.refund.monto, currency: pago.currency,
                status: res.refund.status, solicitudId,
            });
        } catch (err) {
            log.error('reembolso de Mercado Pago hecho sin registrar todavía', { route: 'cobros/reembolsos', orgId, documentoId, err });
        }
    }

    // Efectivo o fallido lo cuenta el ledger en su transición; uno en camino
    // (débito bancario, Mercado Pago en proceso) se anota aquí.
    if (!['succeeded', 'failed', 'canceled'].includes(estadoReembolso)) {
        await logInvoiceEvent(orgId, documentoId, 'refund', input.alcance === 'cobro'
            ? `Reembolso de ${etiqueta} solicitado (cobro de ${cap.facturas} facturas)`
            : `Reembolso de ${etiqueta} solicitado`);
    }
    return { ok: true, solicitudId, estado: estadoReembolso, monto, currency: pago.currency, alcance: input.alcance, cfdi: pago.cfdi };
}

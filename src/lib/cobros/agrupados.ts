// Cobro agrupado: un solo PaymentIntent que paga VARIAS facturas del mismo
// cliente, desde el portal o desde el cobro automático.
//
// Contrato:
//   - El reparto lo decide Cord al CREAR el cobro, con el saldo real de cada
//     factura leído de la base (nunca un monto que mande el navegador), y queda
//     en `pago_agrupado_documentos`. El webhook solo lo aplica.
//   - Todas las facturas van en la MISMA divisa (regla 21): un cobro no suma
//     pesos con dólares.
//   - El asiento es idempotente por factura y PaymentIntent (el mismo índice
//     único de `documento_pagos` que protege el pago de una sola factura).
//   - El PaymentIntent no lleva `documento_id`: si lo llevara, el asiento de una
//     sola factura le aplicaría el cobro COMPLETO a esa factura.

import { sql, withOrgTx } from '../db';
import { stripe } from '../billing';
import { currencyDecimals, normalizeCurrency, stripeCurrency, stripeSupportsCurrency, toMinorUnits } from '../currency';
import { computeFee, feesApplyTo, isFeeScheduleActive } from '../fees';
import { setInvoiceFeeMetadata } from '../invoice-payment-fees';
import { applyPayment } from '../fiscal/payments';
import { allocatePendingInvoiceRefunds } from '../fiscal/reconciliation';
import { logInvoiceEvent } from '../fiscal/timeline';
import { metodosPara, type MetodoCobro, type ResumenMetodo } from './metodos';
import { decidirReintento, type Decision } from './reintentos';
import { desvincularMetodo, leerMetodo } from './stripe-cliente';

const money = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

// ── Facturas del cliente ────────────────────────────────────────────────────

export interface FacturaCliente {
    id: string;
    numero: string | null;
    token: string | null;
    currency: string;
    total: number;
    saldo: number;
    estado: string;
    /** Fecha de vencimiento (AAAA-MM-DD) o null. */
    vence: string | null;
    emitida: string;
    /** Hay un cobro en vuelo (débito bancario en proceso) sobre ella. */
    enProceso: boolean;
    /** Se puede pagar en línea ahora. */
    cobrable: boolean;
}

const fechaIso = (v: unknown): string | null => {
    if (!v) return null;
    const d = v instanceof Date ? v : new Date(String(v));
    return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
};

/**
 * Las facturas emitidas del cliente: las abiertas con saldo y las pagadas más
 * recientes (historial del portal). Una nota de crédito o un documento de
 * prueba no se cobran.
 */
export async function facturasDelCliente(orgId: string, clienteId: string, limite = 100): Promise<FacturaCliente[]> {
    const [rows] = await withOrgTx(orgId, sql`
        select d.id, d.invoice_number, d.public_token, d.currency, d.total, d.amount_remaining, d.lifecycle,
               d.due_date, d.issued_at, d.created_at, d.provider_data, d.pago_en_proceso_pi,
               exists (select 1 from pago_agrupado_documentos a
                        join pagos_agrupados p on p.id = a.pago_id and p.org_id = a.org_id
                       where a.org_id = d.org_id and a.documento_id = d.id and p.estado = 'procesando') as agrupado_en_proceso
          from documentos_fiscales d
         where d.org_id = ${orgId} and d.cliente_id = ${clienteId}
           and d.status = 'issued' and d.lifecycle in ('open', 'paid')
           and d.credit_note_of is null and d.document_type not in ('credit_note', 'cfdi_egreso')
         order by (d.lifecycle = 'open') desc, d.due_date asc nulls last, d.issued_at desc
         limit ${limite}`);
    return rows.map((r: any) => {
        const saldo = money(Number(r.amount_remaining ?? 0));
        const pd = (r.provider_data ?? {}) as Record<string, any>;
        const enProceso = !!r.pago_en_proceso_pi || !!r.agrupado_en_proceso;
        const prueba = pd.simulado === true || pd.livemode === false;
        const cancelando = ['pending', 'verifying'].includes(String(pd.cancelacion?.status ?? ''));
        return {
            id: String(r.id),
            numero: r.invoice_number ? String(r.invoice_number) : null,
            token: r.public_token ? String(r.public_token) : null,
            currency: normalizeCurrency(r.currency),
            total: money(Number(r.total ?? 0)),
            saldo,
            estado: String(r.lifecycle),
            vence: fechaIso(r.due_date),
            emitida: fechaIso(r.issued_at ?? r.created_at) ?? '',
            enProceso,
            cobrable: r.lifecycle === 'open' && saldo > 0 && !enProceso && !prueba && !cancelando,
        };
    });
}

/** Saldo pendiente por divisa (nunca sumado entre divisas). */
export function saldoPorDivisa(facturas: FacturaCliente[]): { currency: string; saldo: number; facturas: number; vencido: number }[] {
    const hoy = new Date().toISOString().slice(0, 10);
    const por = new Map<string, { currency: string; saldo: number; facturas: number; vencido: number }>();
    for (const f of facturas) {
        if (f.estado !== 'open' || f.saldo <= 0) continue;
        const g = por.get(f.currency) ?? { currency: f.currency, saldo: 0, facturas: 0, vencido: 0 };
        g.saldo = money(g.saldo + f.saldo);
        g.facturas += 1;
        if (f.vence && f.vence < hoy) g.vencido = money(g.vencido + f.saldo);
        por.set(f.currency, g);
    }
    return [...por.values()].sort((a, b) => b.saldo - a.saldo);
}

// ── Crear el cobro ──────────────────────────────────────────────────────────

export interface PagoAgrupado {
    id: string;
    monto: number;
    currency: string;
    asignaciones: { documentoId: string; monto: number }[];
}

/**
 * Reserva el cobro y su reparto en UNA sentencia: si alguna factura pedida ya
 * no está abierta, cambió de divisa, quedó sin saldo o tiene un débito en
 * proceso, no se crea nada. El monto de cada factura es su saldo en la base.
 */
export async function crearPagoAgrupado(orgId: string, input: {
    clienteId: string; origen: 'portal' | 'automatico'; currency: string; documentos: string[];
}): Promise<{ ok: true; pago: PagoAgrupado } | { ok: false; error: string }> {
    const ids = [...new Set(input.documentos.map(String))].filter((id) => /^[0-9a-f-]{36}$/i.test(id));
    if (!ids.length) return { ok: false, error: 'Selecciona al menos una factura.' };
    if (ids.length > 50) return { ok: false, error: 'Puedes pagar hasta 50 facturas a la vez.' };
    const currency = normalizeCurrency(input.currency);
    const [rows] = await withOrgTx(orgId, sql`
        with sel as (
            select d.id, d.amount_remaining as monto from documentos_fiscales d
             where d.org_id = ${orgId} and d.cliente_id = ${input.clienteId} and d.id = any(${ids}::uuid[])
               and d.status = 'issued' and d.lifecycle = 'open' and d.credit_note_of is null
               and d.document_type not in ('credit_note', 'cfdi_egreso')
               and d.currency = ${currency} and d.amount_remaining > 0
               and d.pago_en_proceso_pi is null
               and coalesce(d.provider_data->>'simulado', '') <> 'true'
               and coalesce(d.provider_data->>'livemode', '') <> 'false'
               and coalesce(d.provider_data->'cancelacion'->>'status', '') not in ('pending', 'verifying')
               and not exists (select 1 from pago_agrupado_documentos a
                                join pagos_agrupados p on p.id = a.pago_id and p.org_id = a.org_id
                               where a.org_id = d.org_id and a.documento_id = d.id and p.estado = 'procesando')
        ), pago as (
            insert into pagos_agrupados (org_id, cliente_id, origen, currency, monto)
            select ${orgId}, ${input.clienteId}, ${input.origen}, ${currency}, sum(monto) from sel
            having count(*) = ${ids.length}
            on conflict do nothing
            returning id, monto
        )
        insert into pago_agrupado_documentos (pago_id, org_id, documento_id, monto)
        select pago.id, ${orgId}, sel.id, sel.monto from pago, sel
        returning pago_id, documento_id, monto`);
    if (rows.length !== ids.length) {
        return {
            ok: false,
            error: input.origen === 'automatico'
                ? 'Ya hay un cobro automático en curso para este cliente.'
                : 'El saldo de alguna factura cambió o ya tiene un pago en proceso. Actualiza la página.',
        };
    }
    const asignaciones = rows.map((r: any) => ({ documentoId: String(r.documento_id), monto: money(Number(r.monto)) }));
    return {
        ok: true,
        pago: {
            id: String(rows[0].pago_id),
            monto: money(asignaciones.reduce((s, a) => s + a.monto, 0)),
            currency,
            asignaciones,
        },
    };
}

export interface OrgParaCobro {
    nombre: string;
    stripeAccountId: string;
    aceptaTarjeta: boolean;
    aceptaDomiciliacion: boolean;
    capacidades: unknown;
    feeEnabled: unknown;
    feeTermsVersion: unknown;
}

/** Piso del proveedor en unidad mínima: 50 centavos o su equivalente por decimales. */
export function pisoCobro(currency: string): number {
    const PISO: Record<number, number> = { 0: 50, 2: 50, 3: 500 };
    return PISO[currencyDecimals(currency)] ?? 50;
}

/**
 * Los métodos del cobro. Donde Cord cobra comisión (hoy solo MXN) la comisión
 * es de TARJETA, así que ahí no se ofrece domiciliación: cobrarle a un débito
 * bancario la tarifa de tarjeta sería un número que nadie aprobó.
 */
export function metodosDelCobro(org: OrgParaCobro, currency: string): MetodoCobro[] {
    const metodos = metodosPara(org, currency);
    return feesApplyTo(currency) && isFeeScheduleActive(org.feeEnabled, org.feeTermsVersion)
        ? metodos.filter((m) => m === 'card')
        : metodos;
}

export type ErrorIntent = Error & { code?: string; declineCode?: string; paymentIntent?: any; type?: string };

/**
 * Crea el PaymentIntent del cobro agrupado en la cuenta conectada. Idempotente
 * por cobro: un reintento de red devuelve el mismo intento, nunca un segundo
 * cargo. Con `offSession` confirma de inmediato contra el método guardado
 * (cobro automático); sin él devuelve el intento para que el cliente lo
 * confirme en el portal.
 */
export async function crearIntentAgrupado(orgId: string, pago: PagoAgrupado, org: OrgParaCobro, opts: {
    customerId: string;
    clienteId: string;
    metodos: MetodoCobro[];
    descripcion: string;
    offSession?: { paymentMethodId: string; tipo: MetodoCobro };
    guardarParaAutopay?: boolean;
}): Promise<any> {
    if (!stripeSupportsCurrency(pago.currency)) throw new Error('Divisa no admitida para cobro en línea.');
    const amount = toMinorUnits(pago.monto, pago.currency);
    if (amount < pisoCobro(pago.currency)) throw new Error('El monto es demasiado pequeño para cobrarse en línea.');
    const tipos = opts.offSession ? [opts.offSession.tipo] : opts.metodos;
    if (!tipos.length) throw new Error('Sin métodos de pago disponibles.');
    const soloTarjeta = tipos.every((t) => t === 'card');
    const fee = computeFee({
        amountCents: amount, metodo: 'card', moneda: pago.currency,
        enabled: soloTarjeta && isFeeScheduleActive(org.feeEnabled, org.feeTermsVersion),
    });

    const form: Record<string, string> = {
        amount: String(amount),
        currency: stripeCurrency(pago.currency),
        customer: opts.customerId,
        description: opts.descripcion.slice(0, 500),
        'metadata[pago_agrupado_id]': pago.id,
        'metadata[cliente_id]': opts.clienteId,
        'metadata[cord_flow]': pago.asignaciones.length > 1 ? 'pago_agrupado' : 'pago_portal',
        'metadata[facturas]': String(pago.asignaciones.length),
    };
    tipos.forEach((t, i) => { form[`payment_method_types[${i}]`] = t; });
    const feeForm = new URLSearchParams();
    setInvoiceFeeMetadata(feeForm, fee);
    for (const [k, v] of feeForm) form[k] = v;
    if (fee.applicationFeeCents > 0) form.application_fee_amount = String(fee.applicationFeeCents);
    if (opts.offSession) {
        form.payment_method = opts.offSession.paymentMethodId;
        form.confirm = 'true';
        // Un cargo con tarjeta sin el titular presente se declara como tal (las
        // exenciones de autenticación dependen de ello). Un débito bancario se
        // confirma con su mandato, sin esa bandera.
        if (opts.offSession.tipo === 'card') form.off_session = 'true';
        form['metadata[cord_autopay]'] = '1';
    } else if (opts.guardarParaAutopay) {
        form.setup_future_usage = 'off_session';
        form['metadata[cord_autopay_alta]'] = '1';
    }
    const intent = await stripe('/v1/payment_intents', form, 'POST', {
        stripeAccount: org.stripeAccountId, idempotencyKey: `cord-grupo-${pago.id}`,
    });
    if (!intent?.id) throw new Error('El proveedor no devolvió el cobro.');
    await withOrgTx(orgId, sql`
        update pagos_agrupados
           set stripe_payment_intent_id = ${String(intent.id)}, updated_at = now()
         where id = ${pago.id} and org_id = ${orgId}
           and (stripe_payment_intent_id is null or stripe_payment_intent_id = ${String(intent.id)})`);
    return intent;
}

// ── Lectura del cobro ───────────────────────────────────────────────────────

export interface PagoAgrupadoRow {
    id: string; orgId: string; clienteId: string | null; origen: 'portal' | 'automatico';
    currency: string; monto: number; estado: string; pi: string | null; createdAt: Date;
    asignaciones: { documentoId: string; monto: number }[];
}

export async function leerPagoAgrupado(orgId: string, pagoId: string): Promise<PagoAgrupadoRow | null> {
    if (!/^[0-9a-f-]{36}$/i.test(pagoId)) return null;
    const [[p], asig] = await withOrgTx(orgId,
        sql`select id, org_id, cliente_id, origen, currency, monto, estado, stripe_payment_intent_id, created_at
              from pagos_agrupados where id = ${pagoId} and org_id = ${orgId}`,
        sql`select documento_id, monto from pago_agrupado_documentos
             where pago_id = ${pagoId} and org_id = ${orgId} order by documento_id`);
    if (!p) return null;
    return {
        id: String(p.id), orgId: String(p.org_id), clienteId: p.cliente_id ? String(p.cliente_id) : null,
        origen: p.origen === 'automatico' ? 'automatico' : 'portal',
        currency: String(p.currency), monto: money(Number(p.monto)), estado: String(p.estado),
        pi: p.stripe_payment_intent_id ? String(p.stripe_payment_intent_id) : null,
        createdAt: new Date(p.created_at),
        asignaciones: asig.map((a: any) => ({ documentoId: String(a.documento_id), monto: money(Number(a.monto)) })),
    };
}

// ── Asiento (webhook) ───────────────────────────────────────────────────────

/** El método con el que se cobró un intento, leído de su cargo. */
export function tipoMetodoDeIntent(intent: any): string {
    const charge = typeof intent?.latest_charge === 'object' ? intent.latest_charge : null;
    const desdeCargo = charge?.payment_method_details?.type;
    if (desdeCargo) return String(desdeCargo);
    const tipos = Array.isArray(intent?.payment_method_types) ? intent.payment_method_types : [];
    if (tipos.length === 1) return String(tipos[0]);
    const err = intent?.last_payment_error?.payment_method?.type;
    return err ? String(err) : 'card';
}

/**
 * El tipo real del método con que se cobró. Un intento que ofrecía varios
 * métodos no lo dice en el evento (el cargo no viene expandido): se lee el
 * método en la cuenta conectada.
 */
export async function resolverTipoMetodo(intent: any, account: string | undefined): Promise<string> {
    const directo = tipoMetodoDeIntent(intent);
    const tipos = Array.isArray(intent?.payment_method_types) ? intent.payment_method_types : [];
    const charge = typeof intent?.latest_charge === 'object' ? intent.latest_charge : null;
    if (tipos.length <= 1 || charge?.payment_method_details?.type || !account) return directo;
    const pmId = typeof intent?.payment_method === 'string' ? intent.payment_method : String(intent?.payment_method?.id || '');
    try {
        const pm = pmId ? await leerMetodo(account, pmId) : null;
        return pm?.resumen.tipo ?? directo;
    } catch {
        return directo;
    }
}

/**
 * Aplica un cobro agrupado confirmado a cada una de sus facturas. Devuelve las
 * que quedaron saldadas en ESTE asiento (para el evento `invoice.paid`, una
 * vez). Lanza si alguna factura no pudo recibir su parte: el webhook se
 * reintenta y el asiento, por ser idempotente, retoma donde quedó.
 */
export async function asentarPagoAgrupado(orgId: string, intent: any, account?: string): Promise<{ pago: PagoAgrupadoRow; saldadas: string[]; metodo: string } | null> {
    const pago = await leerPagoAgrupado(orgId, String(intent?.metadata?.pago_agrupado_id || ''));
    if (!pago) return null;
    const pi = String(intent?.id || '');
    if (pago.pi && pago.pi !== pi) throw new Error('El cobro agrupado está ligado a otro intento.');
    const currency = normalizeCurrency(String(intent?.currency || ''));
    const recibido = Number(intent?.amount_received ?? intent?.amount ?? 0);
    if (currency !== pago.currency || recibido !== toMinorUnits(pago.monto, pago.currency)) {
        throw new Error('El importe o la divisa del cobro no coinciden con su reparto.');
    }
    const saldadas: string[] = [];
    for (const a of pago.asignaciones) {
        const r = await applyPayment(orgId, a.documentoId, {
            monto: a.monto, currency, metodo: 'stripe', stripePaymentIntentId: pi, referencia: pi,
            nota: pago.asignaciones.length > 1 ? `Pago agrupado de ${pago.asignaciones.length} facturas` : null,
        });
        if (!r.ok) throw new Error(`No se pudo aplicar el cobro agrupado a la factura ${a.documentoId}: ${r.error}`);
        if (r.justPaid) saldadas.push(a.documentoId);
    }
    // Un reembolso que llegó antes que este asiento se reparte ahora.
    await allocatePendingInvoiceRefunds(orgId, pi);
    const metodo = await resolverTipoMetodo(intent, account);
    await withOrgTx(orgId,
        sql`update pagos_agrupados set estado = 'pagado', stripe_payment_intent_id = ${pi},
                   metodo = ${metodo}, error_codigo = null, updated_at = now()
             where id = ${pago.id} and org_id = ${orgId}`,
        sql`update documentos_fiscales set pago_en_proceso_pi = null, pago_en_proceso_at = null
             where org_id = ${orgId} and pago_en_proceso_pi = ${pi}`,
        // Un cobro que pasó cierra el ciclo de reintentos de ese cliente y divisa.
        ...(pago.clienteId ? [sql`delete from cobro_automatico_estado
             where org_id = ${orgId} and cliente_id = ${pago.clienteId} and currency = ${pago.currency}`] : []));
    return { pago, saldadas, metodo };
}

/**
 * Un débito bancario quedó en proceso (días): las facturas no se cobran otra
 * vez ni se anulan mientras tanto. Vale para el cobro agrupado y para el de una
 * sola factura desde /i.
 */
export async function marcarPagoEnProceso(orgId: string, intent: any): Promise<void> {
    const pi = String(intent?.id || '');
    if (!pi.startsWith('pi_')) return;
    const pagoId = String(intent?.metadata?.pago_agrupado_id || '');
    const docId = String(intent?.metadata?.documento_id || '');
    if (/^[0-9a-f-]{36}$/i.test(pagoId)) {
        await withOrgTx(orgId,
            sql`update pagos_agrupados set estado = 'procesando', metodo = ${tipoMetodoDeIntent(intent)}, updated_at = now()
                 where id = ${pagoId} and org_id = ${orgId} and estado = 'creado'
                   and (stripe_payment_intent_id is null or stripe_payment_intent_id = ${pi})`,
            sql`update documentos_fiscales d set pago_en_proceso_pi = ${pi}, pago_en_proceso_at = now()
                  from pago_agrupado_documentos a
                 where a.pago_id = ${pagoId} and a.org_id = ${orgId}
                   and d.id = a.documento_id and d.org_id = a.org_id and d.lifecycle = 'open'`);
        return;
    }
    if (/^[0-9a-f-]{36}$/i.test(docId)) {
        await withOrgTx(orgId, sql`
            update documentos_fiscales set pago_en_proceso_pi = ${pi}, pago_en_proceso_at = now()
             where id = ${docId} and org_id = ${orgId} and lifecycle = 'open'
               and (stripe_payment_intent_id = ${pi} or stripe_payment_intent_id is null)`);
    }
}

/** El pago de una sola factura desde /i dejó de estar en proceso (cobrado o fallido). */
export async function liberarPagoEnProceso(orgId: string, pi: string): Promise<void> {
    if (!pi.startsWith('pi_')) return;
    await withOrgTx(orgId, sql`
        update documentos_fiscales set pago_en_proceso_pi = null, pago_en_proceso_at = null
         where org_id = ${orgId} and pago_en_proceso_pi = ${pi}`);
}

export interface FalloCobro {
    codigo: string | null;
    declineCode: string | null;
    tipoMetodo: string;
    mensaje?: string | null;
}

/** El rechazo de un intento, en la forma que la política de reintentos entiende. */
export function falloDeIntent(intent: any): FalloCobro {
    const e = intent?.last_payment_error ?? {};
    return {
        codigo: e.code ? String(e.code) : null,
        declineCode: e.decline_code ? String(e.decline_code) : null,
        tipoMetodo: String(e.payment_method?.type || tipoMetodoDeIntent(intent)),
        mensaje: e.message ? String(e.message) : null,
    };
}

/**
 * Marca el cobro agrupado como fallido. Solo la PRIMERA transición cuenta: el
 * cron (que ve el rechazo síncrono de la tarjeta) y el webhook
 * (`payment_intent.payment_failed`) llegan los dos, y contar dos veces el mismo
 * rechazo adelantaría la política de reintentos.
 */
export async function fallarPagoAgrupado(orgId: string, pagoId: string, fallo: FalloCobro, ahora = new Date()): Promise<{
    pago: PagoAgrupadoRow; decision: Decision | null;
} | null> {
    const pago = await leerPagoAgrupado(orgId, pagoId);
    if (!pago) return null;
    const codigo = (fallo.declineCode || fallo.codigo || 'payment_failed').slice(0, 80);
    const [movido] = await withOrgTx(orgId,
        sql`update pagos_agrupados set estado = 'fallido', error_codigo = ${codigo}, updated_at = now()
             where id = ${pago.id} and org_id = ${orgId} and estado in ('creado', 'procesando')
             returning id`,
        ...(pago.pi ? [sql`update documentos_fiscales set pago_en_proceso_pi = null, pago_en_proceso_at = null
             where org_id = ${orgId} and pago_en_proceso_pi = ${pago.pi}`] : []));
    if (!movido.length) return { pago, decision: null };
    for (const a of pago.asignaciones) {
        await logInvoiceEvent(orgId, a.documentoId, 'payment_failed', pago.origen === 'automatico'
            ? `El cobro automático no pasó (ref: ${codigo})`
            : `El pago desde el portal no se completó (ref: ${codigo})`);
    }
    if (pago.origen !== 'automatico' || !pago.clienteId) return { pago, decision: null };
    const decision = await registrarFalloAutomatico(orgId, pago.clienteId, pago.currency, fallo, ahora);
    return { pago, decision };
}

/** Aplica la política de reintentos y deja el estado del ciclo. */
export async function registrarFalloAutomatico(orgId: string, clienteId: string, currency: string, fallo: FalloCobro, ahora = new Date()): Promise<Decision> {
    const [[estado]] = await withOrgTx(orgId, sql`
        select intentos, primer_intento_at from cobro_automatico_estado
         where org_id = ${orgId} and cliente_id = ${clienteId} and currency = ${currency}`);
    const intento = Number(estado?.intentos ?? 0) + 1;
    const primer = estado?.primer_intento_at ? new Date(estado.primer_intento_at) : ahora;
    const decision = decidirReintento({
        codigo: fallo.codigo, declineCode: fallo.declineCode, tipoMetodo: fallo.tipoMetodo,
        intento, primerIntentoAt: primer, ahora,
    });
    const siguiente = decision.accion === 'reintentar' ? decision.siguienteAt.toISOString() : null;
    const motivo = decision.accion === 'detener' ? decision.motivo : null;
    const codigo = (fallo.declineCode || fallo.codigo || 'payment_failed').slice(0, 80);
    await withOrgTx(orgId, sql`
        insert into cobro_automatico_estado
            (org_id, cliente_id, currency, intentos, primer_intento_at, siguiente_at, ultimo_codigo, ultimo_at, detenido_motivo, updated_at)
        values (${orgId}, ${clienteId}, ${currency}, ${intento}, ${primer.toISOString()}, ${siguiente}, ${codigo}, ${ahora.toISOString()}, ${motivo}, now())
        on conflict (org_id, cliente_id, currency) do update set
            intentos = excluded.intentos, siguiente_at = excluded.siguiente_at,
            ultimo_codigo = excluded.ultimo_codigo, ultimo_at = excluded.ultimo_at,
            detenido_motivo = excluded.detenido_motivo, updated_at = now()`);
    if (decision.accion === 'detener' && decision.desactivar) {
        await desactivarAutopay(orgId, clienteId, { por: 'sistema', motivo: decision.motivo });
    }
    return decision;
}

/**
 * Cancela un cobro agrupado que nadie confirmó (el cliente abrió el pago y lo
 * dejó). Falla cerrado: un intento en proceso o ya cobrado no se cancela, y el
 * llamador no debe cobrar esas facturas por otro lado.
 */
export async function cancelarPagoAgrupado(orgId: string, pago: PagoAgrupadoRow, account: string): Promise<'cancelado' | 'en_vuelo'> {
    if (pago.estado !== 'creado') return pago.estado === 'procesando' ? 'en_vuelo' : 'cancelado';
    if (pago.pi) {
        const intent = await stripe(`/v1/payment_intents/${encodeURIComponent(pago.pi)}`, undefined, 'GET', { stripeAccount: account });
        const status = String(intent?.status || '');
        if (['processing', 'requires_capture', 'succeeded'].includes(status)) return 'en_vuelo';
        if (status !== 'canceled') {
            await stripe(`/v1/payment_intents/${encodeURIComponent(pago.pi)}/cancel`, undefined, 'POST', {
                stripeAccount: account, idempotencyKey: `cord-grupo-cancel-${pago.id}`,
            });
        }
    }
    await withOrgTx(orgId, sql`
        update pagos_agrupados set estado = 'cancelado', updated_at = now()
         where id = ${pago.id} and org_id = ${orgId} and estado = 'creado'`);
    return 'cancelado';
}

// ── Cobro automático: alta y baja ───────────────────────────────────────────

export const AUTOPAY_TERMINOS_VERSION = 'cord-autopay-2026-10';

export interface ConsentimientoAutopay {
    version: string;
    aceptado_at: string;
    ip: string;
    user_agent: string;
    /** Intento que lo guarda (SetupIntent o PaymentIntent), para casar el alta. */
    intent_id?: string;
}

/**
 * Evidencia del consentimiento. Como en `tos_acceptance`, el cliente manda un
 * booleano y el servidor pone fecha, IP y navegador: una IP que llega del
 * navegador no es evidencia de nada.
 */
export function consentimientoAutopay(ip: string, userAgent: string | null, intentId?: string): ConsentimientoAutopay {
    return {
        version: AUTOPAY_TERMINOS_VERSION,
        aceptado_at: new Date().toISOString(),
        ip: String(ip || '').slice(0, 64),
        user_agent: String(userAgent || '').slice(0, 300),
        ...(intentId ? { intent_id: intentId } : {}),
    };
}

/**
 * Activa el cobro automático con un método YA guardado en el Customer del
 * cliente. Verifica en el proveedor que el método sea de ese Customer: el id
 * llega de un intento que pudo manipularse.
 */
export async function activarAutopay(orgId: string, clienteId: string, input: {
    account: string; paymentMethodId: string; consentimiento: ConsentimientoAutopay;
}): Promise<{ ok: true; metodo: ResumenMetodo } | { ok: false; error: string }> {
    const [[c]] = await withOrgTx(orgId, sql`
        select c.stripe_customer_id, c.stripe_customer_account, c.autopay_payment_method_id, o.cobro_automatico_permitido
          from clientes c join orgs o on o.id = c.org_id
         where c.id = ${clienteId} and c.org_id = ${orgId}`);
    if (!c) return { ok: false, error: 'Cliente no encontrado.' };
    if (c.cobro_automatico_permitido === false) return { ok: false, error: 'Este negocio no ofrece cobro automático.' };
    if (!c.stripe_customer_id || c.stripe_customer_account !== input.account) return { ok: false, error: 'El método no pertenece a este cliente.' };
    const pm = await leerMetodo(input.account, input.paymentMethodId);
    if (!pm || pm.customer !== c.stripe_customer_id) return { ok: false, error: 'El método no pertenece a este cliente.' };
    const anterior = c.autopay_payment_method_id ? String(c.autopay_payment_method_id) : null;
    await withOrgTx(orgId,
        sql`update clientes set autopay_activo = true, autopay_payment_method_id = ${pm.id},
                   autopay_metodo = ${JSON.stringify(pm.resumen)}::jsonb,
                   autopay_consentimiento = ${JSON.stringify(input.consentimiento)}::jsonb,
                   autopay_desactivado = null
             where id = ${clienteId} and org_id = ${orgId}`,
        // Un método nuevo reinicia el ciclo: lo que se detuvo por el método anterior ya no aplica.
        sql`delete from cobro_automatico_estado where org_id = ${orgId} and cliente_id = ${clienteId}`);
    // El método reemplazado se desvincula: no queda un segundo mandato vivo.
    if (anterior && anterior !== pm.id) await desvincularMetodo(input.account, anterior).catch(() => {});
    return { ok: true, metodo: pm.resumen };
}

/** Lo apaga el cliente, el negocio o el sistema (mandato revocado, tarjeta reportada). */
export async function desactivarAutopay(orgId: string, clienteId: string, input: {
    por: 'cliente' | 'negocio' | 'sistema'; motivo?: string | null; usuarioId?: string | null;
}): Promise<boolean> {
    const [[prev], movido] = await withOrgTx(orgId,
        sql`select autopay_payment_method_id as pm, stripe_customer_account as acct
              from clientes where id = ${clienteId} and org_id = ${orgId}`,
        sql`update clientes set autopay_activo = false, autopay_payment_method_id = null,
                   autopay_desactivado = ${JSON.stringify({
                       por: input.por, motivo: input.motivo ?? null, usuario_id: input.usuarioId ?? null, at: new Date().toISOString(),
                   })}::jsonb
             where id = ${clienteId} and org_id = ${orgId}
             returning id`,
        sql`delete from cobro_automatico_estado where org_id = ${orgId} and cliente_id = ${clienteId}
              and detenido_motivo is null`);
    if (!movido.length) return false;
    // Desvincular el método da de baja su mandato: es lo que el proveedor pide
    // cuando el titular revoca la autorización.
    if (prev?.pm && prev?.acct) await desvincularMetodo(String(prev.acct), String(prev.pm)).catch(() => {});
    return true;
}

/** Guarda el consentimiento PENDIENTE de un intento que va a guardar un método. */
export async function registrarConsentimientoPendiente(orgId: string, clienteId: string, consentimiento: ConsentimientoAutopay): Promise<void> {
    await withOrgTx(orgId, sql`
        update clientes set autopay_consentimiento_pendiente = ${JSON.stringify(consentimiento)}::jsonb
         where id = ${clienteId} and org_id = ${orgId}`);
}

/**
 * El intento que guardó el método trae su id; el alta se casa con el
 * consentimiento pendiente de ESE intento. Sin él no se activa nada: un método
 * guardado no es una autorización para cobrarle.
 */
export async function activarAutopayDesdeIntent(orgId: string, intent: any, account: string): Promise<boolean> {
    const clienteId = String(intent?.metadata?.cliente_id || '');
    const pmId = typeof intent?.payment_method === 'string' ? intent.payment_method : String(intent?.payment_method?.id || '');
    if (!/^[0-9a-f-]{36}$/i.test(clienteId) || !pmId) return false;
    const [[c]] = await withOrgTx(orgId, sql`
        select autopay_consentimiento_pendiente, autopay_consentimiento, autopay_payment_method_id, autopay_activo
          from clientes where id = ${clienteId} and org_id = ${orgId}`);
    if (!c) return false;
    // Reintento del mismo evento: ya quedó activo con este método.
    if (c.autopay_activo && c.autopay_payment_method_id === pmId
        && (c.autopay_consentimiento as ConsentimientoAutopay | null)?.intent_id === String(intent.id)) return true;
    const pendiente = c.autopay_consentimiento_pendiente as ConsentimientoAutopay | null;
    if (!pendiente || pendiente.intent_id !== String(intent.id)) return false;
    const r = await activarAutopay(orgId, clienteId, { account, paymentMethodId: pmId, consentimiento: pendiente });
    if (r.ok) {
        await withOrgTx(orgId, sql`
            update clientes set autopay_consentimiento_pendiente = null
             where id = ${clienteId} and org_id = ${orgId}
               and autopay_consentimiento_pendiente->>'intent_id' = ${String(intent.id)}`);
    }
    return r.ok;
}

/**
 * SetupIntent para guardar el método del cobro automático. La clave de
 * idempotencia es por cliente y ventana de 10 minutos: un doble clic devuelve
 * el mismo intento; volver más tarde abre uno nuevo.
 */
export async function crearSetupAutopay(orgId: string, input: {
    clienteId: string; customerId: string; account: string; metodos: MetodoCobro[];
}): Promise<any> {
    if (!input.metodos.length) throw new Error('Sin métodos que se puedan guardar.');
    const form: Record<string, string> = {
        customer: input.customerId,
        usage: 'off_session',
        'metadata[cord_flow]': 'autopay',
        'metadata[cliente_id]': input.clienteId,
    };
    input.metodos.forEach((t, i) => { form[`payment_method_types[${i}]`] = t; });
    const ventana = Math.floor(Date.now() / 600_000);
    const si = await stripe('/v1/setup_intents', form, 'POST', {
        stripeAccount: input.account,
        idempotencyKey: `cord-autopay-${input.clienteId}-${input.metodos.join('-')}-${ventana}`,
    });
    if (!si?.id || !si?.client_secret) throw new Error('El proveedor no devolvió el intento.');
    return si;
}

/** Un mandato inactivo (revocado, disputado, cuenta bloqueada) apaga el cobro automático que lo usa. */
export async function desactivarPorMandato(orgId: string, paymentMethodId: string): Promise<number> {
    if (!/^pm_[A-Za-z0-9]+$/.test(paymentMethodId)) return 0;
    const [rows] = await withOrgTx(orgId, sql`
        select id from clientes where org_id = ${orgId} and autopay_payment_method_id = ${paymentMethodId}`);
    for (const r of rows) await desactivarAutopay(orgId, String(r.id), { por: 'sistema', motivo: 'mandato_revocado' });
    return rows.length;
}


import { sql, withOrgTx } from '../db';
import { currencyDecimals } from '../currency';
import { logInvoiceEvent } from './timeline';

export const invoicePaymentLock = (orgId: string, pi: string) => sql`
  select pg_advisory_xact_lock(hashtextextended(${`invoice-payment:${orgId}:${pi}`}, 0))`;

/** Serializa todos los cambios de saldo y reservas sobre la factura original. */
export const invoiceBalanceLock = (orgId: string, id: string) => sql`
  select id from documentos_fiscales where id = ${id} and org_id = ${orgId} for update`;

/** Ejecutar después del lock, en un comando separado: snapshot fresco al despertar. */
export const invoiceBalanceQuery = (orgId: string, id: string) => sql`
  with amounts as (
    select d.id, d.lifecycle as previous_lifecycle,
      coalesce((select sum(p.monto) from documento_pagos p
        where p.documento_id = d.id and p.org_id = d.org_id and p.currency = d.currency), 0) as paid,
      coalesce((select sum(c.total) from documentos_fiscales c
        where c.credit_note_of = d.id and c.org_id = d.org_id and c.currency = d.currency
          and c.status = 'issued' and c.lifecycle <> 'void'), 0) as credited,
      -- Un reembolso REPARTIDO cuenta lo que le tocó a esta factura.
      coalesce((select sum(a.monto) from documento_reembolso_asignaciones a
        join documento_reembolsos r on r.org_id = a.org_id and r.stripe_refund_id = a.stripe_refund_id
        where a.documento_id = d.id and a.org_id = d.org_id and a.currency = d.currency
          and r.status = 'succeeded'), 0)
      -- Sin reparto, el reembolso solo es inequívoco si su cobro pagó ESTA
      -- factura y ninguna otra (todo cobro anterior al portal, y Mercado Pago).
      + coalesce((select sum(r.monto) from documento_reembolsos r
        where r.org_id = d.org_id and r.currency = d.currency and r.status = 'succeeded'
          and not exists (select 1 from documento_reembolso_asignaciones a
            where a.org_id = r.org_id and a.stripe_refund_id = r.stripe_refund_id)
          and exists (select 1 from documento_pagos p where p.documento_id = d.id
            and p.org_id = d.org_id and p.currency = r.currency
            -- El reembolso se liga al pago por el id del riel que cobró.
            and (p.stripe_payment_intent_id = r.stripe_payment_intent_id
              or p.mp_payment_id = r.mp_payment_id))
          and not exists (select 1 from documento_pagos p where p.documento_id <> d.id
            and p.org_id = d.org_id
            and (p.stripe_payment_intent_id = r.stripe_payment_intent_id
              or p.mp_payment_id = r.mp_payment_id))), 0) as refunded
    from documentos_fiscales d where d.id = ${id} and d.org_id = ${orgId}
      and d.credit_note_of is null and d.document_type not in ('credit_note', 'cfdi_egreso')
      -- La factura global documenta ventas ya cobradas en su cotización: no
      -- tiene ledger propio que recalcular (fiscal/factura-global.ts).
      and d.informacion_global is null
  )
  update documentos_fiscales d set
    amount_paid = a.paid, amount_credited = a.credited, amount_refunded = a.refunded,
    -- Un CFDI ya sustituido por otro timbrado no se cobra: su saldo y sus pagos
    -- viven en el que lo sustituye (fiscal/sustitucion.ts), aunque el SAT aún
    -- no confirme su cancelación.
    amount_remaining = case when d.sustituida_por is not null then 0
      else greatest(d.total - a.credited - a.paid + a.refunded, 0) end,
    -- Una factura anulada no debe nada: todo lo que le llegó (un pago tardío
    -- sobre un cobro que ya estaba en vuelo) se devuelve completo.
    refund_due = case when d.lifecycle = 'void' or d.sustituida_por is not null then greatest(a.paid - a.refunded, 0)
      else greatest(a.paid - a.refunded - greatest(d.total - a.credited, 0), 0) end,
    lifecycle = case when d.lifecycle in ('void', 'draft') then d.lifecycle
      when d.sustituida_por is not null then 'paid'
      when d.total - a.credited - a.paid + a.refunded <= 0 then 'paid'
      when d.lifecycle = 'uncollectible' then 'uncollectible' else 'open' end,
    updated_at = now()
  from amounts a where d.id = a.id and d.org_id = ${orgId}
  returning d.amount_paid, d.amount_remaining, d.amount_credited, d.amount_refunded,
    d.refund_due, d.lifecycle, a.previous_lifecycle`;

export async function reconcileInvoice(orgId: string, id: string) {
  const [, rows] = await withOrgTx(orgId, invoiceBalanceLock(orgId, id), invoiceBalanceQuery(orgId, id));
  return rows[0];
}

/**
 * Reparte UN reembolso de Stripe entre las facturas que pagó su cobro. Un cobro
 * agrupado (portal, cobro automático) paga varias facturas con un solo
 * PaymentIntent; sin reparto, devolver 50 reabría 50 en cada una.
 *
 * El orden es el inverso al de aplicación: lo último que se pagó es lo primero
 * que se devuelve, hasta lo que cada factura recibió de ese cobro menos lo que
 * otros reembolsos vivos ya le asignaron. Se reparte COMPLETO o no se reparte:
 * si el webhook del reembolso llegó antes que el del pago, la capacidad no
 * alcanza y el reparto se hace al asentar el cobro
 * (`allocatePendingInvoiceRefunds`). Ejecutar bajo `invoicePaymentLock`.
 *
 * Un reembolso pedido DESDE una factura en Cord (solicitud de alcance
 * 'factura', `src/lib/cobros/reembolsos.ts`) va solo a esa factura: la persona
 * eligió cuál devolver, y el orden inverso le reabriría otra. Si esa factura ya
 * no tiene el pago (se movió a un sustituto), rige la regla general.
 */
export const allocateInvoiceRefund = (orgId: string, refundId: string) => sql`
  with r as (
    select stripe_refund_id, stripe_payment_intent_id, monto, currency from documento_reembolsos
     where org_id = ${orgId} and stripe_refund_id = ${refundId}
       and status not in ('failed', 'canceled')
       and not exists (select 1 from documento_reembolso_asignaciones a
         where a.org_id = ${orgId} and a.stripe_refund_id = ${refundId})
  ), objetivo as (
    select s.documento_id from documento_reembolso_solicitudes s, r
     where s.org_id = ${orgId} and s.stripe_refund_id = r.stripe_refund_id and s.alcance = 'factura'
       and exists (select 1 from documento_pagos p where p.org_id = ${orgId} and p.documento_id = s.documento_id
         and p.stripe_payment_intent_id = r.stripe_payment_intent_id)
     limit 1
  ), cap as (
    select p.documento_id, max(p.aplicado_at) as orden_at,
           sum(p.monto) - coalesce((select sum(a.monto) from documento_reembolso_asignaciones a
             join documento_reembolsos o on o.org_id = a.org_id and o.stripe_refund_id = a.stripe_refund_id
             where a.org_id = ${orgId} and a.documento_id = p.documento_id
               and o.stripe_payment_intent_id = r.stripe_payment_intent_id
               and o.status not in ('failed', 'canceled')), 0) as capacidad
      from documento_pagos p, r
     where p.org_id = ${orgId} and p.stripe_payment_intent_id = r.stripe_payment_intent_id
       and p.currency = r.currency
       and (not exists (select 1 from objetivo) or p.documento_id = (select documento_id from objetivo))
     group by p.documento_id, r.stripe_payment_intent_id
  ), orden as (
    select documento_id, greatest(capacidad, 0) as capacidad,
           coalesce(sum(greatest(capacidad, 0)) over (
             order by orden_at desc, documento_id desc rows between unbounded preceding and 1 preceding), 0) as previo
      from cap
  )
  insert into documento_reembolso_asignaciones (org_id, stripe_refund_id, documento_id, monto, currency)
  select ${orgId}, r.stripe_refund_id, o.documento_id, least(o.capacidad, r.monto - o.previo), r.currency
    from orden o, r
   where o.capacidad > 0 and r.monto - o.previo > 0
     and (select coalesce(sum(capacidad), 0) from orden) >= r.monto
  on conflict do nothing`;

/**
 * Reparte los reembolsos de un cobro que quedaron sin repartir porque llegaron
 * antes que su pago, y reconcilia las facturas que tocó. Lo llama el asiento de
 * un cobro agrupado, después de aplicar todas sus facturas.
 */
export async function allocatePendingInvoiceRefunds(orgId: string, paymentIntentId: string): Promise<void> {
  const [, pendientes] = await withOrgTx(orgId, invoicePaymentLock(orgId, paymentIntentId), sql`
    select stripe_refund_id from documento_reembolsos r
     where r.org_id = ${orgId} and r.stripe_payment_intent_id = ${paymentIntentId}
       and r.status not in ('failed', 'canceled')
       and not exists (select 1 from documento_reembolso_asignaciones a
         where a.org_id = r.org_id and a.stripe_refund_id = r.stripe_refund_id)
     order by r.created_at, r.stripe_refund_id`);
  if (!pendientes.length) return;
  for (const row of pendientes) {
    await withOrgTx(orgId, invoicePaymentLock(orgId, paymentIntentId), allocateInvoiceRefund(orgId, String(row.stripe_refund_id)));
  }
  const [docs] = await withOrgTx(orgId, sql`
    select distinct documento_id from documento_pagos
     where org_id = ${orgId} and stripe_payment_intent_id = ${paymentIntentId}`);
  for (const doc of docs) await reconcileInvoice(orgId, String(doc.documento_id));
}

/** Qué cambió con UNA llamada: lo que el historial de la factura cuenta una sola vez. */
export interface InvoiceRefundOutcome {
  /** El reembolso pasó a efectivo o a fallido en ESTA llamada (null: nada nuevo). */
  transicion: 'succeeded' | 'failed' | null;
  /** Facturas cuyo saldo se recalculó. */
  documentos: string[];
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const solicitudValida = (id: string | null | undefined) => (id && UUID_RE.test(id) ? id : null);

// Antes y después del upsert en la MISMA sentencia: el CTE `prev` ve la fila
// como estaba. Bajo `invoicePaymentLock` el webhook y la ruta se serializan, así
// que solo uno de los dos ve la transición y el historial no la cuenta dos veces.
const transicionDe = (antes: unknown, despues: unknown): InvoiceRefundOutcome['transicion'] => {
  const d = despues === null || despues === undefined ? null : String(despues);
  if (!d || d === antes) return null;
  if (d === 'succeeded') return 'succeeded';
  if ((d === 'failed' || d === 'canceled') && antes !== 'failed' && antes !== 'canceled') return 'failed';
  return null;
};

const importe = (monto: number, currency: string) => {
  const dec = currencyDecimals(currency);
  return `${Number(monto).toFixed(dec)} ${currency}`;
};

/** Una línea en el historial de cada factura tocada, solo en la transición. */
async function logRefundTransition(orgId: string, transicion: InvoiceRefundOutcome['transicion'], partes: Array<{ documentoId: string; monto: number }>, currency: string) {
  if (!transicion) return;
  for (const p of partes) {
    await logInvoiceEvent(orgId, p.documentoId, 'refund', transicion === 'succeeded'
      ? `Reembolso de ${importe(p.monto, currency)}`
      : `El reembolso de ${importe(p.monto, currency)} no se completó`);
  }
}

/**
 * Conserva reembolsos aun si su webhook llega antes que el pago de la factura.
 *
 * Es el ÚNICO camino del ledger para un reembolso de Stripe: lo usan el webhook
 * (reembolsos hechos dentro o fuera de Cord) y la ruta de reembolso de la
 * factura. La idempotencia es el índice único `(org_id, stripe_refund_id)`: el
 * webhook que llega después de un reembolso pedido en Cord solo actualiza su
 * estado. `solicitudId` (metadata `cord_reembolso` del reembolso) liga la
 * solicitud hecha en Cord ANTES de repartir, para que el reparto la respete
 * llegue primero quien llegue.
 */
export async function recordInvoiceRefund(orgId: string, refund: {
  id: string; paymentIntentId: string; amount: number; currency: string; status: string; eventCreated: number;
  solicitudId?: string | null;
}): Promise<InvoiceRefundOutcome> {
  if (!refund.id.startsWith('re_') || !refund.paymentIntentId.startsWith('pi_')
    || !Number.isFinite(refund.amount) || refund.amount <= 0 || !Number.isSafeInteger(refund.eventCreated) || refund.eventCreated < 0
    || !['pending', 'requires_action', 'succeeded', 'failed', 'canceled'].includes(refund.status)) {
    throw new Error('El reembolso no contiene un desglose válido.');
  }
  const solicitud = solicitudValida(refund.solicitudId);
  // El llamador consulta el estado vigente al proveedor. No se usan snapshots
  // antiguos del webhook para decidir qué dinero ya salió.
  const [, , [cambio], , docs, partes] = await withOrgTx(orgId, invoicePaymentLock(orgId, refund.paymentIntentId),
  sql`
    update documento_reembolso_solicitudes set stripe_refund_id = ${refund.id}, estado = 'registrada', updated_at = now()
     where org_id = ${orgId} and id = ${solicitud}::uuid and proveedor = 'stripe'
       and stripe_payment_intent_id = ${refund.paymentIntentId}
       and (stripe_refund_id is null or stripe_refund_id = ${refund.id})`,
  sql`
    with prev as (
      select status from documento_reembolsos where org_id = ${orgId} and stripe_refund_id = ${refund.id}
    ), up as (
      insert into documento_reembolsos (org_id, stripe_refund_id, stripe_payment_intent_id, monto, currency, status, provider_event_created)
      values (${orgId}, ${refund.id}, ${refund.paymentIntentId}, ${refund.amount}, ${refund.currency}, ${refund.status}, ${refund.eventCreated})
      on conflict (org_id, stripe_refund_id) where stripe_refund_id is not null do update set
        status = excluded.status, provider_event_created = excluded.provider_event_created, updated_at = now()
      where documento_reembolsos.stripe_payment_intent_id = excluded.stripe_payment_intent_id
        and documento_reembolsos.currency = excluded.currency and documento_reembolsos.monto = excluded.monto
        and documento_reembolsos.provider_event_created <= excluded.provider_event_created
      returning status
    )
    select (select status from prev) as antes, (select status from up) as despues`,
  allocateInvoiceRefund(orgId, refund.id),
  sql`
    select distinct documento_id from documento_pagos
    where org_id = ${orgId} and stripe_payment_intent_id = ${refund.paymentIntentId} and currency = ${refund.currency}`,
  sql`
    select documento_id, monto from documento_reembolso_asignaciones
     where org_id = ${orgId} and stripe_refund_id = ${refund.id}
     order by documento_id`);
  const documentos = docs.map((doc: any) => String(doc.documento_id));
  for (const doc of documentos) await reconcileInvoice(orgId, doc);
  const transicion = transicionDe(cambio?.antes, cambio?.despues);
  await logRefundTransition(orgId, transicion,
    (partes ?? []).map((p: any) => ({ documentoId: String(p.documento_id), monto: Number(p.monto) })), refund.currency);
  return { transicion, documentos };
}

/** Mismo contrato que `recordInvoiceRefund`, con el par de ids de Mercado Pago. */
export async function recordMpInvoiceRefund(orgId: string, refund: {
  id: string; paymentId: string; amount: number; currency: string; status: string;
  solicitudId?: string | null;
}): Promise<InvoiceRefundOutcome> {
  if (!refund.id || !refund.paymentId || !Number.isFinite(refund.amount) || refund.amount <= 0
    || !/^[A-Z]{3}$/.test(refund.currency)
    || !['pending', 'succeeded', 'failed'].includes(refund.status)) {
    throw new Error('El reembolso no contiene un desglose válido.');
  }
  const solicitud = solicitudValida(refund.solicitudId);
  const [, , [cambio], docs] = await withOrgTx(orgId, invoicePaymentLock(orgId, refund.paymentId),
  sql`
    update documento_reembolso_solicitudes set mp_refund_id = ${refund.id}, estado = 'registrada', updated_at = now()
     where org_id = ${orgId} and id = ${solicitud}::uuid and proveedor = 'mercadopago'
       and mp_payment_id = ${refund.paymentId}
       and (mp_refund_id is null or mp_refund_id = ${refund.id})`,
  sql`
    with prev as (
      select status from documento_reembolsos where org_id = ${orgId} and mp_refund_id = ${refund.id}
    ), up as (
      insert into documento_reembolsos (org_id, mp_refund_id, mp_payment_id, monto, currency, status)
      values (${orgId}, ${refund.id}, ${refund.paymentId}, ${refund.amount}, ${refund.currency}, ${refund.status})
      on conflict (org_id, mp_refund_id) where mp_refund_id is not null do update set
        status = excluded.status, updated_at = now()
      where documento_reembolsos.mp_payment_id = excluded.mp_payment_id
        and documento_reembolsos.currency = excluded.currency and documento_reembolsos.monto = excluded.monto
      returning status
    )
    select (select status from prev) as antes, (select status from up) as despues`,
  sql`
    select distinct documento_id from documento_pagos
    where org_id = ${orgId} and mp_payment_id = ${refund.paymentId} and currency = ${refund.currency}`);
  const documentos = docs.map((doc: any) => String(doc.documento_id));
  for (const doc of documentos) await reconcileInvoice(orgId, doc);
  const transicion = transicionDe(cambio?.antes, cambio?.despues);
  // Mercado Pago no reparte: un pago de Mercado Pago paga UNA factura.
  await logRefundTransition(orgId, transicion,
    documentos.length === 1 ? [{ documentoId: documentos[0], monto: refund.amount }] : [], refund.currency);
  return { transicion, documentos };
}

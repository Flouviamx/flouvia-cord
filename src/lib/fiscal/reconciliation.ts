import { sql, withOrgTx } from '../db';

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
      coalesce((select sum(r.monto) from documento_reembolsos r
        where r.org_id = d.org_id and r.currency = d.currency and r.status = 'succeeded'
          and exists (select 1 from documento_pagos p where p.documento_id = d.id
            and p.org_id = d.org_id and p.currency = r.currency
            and p.stripe_payment_intent_id = r.stripe_payment_intent_id)), 0) as refunded
    from documentos_fiscales d where d.id = ${id} and d.org_id = ${orgId}
      and d.credit_note_of is null and d.document_type not in ('credit_note', 'cfdi_egreso')
  )
  update documentos_fiscales d set
    amount_paid = a.paid, amount_credited = a.credited, amount_refunded = a.refunded,
    amount_remaining = greatest(d.total - a.credited - a.paid + a.refunded, 0),
    refund_due = greatest(a.paid - a.refunded - greatest(d.total - a.credited, 0), 0),
    lifecycle = case when d.lifecycle in ('void', 'draft') then d.lifecycle
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

/** Conserva reembolsos aun si su webhook llega antes que el pago de la factura. */
export async function recordInvoiceRefund(orgId: string, refund: {
  id: string; paymentIntentId: string; amount: number; currency: string; status: string; eventCreated: number;
}) {
  if (!refund.id.startsWith('re_') || !refund.paymentIntentId.startsWith('pi_')
    || !Number.isFinite(refund.amount) || refund.amount <= 0 || !Number.isSafeInteger(refund.eventCreated) || refund.eventCreated < 0
    || !['pending', 'requires_action', 'succeeded', 'failed', 'canceled'].includes(refund.status)) {
    throw new Error('El reembolso no contiene un desglose válido.');
  }
  // El llamador consulta el estado vigente al proveedor. No se usan snapshots
  // antiguos del webhook para decidir qué dinero ya salió.
  const [, , docs] = await withOrgTx(orgId, invoicePaymentLock(orgId, refund.paymentIntentId), sql`
    insert into documento_reembolsos (org_id, stripe_refund_id, stripe_payment_intent_id, monto, currency, status, provider_event_created)
    values (${orgId}, ${refund.id}, ${refund.paymentIntentId}, ${refund.amount}, ${refund.currency}, ${refund.status}, ${refund.eventCreated})
    on conflict (org_id, stripe_refund_id) do update set
      status = excluded.status, provider_event_created = excluded.provider_event_created, updated_at = now()
    where documento_reembolsos.stripe_payment_intent_id = excluded.stripe_payment_intent_id
      and documento_reembolsos.currency = excluded.currency and documento_reembolsos.monto = excluded.monto
      and documento_reembolsos.provider_event_created <= excluded.provider_event_created`,
  sql`
    select distinct documento_id from documento_pagos
    where org_id = ${orgId} and stripe_payment_intent_id = ${refund.paymentIntentId} and currency = ${refund.currency}`);
  for (const doc of docs) await reconcileInvoice(orgId, String(doc.documento_id));
}

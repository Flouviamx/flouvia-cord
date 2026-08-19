// Aplicación de pagos a una factura.
//
// `cotizacion_cobros` es el ledger de cobros contra la COTIZACIÓN (anticipo,
// saldo, cuotas). Este módulo lleva el ledger contra el DOCUMENTO: es el que
// responde "¿cuánto le queda a esta factura?", que es la pregunta que la hosted
// invoice page, el aging y cobranza necesitan y que antes nadie podía contestar
// porque la factura no sabía si estaba pagada.
//
// El saldo NUNCA se incrementa: se recalcula desde la suma del ledger. Un
// contador incremental y un ledger son dos fuentes para el mismo número, y en
// cuanto se separan (un reintento, una fila borrada) el saldo miente sin avisar.

import { sql, withOrgTx } from '../db';
import { normalizeCurrency } from '../currency';

export interface ApplyPaymentInput {
  monto: number;
  currency: string;
  metodo?: string;
  referencia?: string | null;
  stripePaymentIntentId?: string | null;
  cobroId?: string | null;
  nota?: string | null;
  registradoPor?: string | null;
}

export interface ApplyPaymentResult {
  ok: boolean;
  error?: string;
  /** true cuando el pago ya estaba aplicado: reintento de Stripe, no un cobro nuevo. */
  duplicate?: boolean;
  amountPaid?: number;
  amountRemaining?: number;
  lifecycle?: string;
  /** true solo en la transición a `paid`, para disparar el webhook una vez. */
  justPaid?: boolean;
}

const money = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

/**
 * Registra un pago contra una factura y recalcula su saldo. Idempotente por
 * `stripe_payment_intent_id`: Stripe reintenta sus webhooks por diseño, y sin
 * esa garantía un reintento cobraría dos veces contra el mismo saldo.
 */
export async function applyPayment(
  orgId: string,
  documentoId: string,
  input: ApplyPaymentInput,
): Promise<ApplyPaymentResult> {
  const monto = money(Number(input.monto) || 0);
  if (!(monto > 0)) return { ok: false, error: 'El monto del pago debe ser mayor a cero.' };

  const [docRows] = await withOrgTx(orgId, sql`
    select id, lifecycle, status, currency, total, amount_paid
      from documentos_fiscales
     where id = ${documentoId} and org_id = ${orgId}
     limit 1`);
  const doc = docRows[0];
  if (!doc) return { ok: false, error: 'Factura no encontrada.' };

  // Un borrador no se cobra: todavía no existe como documento para el cliente.
  // Una anulada tampoco: aceptar dinero contra una factura muerta deja un cobro
  // sin documento que lo respalde.
  if (doc.lifecycle === 'draft') {
    return { ok: false, error: 'Esta factura todavía es un borrador. Emítela antes de registrar un pago.' };
  }
  if (doc.lifecycle === 'void') {
    return { ok: false, error: 'Esta factura está anulada y no admite pagos.' };
  }

  // Regla 21: un monto sin divisa es un número. Un pago en otra divisa que la
  // factura no se "convierte" en silencio — eso inventaría un tipo de cambio.
  const docCurrency = normalizeCurrency((doc.currency as string) || 'MXN');
  const payCurrency = normalizeCurrency(input.currency || docCurrency, docCurrency);
  if (payCurrency !== docCurrency) {
    return {
      ok: false,
      error: `Esta factura está en ${docCurrency} y el pago viene en ${payCurrency}. Registra el pago en la divisa de la factura.`,
    };
  }

  const total = money(Number(doc.total) || 0);
  const pi = input.stripePaymentIntentId || null;

  // Insertar + recalcular + promover, en UNA transacción. El recálculo lee el
  // ledger completo (incluida la fila recién insertada) y el lifecycle se
  // deriva de ese número, nunca de un incremento.
  const [inserted, updated] = await withOrgTx(orgId,
    sql`insert into documento_pagos (
          org_id, documento_id, cobro_id, monto, currency, metodo,
          referencia, stripe_payment_intent_id, nota, registrado_por
        )
        values (
          ${orgId}, ${documentoId}, ${input.cobroId || null}, ${monto}, ${payCurrency},
          ${input.metodo || 'manual'}, ${input.referencia || null}, ${pi},
          ${input.nota || null}, ${input.registradoPor || null}
        )
        on conflict (documento_id, stripe_payment_intent_id) where stripe_payment_intent_id is not null
        do nothing
        returning id`,
    sql`with ledger as (
          select coalesce(sum(monto), 0) as pagado
            from documento_pagos
           where documento_id = ${documentoId} and org_id = ${orgId}
        )
        update documentos_fiscales d
           set amount_paid = ledger.pagado,
               amount_remaining = greatest(${total}::numeric - ledger.pagado, 0),
               -- Una factura con saldo cero está pagada. Se respeta 'void' y
               -- 'uncollectible': son decisiones humanas que un pago parcial
               -- posterior no debe revertir en silencio.
               lifecycle = case
                 when d.lifecycle in ('void', 'draft') then d.lifecycle
                 when ledger.pagado >= ${total}::numeric then 'paid'
                 else 'open'
               end,
               updated_at = now()
          from ledger
         where d.id = ${documentoId} and d.org_id = ${orgId}
        returning d.amount_paid, d.amount_remaining, d.lifecycle`,
  );

  const duplicate = pi !== null && inserted.length === 0;
  const row = updated[0];
  if (!row) return { ok: false, error: 'No se pudo actualizar el saldo de la factura.' };

  const lifecycle = String(row.lifecycle);
  return {
    ok: true,
    duplicate,
    amountPaid: money(Number(row.amount_paid) || 0),
    amountRemaining: money(Number(row.amount_remaining) || 0),
    lifecycle,
    // Solo la transición cuenta: sin esto, cada reintento de Stripe sobre una
    // factura ya saldada dispararía `invoice.paid` otra vez.
    justPaid: !duplicate && lifecycle === 'paid' && money(Number(doc.amount_paid) || 0) < total,
  };
}

/** Pagos aplicados a una factura, para la hosted page y el detalle del vendedor. */
export async function getInvoicePayments(orgId: string, documentoId: string) {
  const [rows] = await withOrgTx(orgId, sql`
    select id, monto, currency, metodo, referencia, nota, aplicado_at
      from documento_pagos
     where documento_id = ${documentoId} and org_id = ${orgId}
     order by aplicado_at asc`);
  return rows.map((r: any) => ({
    id: r.id as string,
    monto: Number(r.monto) || 0,
    currency: (r.currency as string) || null,
    metodo: (r.metodo as string) || 'manual',
    referencia: (r.referencia as string) || null,
    nota: (r.nota as string) || null,
    aplicadoAt: r.aplicado_at as string,
  }));
}

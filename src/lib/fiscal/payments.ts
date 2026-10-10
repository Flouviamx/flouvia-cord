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
import { logInvoiceEvent } from './timeline';
import { after } from '../after';
import { invoiceBalanceLock, invoiceBalanceQuery, invoicePaymentLock } from './reconciliation';

export interface ApplyPaymentInput {
  monto: number;
  currency: string;
  metodo?: string;
  referencia?: string | null;
  stripePaymentIntentId?: string | null;
  /** Idempotencia del carril de Mercado Pago: su id de pago, no el de Stripe. */
  mpPaymentId?: string | null;
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
 * Vocabulario CERRADO de un pago registrado a mano. `stripe` y `mercadopago`
 * quedan reservados a los webhooks de cada riel: antes el campo era texto libre
 * y un pago manual podía etiquetarse "stripe" en el ledger que ve el cliente en
 * la página de la factura, como si el cobro hubiera pasado por el proveedor.
 */
export const MANUAL_PAYMENT_METHODS = ['transferencia', 'efectivo', 'cheque', 'tarjeta', 'otro'] as const;

export function manualPaymentMethod(raw: unknown): string {
  const value = String(raw ?? '').trim().toLowerCase();
  if (!value || value === 'manual') return 'transferencia';
  return (MANUAL_PAYMENT_METHODS as readonly string[]).includes(value) ? value : 'otro';
}

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
    select id, lifecycle, status, currency, total, amount_paid, credit_note_of, document_type,
           informacion_global, sustituida_por
      from documentos_fiscales
     where id = ${documentoId} and org_id = ${orgId}
     limit 1`);
  const doc = docRows[0];
  if (!doc) return { ok: false, error: 'Factura no encontrada.' };

  if (doc.credit_note_of || ['cfdi_egreso', 'credit_note'].includes(String(doc.document_type))) {
    return { ok: false, error: 'Una nota de crédito no admite cobros.' };
  }
  // La factura global documenta ventas que ya se cobraron en su cotización:
  // un cobro aquí sería el mismo dinero contado dos veces.
  if (doc.informacion_global) {
    return { ok: false, error: 'La factura global documenta ventas ya cobradas: no admite cobros.' };
  }
  // Un CFDI ya sustituido no se cobra: su saldo vive en el que lo sustituye.
  // Un pago del PROVEEDOR que llegue tarde sí se asienta (como en una anulada)
  // para que el negocio vea que debe devolverlo o aplicarlo a la sustituta.
  const replaced = !!doc.sustituida_por;
  if (replaced && !input.stripePaymentIntentId && !input.mpPaymentId) {
    return { ok: false, error: 'Esta factura fue sustituida por otra: registra el pago en la factura que la sustituye.' };
  }

  // Un borrador no se cobra: todavía no existe como documento para el cliente.
  // Una anulada tampoco: aceptar dinero contra una factura muerta deja un cobro
  // sin documento que lo respalde.
  if (doc.lifecycle === 'draft') {
    return { ok: false, error: 'Esta factura todavía es un borrador. Emítela antes de registrar un pago.' };
  }
  // Un pago MANUAL no se registra contra una factura anulada. Uno del PROVEEDOR
  // (Stripe, Mercado Pago) sí: ese dinero ya llegó a la cuenta del negocio, y
  // rechazarlo hacía que su webhook fallara para siempre sin que nadie viera
  // que hay que devolverlo. Se asienta y el saldo lo marca como `refund_due`.
  const latePaymentOnVoid = doc.lifecycle === 'void' || replaced;
  if (latePaymentOnVoid && !input.stripePaymentIntentId && !input.mpPaymentId) {
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

  const pi = input.stripePaymentIntentId || null;
  const mp = input.mpPaymentId || null;

  // Sustituida: sus pagos se mudaron al sustituto (y de ahí, si a su vez se
  // sustituyó, al siguiente). Un reintento del webhook de un cobro que YA está
  // ahí es un duplicado, no un pago tardío que haya que devolver.
  if (replaced && (pi || mp)) {
    const [yaAplicado] = await withOrgTx(orgId, sql`
      with recursive cadena(id, n) as (
        select d.sustituida_por, 1 from documentos_fiscales d
         where d.id = ${documentoId} and d.org_id = ${orgId} and d.sustituida_por is not null
        union all
        select d.sustituida_por, c.n + 1 from documentos_fiscales d join cadena c on d.id = c.id
         where d.org_id = ${orgId} and d.sustituida_por is not null and c.n < 10
      )
      select p.documento_id from documento_pagos p join cadena c on c.id = p.documento_id
       where p.org_id = ${orgId}
         and (${pi}::text is not null and p.stripe_payment_intent_id = ${pi}
           or ${mp}::text is not null and p.mp_payment_id = ${mp})
       limit 1`);
    if (yaAplicado.length) {
      return {
        ok: true, duplicate: true,
        amountPaid: money(Number(doc.amount_paid) || 0), amountRemaining: 0,
        lifecycle: String(doc.lifecycle), justPaid: false,
      };
    }
  }
  // Un pago del proveedor llega con la llave de SU riel. Las dos columnas
  // existen por separado para que cada índice único sea el que hace el trabajo;
  // con una sola compartida, dos ids distintos podrían chocar entre rieles.
  const proveedorId = pi || mp;

  // Insertar + recalcular + promover, en UNA transacción. El recálculo lee el
  // ledger completo (incluida la fila recién insertada) y el lifecycle se
  // deriva de ese número, nunca de un incremento.
  const [, , inserted, updated, recorded] = await withOrgTx(orgId,
    invoicePaymentLock(orgId, proveedorId || documentoId), invoiceBalanceLock(orgId, documentoId),
    mp
      ? sql`insert into documento_pagos (
              org_id, documento_id, cobro_id, monto, currency, metodo,
              referencia, mp_payment_id, nota, registrado_por
            )
            select
              ${orgId}, ${documentoId}, ${input.cobroId || null}, ${monto}, ${payCurrency},
              ${input.metodo || 'manual'}, ${input.referencia || null}, ${mp},
              ${input.nota || null}, ${input.registradoPor || null}
            from documentos_fiscales d
            where d.id = ${documentoId} and d.org_id = ${orgId} and d.status in ('issued', 'cancelled')
              and d.lifecycle <> 'draft' and d.credit_note_of is null
              and d.document_type not in ('credit_note', 'cfdi_egreso') and d.currency = ${payCurrency}
              and d.informacion_global is null
            on conflict (documento_id, mp_payment_id) where mp_payment_id is not null
            do nothing
            returning id`
      : sql`insert into documento_pagos (
              org_id, documento_id, cobro_id, monto, currency, metodo,
              referencia, stripe_payment_intent_id, nota, registrado_por
            )
            select
              ${orgId}, ${documentoId}, ${input.cobroId || null}, ${monto}, ${payCurrency},
              ${input.metodo || 'manual'}, ${input.referencia || null}, ${pi},
              ${input.nota || null}, ${input.registradoPor || null}
            from documentos_fiscales d
            where d.id = ${documentoId} and d.org_id = ${orgId}
              and d.lifecycle <> 'draft' and d.credit_note_of is null
              and (d.status = 'issued' and d.lifecycle <> 'void'
                   or ${pi}::text is not null and d.lifecycle = 'void')
              and d.document_type not in ('credit_note', 'cfdi_egreso') and d.currency = ${payCurrency}
              and d.informacion_global is null
              and (${pi}::text is not null or ${monto} <= d.amount_remaining)
            on conflict (documento_id, stripe_payment_intent_id) where stripe_payment_intent_id is not null
            do nothing
            returning id`,
    invoiceBalanceQuery(orgId, documentoId),
    mp
      ? sql`select id from documento_pagos where documento_id = ${documentoId} and org_id = ${orgId}
          and mp_payment_id = ${mp} and currency = ${payCurrency}`
      : sql`select id from documento_pagos where documento_id = ${documentoId} and org_id = ${orgId}
          and stripe_payment_intent_id = ${pi} and currency = ${payCurrency}`,
  );
  if (!proveedorId && !inserted.length) return { ok: false, error: 'El pago supera el saldo actual o la factura ya no admite pagos.' };

  if (proveedorId && !inserted.length && !recorded.length) return { ok: false, error: 'El pago recibido aún no pudo aplicarse a la factura.' };
  const duplicate = proveedorId !== null && inserted.length === 0;
  const row = updated[0];
  if (!row) return { ok: false, error: 'No se pudo actualizar el saldo de la factura.' };

  const lifecycle = String(row.lifecycle);
  const justPaidNow = !duplicate && lifecycle === 'paid' && row.previous_lifecycle !== 'paid';
  if (!duplicate && latePaymentOnVoid) {
    // Sin efectos de cobranza (hoja, contabilidad, invoice.paid): el documento
    // está anulado. Lo único que importa es que el negocio sepa que debe
    // devolver ese dinero.
    await logInvoiceEvent(orgId, documentoId, 'payment', replaced
      ? `Pago de ${money(monto)} ${String(doc.currency || '')} recibido en una factura ya sustituida: aplícalo a la que la sustituye o devuélvelo`
      : `Pago de ${money(monto)} ${String(doc.currency || '')} recibido DESPUÉS de anular la factura: debe devolverse al cliente`);
    return {
      ok: true, duplicate: false,
      amountPaid: money(Number(row.amount_paid) || 0),
      amountRemaining: money(Number(row.amount_remaining) || 0),
      lifecycle, justPaid: false,
    };
  }
  if (!duplicate) {
    await logInvoiceEvent(orgId, documentoId, 'payment', `Abono de ${money(monto)} ${String(doc.currency || '')}`.trim());
    // CFDI emitido PPD: cada cobro lleva su complemento de pago (no hace nada
    // fuera de México ni en un PUE).
    const pagoId = inserted[0]?.id ? String(inserted[0].id) : '';
    if (pagoId) after(import('./payment-complement').then((m) => m.emitPaymentComplement(orgId, documentoId, pagoId)));
    if (justPaidNow) await logInvoiceEvent(orgId, documentoId, 'paid', 'Saldo liquidado');
    // Un abono que no liquida no emite evento de dominio, pero cambia pagado y saldo en la hoja.
    else after(import('../integraciones/hojas/service').then((m) => m.onAbonoFactura(orgId, documentoId)));
    // Cada cobro llega también a la contabilidad conectada, si la factura ya está allá.
    after(import('../integraciones/contabilidad/pagos').then((m) => m.onPagoFactura(orgId, documentoId)));
  }

  return {
    ok: true,
    duplicate,
    amountPaid: money(Number(row.amount_paid) || 0),
    amountRemaining: money(Number(row.amount_remaining) || 0),
    lifecycle,
    // Solo la transición cuenta: sin esto, cada reintento de Stripe sobre una
    // factura ya saldada dispararía `invoice.paid` otra vez.
    justPaid: justPaidNow,
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

/**
 * Lleva a las facturas vivas de una cotización los cobros que ya se pagaron
 * en la COTIZACIÓN (link /q: anticipo, saldo, cuotas o total).
 *
 * Son dos ledgers —`cotizacion_cobros` y `documento_pagos`— y nada los unía:
 * facturar una cotización ya pagada creaba una factura `open` con el saldo
 * completo. La cartera, los recordatorios, el agente de cobranza y los
 * intereses la perseguían, y `/i/[token]` aceptaba un segundo pago por el mismo
 * dinero. Se corre en los dos órdenes posibles: al emitir la factura (el cobro
 * ya estaba pagado) y al liquidarse un cobro (la factura ya existía).
 *
 * Idempotente: un cobro se traslada una sola vez por documento (`cobro_id`), y
 * el saldo se RECALCULA del ledger bajo el lock del documento, como en
 * `applyPayment`. Devuelve los documentos que con esto quedaron saldados, para
 * que el llamador dispare `invoice.paid` una sola vez.
 */
export async function carryQuotePayments(orgId: string, cotizacionId: string): Promise<string[]> {
  const [docs] = await withOrgTx(orgId, sql`
    select id from documentos_fiscales
     where org_id = ${orgId} and cotizacion_id = ${cotizacionId}
       and status = 'issued' and lifecycle not in ('draft', 'void')
       and credit_note_of is null and document_type not in ('credit_note', 'cfdi_egreso')
       -- Un CFDI sustituido ya pasó sus cobros a su sustituto: volver a
       -- trasladarlos aquí contaría el mismo dinero dos veces.
       and sustituida_por is null`);
  const saldados: string[] = [];
  for (const doc of docs) {
    const documentoId = String(doc.id);
    const [, inserted, updated] = await withOrgTx(orgId,
      invoiceBalanceLock(orgId, documentoId),
      sql`insert into documento_pagos (
            org_id, documento_id, cobro_id, monto, currency, metodo, referencia,
            stripe_payment_intent_id, mp_payment_id, nota
          )
          select d.org_id, d.id, cc.id, cc.monto, d.currency,
                 -- El método real: el complemento de pago declara con él la
                 -- forma (SPEI = 03, tarjeta = 04). Un SPEI de la cotización
                 -- trasladado como 'stripe' se timbraba como tarjeta.
                 case when cc.stripe_payment_intent_id is not null and cc.payment_method = 'spei' then 'spei'
                      when cc.stripe_payment_intent_id is not null then 'stripe'
                      when cc.mp_payment_id is not null then 'mercadopago'
                      else coalesce(nullif(cc.payment_method, ''), 'otro') end,
                 c.folio, cc.stripe_payment_intent_id, cc.mp_payment_id,
                 'Pagado en la cotización'
            from documentos_fiscales d
            join cotizaciones c on c.id = d.cotizacion_id and c.org_id = d.org_id
            join cotizacion_cobros cc on cc.cotizacion_id = c.id and cc.org_id = d.org_id
           where d.id = ${documentoId} and d.org_id = ${orgId}
             and cc.status = 'pagado' and cc.monto > 0
             and upper(coalesce(c.base_currency, d.currency)) = d.currency
             and not exists (
               select 1 from documento_pagos p
                where p.documento_id = d.id and p.org_id = d.org_id and p.cobro_id = cc.id)
          on conflict do nothing
          returning id`,
      invoiceBalanceQuery(orgId, documentoId));
    const row = updated[0];
    if (!inserted.length) continue;
    await logInvoiceEvent(orgId, documentoId, 'payment',
      `${inserted.length} pago(s) recibido(s) en la cotización aplicado(s) a la factura`);
    for (const pago of inserted) {
      after(import('./payment-complement').then((m) => m.emitPaymentComplement(orgId, documentoId, String(pago.id))));
    }
    if (row && row.lifecycle === 'paid' && row.previous_lifecycle !== 'paid') {
      saldados.push(documentoId);
      await logInvoiceEvent(orgId, documentoId, 'paid', 'Saldo liquidado con los pagos de la cotización');
    }
  }
  return saldados;
}

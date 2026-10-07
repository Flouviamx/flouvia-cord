// src/lib/fiscal/quote-ledger.ts
// El puente entre los DOS ledgers de dinero de una misma venta.
//
// Una cotización cobra por rebanadas (`cotizacion_cobros`: anticipo, saldo,
// cuotas) y su factura lleva su propio saldo (`documento_pagos`). Son el mismo
// dinero visto desde dos documentos, y cuando no se hablan se le cobra dos veces
// al cliente. Los casos que originaron este módulo (oct 2026):
//
//   - el cliente paga en `/q`, el vendedor timbra el CFDI y la factura nacía
//     ABIERTA con el saldo completo: entraba a cartera, recordatorios, intereses
//     moratorios y cobranza IA, y su link `/i` dejaba pagarla otra vez;
//   - el cliente paga la factura en `/i` y la cotización seguía cobrable en `/q`.
//
// Tres contratos, y no se mezclan:
//
//   1. **Una factura nace sabiendo lo que la cotización ya cobró.** Al emitirse
//      hereda, en la MISMA transacción que la emite, cada cobro pagado y lo que
//      el vendedor registró como pagado a mano. Nunca existe un instante en que
//      la factura esté abierta con un saldo que ya entró.
//   2. **Una factura saldada con dinero salda la cotización.** Se cancelan los
//      cobros pendientes (y, fuera de la transacción, sus PaymentIntents y
//      preferencias vivas) para que `/q` no vuelva a cobrar.
//   3. **Mientras la factura viva, `/q` no cobra más de lo que ella debe.** El
//      saldo real lo lleva la factura; la cotización solo puede cobrar rebanadas
//      que quepan en él.
//
// Todo cambio de dinero de una cotización pasa por `quoteLedgerLock`: el
// webhook que marca un cobro pagado, la emisión que lo hereda y el pago de la
// factura que la salda. Sin el candado, un cobro que se marca pagado mientras
// la factura se emite podía quedarse fuera de los dos ledgers.
//
// El driver HTTP de Neon no compone fragmentos SQL: cada sentencia de este
// archivo se escribe completa, aunque repita las condiciones de "factura viva".

import { sql, withOrgTx, logAudit } from '../db';
import { after } from '../after';
import { log } from '../log';
import { normalizeCurrency, toMinorUnits } from '../currency';
import { invoiceBalanceLock, invoiceBalanceQuery } from './reconciliation';

/**
 * Serializa todo movimiento de dinero de UNA cotización. Siempre es el PRIMER
 * candado de la transacción que lo toma (antes del de la factura): un orden
 * único es lo que impide un interbloqueo entre el webhook y la emisión.
 */
export const quoteLedgerLock = (orgId: string, quoteId: string) => sql`
  select pg_advisory_xact_lock(hashtextextended(${`quote-ledger:${orgId}:${quoteId}`}, 0))`;

/**
 * Hereda a la factura los cobros que la cotización YA cobró.
 *
 * Idempotente bajo `invoiceBalanceLock`: un cobro no se aplica si la factura ya
 * tiene un renglón de ese cobro, de cualquier PaymentIntent que le haya
 * pertenecido (el que lo pagó, el último presentado, el de su comisión o
 * cualquier intento registrado) o de su pago de Mercado Pago. Mirar TODOS los
 * PaymentIntents del cobro, y no solo el último, es lo que evita contar dos
 * veces un pago que el webhook ya aplicó con un PaymentIntent anterior.
 *
 * `currency` es la divisa de la cotización resuelta en TS: si no coincide con
 * la de la factura no se hereda nada (aplicarlo sería inventar un tipo de
 * cambio, regla 22) y el llamador lo reporta.
 *
 * Con `aplicar = false` es una vista previa: la misma selección, sin escribir.
 * Devuelve UNA fila: candidatos, su monto y cuántos se insertaron.
 */
export const inheritQuoteCobrosQuery = (orgId: string, documentoId: string, currency: string, aplicar = true) => sql`
  with candidatos as (
    select d.org_id, d.id as documento_id, cc.id as cobro_id, cc.monto, d.currency,
           case when cc.mp_payment_id is not null then 'mercadopago'
                when coalesce(cc.payment_method, cc.metodo_pago) = 'spei' then 'spei'
                else 'stripe' end as metodo,
           coalesce(cc.mp_payment_id, pi.id, 'cobro:' || cc.id::text) as referencia,
           case when cc.mp_payment_id is null then pi.id end as stripe_payment_intent_id,
           cc.mp_payment_id
      from documentos_fiscales d
      join cotizaciones c on c.id = d.cotizacion_id and c.org_id = d.org_id
      join cotizacion_cobros cc on cc.cotizacion_id = c.id and cc.org_id = d.org_id
      cross join lateral (
        select coalesce(
          cc.paid_payment_intent_id,
          (select k.stripe_payment_intent_id from comisiones k
            where k.org_id = cc.org_id and k.cobro_id = cc.id
            order by k.created_at desc limit 1),
          cc.stripe_payment_intent_id
        ) as id
      ) pi
     where d.id = ${documentoId} and d.org_id = ${orgId}
       and d.status = 'issued' and d.lifecycle not in ('draft', 'void')
       and d.credit_note_of is null and d.document_type not in ('credit_note', 'cfdi_egreso')
       and d.currency = ${currency}
       and c.es_recurrente is not true
       and cc.status = 'pagado' and cc.monto > 0
       and not exists (
         select 1 from documento_pagos p
          where p.documento_id = d.id and p.org_id = d.org_id
            and (p.cobro_id = cc.id
              or (cc.mp_payment_id is not null and p.mp_payment_id = cc.mp_payment_id)
              or (p.stripe_payment_intent_id is not null and p.stripe_payment_intent_id in (
                    select x from (values (cc.paid_payment_intent_id), (cc.stripe_payment_intent_id)) v(x)
                     where x is not null
                    union select k.stripe_payment_intent_id from comisiones k
                     where k.org_id = cc.org_id and k.cobro_id = cc.id
                    union select a.stripe_payment_intent_id from cotizacion_pago_intentos a
                     where a.org_id = cc.org_id and a.cobro_id = cc.id and a.stripe_payment_intent_id is not null)))
       )
  ), insertados as (
    insert into documento_pagos (
      org_id, documento_id, cobro_id, monto, currency, metodo, referencia,
      stripe_payment_intent_id, mp_payment_id, nota
    )
    select org_id, documento_id, cobro_id, monto, currency, metodo, referencia,
           stripe_payment_intent_id, mp_payment_id,
           'Cobrado en la cotización antes de emitir la factura'
      from candidatos
     where ${aplicar}::boolean
    on conflict do nothing
    returning monto
  )
  select (select count(*) from candidatos)::int as candidatos,
         (select coalesce(sum(monto), 0) from candidatos) as monto_candidato,
         (select count(*) from insertados)::int as insertados,
         (select coalesce(sum(monto), 0) from insertados) as monto_insertado`;

/**
 * Lo que el vendedor marcó como pagado en la cotización sin cobro en línea que
 * lo respalde (transferencia, efectivo, cheque): la diferencia entre el total y
 * los cobros pagados. Un solo renglón por cotización, identificado por su
 * referencia, para que reemitir o reconciliar no lo duplique. Misma forma de
 * respuesta que `inheritQuoteCobrosQuery`.
 */
export const inheritDeclaredPaymentQuery = (orgId: string, documentoId: string, currency: string, aplicar = true) => sql`
  with candidatos as (
    select d.org_id, d.id as documento_id, c.total - pagado.suma as monto, d.currency,
           coalesce(nullif(c.payment_method, ''), 'manual') as metodo,
           'cotizacion:' || c.id::text as referencia
      from documentos_fiscales d
      join cotizaciones c on c.id = d.cotizacion_id and c.org_id = d.org_id
      cross join lateral (
        select coalesce(sum(cc.monto), 0) as suma from cotizacion_cobros cc
         where cc.cotizacion_id = c.id and cc.org_id = c.org_id and cc.status = 'pagado'
      ) pagado
     where d.id = ${documentoId} and d.org_id = ${orgId}
       and d.status = 'issued' and d.lifecycle not in ('draft', 'void')
       and d.credit_note_of is null and d.document_type not in ('credit_note', 'cfdi_egreso')
       and d.currency = ${currency}
       and c.paid_at is not null and c.es_recurrente is not true
       and c.total - pagado.suma > 0
       and not exists (
         select 1 from documento_pagos p
          where p.documento_id = d.id and p.org_id = d.org_id
            and p.referencia = 'cotizacion:' || c.id::text)
  ), insertados as (
    insert into documento_pagos (org_id, documento_id, monto, currency, metodo, referencia, nota)
    select org_id, documento_id, monto, currency, metodo, referencia,
           'Registrado como pagado en la cotización antes de emitir la factura'
      from candidatos
     where ${aplicar}::boolean
    returning monto
  )
  select (select count(*) from candidatos)::int as candidatos,
         (select coalesce(sum(monto), 0) from candidatos) as monto_candidato,
         (select count(*) from insertados)::int as insertados,
         (select coalesce(sum(monto), 0) from insertados) as monto_insertado`;

/**
 * Contrato 2: factura saldada con DINERO → cotización saldada. Una factura que
 * llega a cero solo con notas de crédito no se pagó: se anuló económicamente, y
 * marcar la cotización como pagada mentiría en los informes. Ahí basta con que
 * `/q` deje de cobrar (contrato 3).
 *
 * Dos sentencias: la cotización que cambió y los cobros pendientes que se
 * cancelaron, con lo que el llamador necesita para matar sus PaymentIntents y
 * preferencias FUERA de la transacción.
 */
export const settleQuoteFromInvoiceQueries = (orgId: string, documentoId: string) => [
  settleQuoteFromInvoiceQuery(orgId, documentoId),
  cancelQuoteCobrosFromInvoiceQuery(orgId, documentoId),
];

const settleQuoteFromInvoiceQuery = (orgId: string, documentoId: string) => sql`update cotizaciones c
         set status = 'paid', paid_at = coalesce(c.paid_at, now())
        from documentos_fiscales d
       where d.id = ${documentoId} and d.org_id = ${orgId} and d.lifecycle = 'paid'
         and d.credit_note_of is null and coalesce(d.amount_paid, 0) > 0
         and c.id = d.cotizacion_id and c.org_id = d.org_id
         and c.status in ('approved', 'invoiced') and c.es_recurrente is not true
      returning c.id`;

const cancelQuoteCobrosFromInvoiceQuery = (orgId: string, documentoId: string) => sql`update cotizacion_cobros cc
         set status = 'cancelado'
        from documentos_fiscales d, cotizaciones c
       where d.id = ${documentoId} and d.org_id = ${orgId} and d.lifecycle = 'paid'
         and d.credit_note_of is null and coalesce(d.amount_paid, 0) > 0
         and c.id = d.cotizacion_id and c.org_id = d.org_id and c.es_recurrente is not true
         and cc.cotizacion_id = c.id and cc.org_id = d.org_id
         and cc.status = 'pendiente'
      returning cc.id, cc.stripe_payment_intent_id, cc.mp_preference_id`;

export interface QuoteSettledByInvoice {
  quoteId: string | null;
  cancelados: Array<{ id: string; pi: string | null; preferencia: string | null }>;
}

export function readSettledQuote(quoteRows: any[] = [], cobroRows: any[] = []): QuoteSettledByInvoice {
  return {
    quoteId: quoteRows[0]?.id ? String(quoteRows[0].id) : null,
    cancelados: cobroRows.map((r: any) => ({
      id: String(r.id),
      pi: r.stripe_payment_intent_id ? String(r.stripe_payment_intent_id) : null,
      preferencia: r.mp_preference_id ? String(r.mp_preference_id) : null,
    })),
  };
}

/**
 * Efectos FUERA de la transacción cuando la factura saldó la cotización:
 * historia, webhook `quote.paid` y la invalidación de lo que todavía podría
 * cobrar (PaymentIntents de Stripe y preferencias de Mercado Pago). Todo
 * best-effort: si un PaymentIntent no se puede cancelar y aun así se paga, el
 * webhook lo aplica a la factura saldada y queda como importe por devolver,
 * con aviso — nunca se pierde.
 */
export function afterQuoteSettledByInvoice(orgId: string, documentoId: string, settled: QuoteSettledByInvoice): void {
  if (!settled.quoteId && !settled.cancelados.length) return;
  after((async () => {
    try {
      if (settled.quoteId) {
        await withOrgTx(orgId, sql`
          insert into eventos (org_id, cotizacion_id, tipo, detalle)
          values (${orgId}, ${settled.quoteId}, 'paid', 'Saldada con el pago de su factura')`);
        await logAudit(orgId, {
          accion: 'cotizacion.paid', entidad: 'cotizacion', entidad_id: settled.quoteId,
          detalle: `Saldada por la factura ${documentoId}`,
        });
        const { dispatchQuoteEvent } = await import('../webhooks');
        await dispatchQuoteEvent(orgId, settled.quoteId, 'quote.paid');
      }
      await invalidateLiveCharges(orgId, settled.cancelados);
    } catch (err) {
      log.error('no se pudieron cerrar los cobros de la cotización saldada', { route: 'quote-ledger', orgId, err });
    }
  })());
}

/** Cancela en el proveedor lo que todavía podría cobrar un cobro que ya no se debe. */
async function invalidateLiveCharges(orgId: string, cancelados: QuoteSettledByInvoice['cancelados']): Promise<void> {
  const pis = cancelados.map((c) => c.pi).filter((pi): pi is string => !!pi && pi.startsWith('pi_'));
  if (pis.length) {
    const [[org]] = await withOrgTx(orgId, sql`select stripe_account_id from orgs where id = ${orgId}`);
    const account = org?.stripe_account_id ? String(org.stripe_account_id) : '';
    if (account) {
      const { stripe } = await import('../billing');
      for (const pi of pis) {
        try {
          await stripe(`/v1/payment_intents/${encodeURIComponent(pi)}/cancel`, {}, 'POST', { stripeAccount: account });
        } catch (err) {
          // Ya pagado, en proceso o ya cancelado: el webhook concilia lo que llegue.
          log.warn('no se pudo cancelar el PaymentIntent de un cobro ya saldado', { route: 'quote-ledger', orgId, pi, err });
        }
      }
    }
  }
  const preferencias = cancelados.map((c) => c.preferencia).filter((p): p is string => !!p);
  if (preferencias.length) {
    const { expireMpPreference } = await import('../mercadopago');
    for (const p of preferencias) await expireMpPreference(orgId, p);
  }
}

// ── Contrato 3: la factura viva manda sobre `/q` ─────────────────────────────

export type QuoteInvoiceGate =
  | { state: 'none' }
  | { state: 'settled'; documentoId: string; token: string }
  | { state: 'open'; documentoId: string; token: string; remaining: number; currency: string };

/** La factura viva de una cotización (una por cotización: su llave de emisión es única). */
export async function liveInvoiceForQuote(orgId: string, quoteId: string): Promise<QuoteInvoiceGate> {
  const [rows] = await withOrgTx(orgId, sql`
    select d.id, d.lifecycle, d.amount_remaining, d.total, d.currency, d.public_token
      from documentos_fiscales d
     where d.org_id = ${orgId} and d.cotizacion_id = ${quoteId}
       and d.status = 'issued' and d.lifecycle not in ('draft', 'void')
       and d.credit_note_of is null and d.document_type not in ('credit_note', 'cfdi_egreso')
     order by d.created_at desc
     limit 1`);
  const d = rows[0];
  if (!d) return { state: 'none' };
  const remaining = Number(d.amount_remaining ?? d.total ?? 0);
  const base = { documentoId: String(d.id), token: String(d.public_token || '') };
  if (d.lifecycle === 'paid' || !(remaining > 0)) return { state: 'settled', ...base };
  return { state: 'open', ...base, remaining, currency: normalizeCurrency(String(d.currency || '')) };
}

/**
 * ¿Puede `/q` cobrar este importe con esta factura viva? `null` = sí. Si no,
 * la respuesta que debe dar el endpoint público: ya pagada, o "págala desde su
 * factura" con el link para que la página lleve al cliente al saldo real.
 */
export function quoteChargeBlockedByInvoice(
  gate: QuoteInvoiceGate,
  monto: number,
  currency: string,
  invoiceUrl: string | null,
): { status: number; body: Record<string, unknown> } | null {
  if (gate.state === 'none') return null;
  if (gate.state === 'settled') return { status: 200, body: { alreadyPaid: true } };
  const divisa = normalizeCurrency(currency, gate.currency);
  const cabe = gate.currency === divisa
    && toMinorUnits(monto, divisa) <= toMinorUnits(gate.remaining, divisa);
  if (cabe) return null;
  return {
    status: 409,
    body: {
      error: 'Esta cotización ya tiene factura. El saldo pendiente se paga desde la factura.',
      code: 'invoice_balance',
      ...(invoiceUrl ? { invoiceUrl } : {}),
    },
  };
}

// ── Emisión: la factura nace con lo que ya se cobró ──────────────────────────

/**
 * Sentencias que se agregan a una transacción DESPUÉS de emitir la factura:
 * candado de la factura, herencia, recálculo del saldo y, si quedó saldada con
 * dinero, la cotización.
 *
 * `quoteLedgerLock` NO va aquí: tiene que ser la PRIMERA sentencia de la
 * transacción, antes de tocar la fila de la factura. Lo antepone el llamador.
 */
export function inheritanceQueries(orgId: string, documentoId: string, currency: string) {
  return [
    invoiceBalanceLock(orgId, documentoId),
    inheritQuoteCobrosQuery(orgId, documentoId, currency, true),
    inheritDeclaredPaymentQuery(orgId, documentoId, currency, true),
    invoiceBalanceQuery(orgId, documentoId),
    ...settleQuoteFromInvoiceQueries(orgId, documentoId),
  ];
}

export interface InheritanceResult {
  heredados: number;
  monto: number;
  lifecycle: string | null;
  settled: QuoteSettledByInvoice;
}

/** Lee el resultado de `inheritanceQueries` (las posiciones son las de esa lista). */
export function readInheritance(results: any[][]): InheritanceResult {
  const [, cobros = [], declarado = [], balance = [], quote = [], cancelados = []] = results;
  const c = cobros[0] ?? {};
  const m = declarado[0] ?? {};
  return {
    heredados: (Number(c.insertados) || 0) + (Number(m.insertados) || 0),
    monto: (Number(c.monto_insertado) || 0) + (Number(m.monto_insertado) || 0),
    lifecycle: balance[0]?.lifecycle ? String(balance[0].lifecycle) : null,
    settled: readSettledQuote(quote, cancelados),
  };
}

/** Lo que la emisión o la reparación tienen que decir cuando heredaron pagos. */
export async function recordInheritance(orgId: string, documentoId: string, currency: string, out: InheritanceResult): Promise<void> {
  if (out.heredados) {
    const { logInvoiceEvent } = await import('./timeline');
    await logInvoiceEvent(orgId, documentoId, 'payment', `Pagos de la cotización aplicados a la factura (${out.heredados})`);
    if (out.lifecycle === 'paid') await logInvoiceEvent(orgId, documentoId, 'paid', 'Saldo liquidado');
    await logAudit(orgId, {
      accion: 'factura.pagos_heredados', entidad: 'factura', entidad_id: documentoId,
      detalle: `${out.heredados} pago(s) de la cotización; ${out.monto} ${currency}`,
    });
    if (out.lifecycle === 'paid') {
      after(import('../webhooks').then((w) => w.dispatchInvoiceEvent(orgId, documentoId, 'invoice.paid')));
    }
    after(import('../integraciones/contabilidad/pagos').then((c) => c.onPagoFactura(orgId, documentoId)));
  }
  afterQuoteSettledByInvoice(orgId, documentoId, out.settled);
}

export interface ReconcileResult extends InheritanceResult {
  /** Por qué no se tocó: sin cotización o divisas distintas. */
  skipped?: 'sin_cotizacion' | 'divisa_distinta';
  /** Vista previa: lo que se aplicaría. */
  pendiente?: { cobros: number; monto: number };
}

/**
 * Concilia una factura YA emitida con su cotización: la misma herencia que la
 * emisión, en su propia transacción. Es el camino de reparación de las facturas
 * que nacieron antes de este contrato con un saldo que ya se había cobrado.
 * Con `dryRun` solo dice qué aplicaría.
 */
export async function reconcileInvoiceWithQuote(
  orgId: string,
  documentoId: string,
  opts: { dryRun?: boolean } = {},
): Promise<ReconcileResult> {
  const [[head]] = await withOrgTx(orgId, sql`
    select d.cotizacion_id, d.currency, c.base_currency, o.moneda
      from documentos_fiscales d
      join cotizaciones c on c.id = d.cotizacion_id and c.org_id = d.org_id
      join orgs o on o.id = d.org_id
     where d.id = ${documentoId} and d.org_id = ${orgId}`);
  const vacio: InheritanceResult = { heredados: 0, monto: 0, lifecycle: null, settled: { quoteId: null, cancelados: [] } };
  if (!head?.cotizacion_id) return { ...vacio, skipped: 'sin_cotizacion' };
  const docCurrency = normalizeCurrency(String(head.currency || ''));
  const quoteCurrency = normalizeCurrency(String(head.base_currency || head.moneda || ''), docCurrency);
  if (quoteCurrency !== docCurrency) return { ...vacio, skipped: 'divisa_distinta' };

  if (opts.dryRun) {
    const [cobros, declarado] = await withOrgTx(orgId,
      inheritQuoteCobrosQuery(orgId, documentoId, docCurrency, false),
      inheritDeclaredPaymentQuery(orgId, documentoId, docCurrency, false));
    const c = cobros[0] ?? {};
    const m = declarado[0] ?? {};
    return {
      ...vacio,
      pendiente: {
        cobros: (Number(c.candidatos) || 0) + (Number(m.candidatos) || 0),
        monto: (Number(c.monto_candidato) || 0) + (Number(m.monto_candidato) || 0),
      },
    };
  }

  const results = await withOrgTx(orgId,
    quoteLedgerLock(orgId, String(head.cotizacion_id)),
    ...inheritanceQueries(orgId, documentoId, docCurrency));
  const out = readInheritance(results.slice(1));
  await recordInheritance(orgId, documentoId, docCurrency, out);
  return out;
}

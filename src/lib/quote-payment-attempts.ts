import { createHash } from 'node:crypto';
import { sql, withOrgTx } from './db';

export class QuotePaymentConflict extends Error {
    constructor(public code: 'payment_changed' | 'payment_review_required') {
        super(code === 'payment_changed'
            ? 'El cobro cambió o hay otro intento en preparación. Actualiza el enlace antes de continuar.'
            : 'Hay un intento de pago que necesita revisión. Contacta al vendedor antes de volver a pagar.');
    }
}

export type QuoteAttemptInput = {
    orgId: string; quoteId: string; cobroId: string; previousId: string | null;
    amount: number; quoteTotal: number; currency: string; request: URLSearchParams;
};

/** Hash only: never persist the client secret or public token in this registry. */
export async function claimQuotePaymentAttempt(input: QuoteAttemptInput) {
    const { orgId, quoteId, cobroId, previousId, amount, quoteTotal, currency, request } = input;
    const hash = createHash('sha256').update(JSON.stringify([...request].sort(([a], [b]) => a.localeCompare(b)))).digest('hex');
    const predecessor = previousId || 'initial';
    const [, rows] = await withOrgTx(orgId, sql`
        insert into cotizacion_pago_intentos (org_id, cobro_id, predecessor, request_hash)
        select co.org_id, co.id, ${predecessor}, ${hash}
          from cotizacion_cobros co join cotizaciones c on c.id = co.cotizacion_id and c.org_id = co.org_id
         where co.id = ${cobroId} and co.org_id = ${orgId} and c.id = ${quoteId}
           and co.status = 'pendiente' and co.monto = ${amount}
           and co.stripe_payment_intent_id is not distinct from ${previousId}
           and c.status in ('approved', 'invoiced') and c.total = ${quoteTotal}
           and upper(coalesce(c.base_currency, ${currency})) = ${currency}
        on conflict (org_id, cobro_id, predecessor) do nothing`, sql`
        select id, request_hash, stripe_payment_intent_id,
               created_at <= now() - interval '23 hours' as expired
          from cotizacion_pago_intentos
         where org_id = ${orgId} and cobro_id = ${cobroId} and predecessor = ${predecessor}`);
    const attempt = rows[0];
    if (!attempt || attempt.request_hash !== hash) throw new QuotePaymentConflict('payment_changed');
    // Stripe may prune idempotency keys after 24h. An unknown outcome must not
    // create again after that window, nor be "fixed" with a fresh random key.
    if (!attempt.stripe_payment_intent_id && attempt.expired) throw new QuotePaymentConflict('payment_review_required');
    return { id: String(attempt.id), paymentIntentId: attempt.stripe_payment_intent_id as string | null };
}

export async function publishQuotePaymentAttempt(input: QuoteAttemptInput, attemptId: string, intentId: string,
    fee: { applicationFeeCents: number; feeBaseCents: number; feeIvaCents: number }, method: string | null) {
    const { orgId, quoteId, cobroId, previousId, amount, quoteTotal, currency } = input;
    const [stored, published] = await withOrgTx(orgId, sql`
        update cotizacion_pago_intentos set stripe_payment_intent_id = ${intentId}
         where id = ${attemptId} and org_id = ${orgId} and cobro_id = ${cobroId}
           and (stripe_payment_intent_id is null or stripe_payment_intent_id = ${intentId}) returning id`, sql`
        update cotizacion_cobros co
           set stripe_payment_intent_id = ${intentId}, metodo_pago = ${method},
               application_fee_cents = ${fee.applicationFeeCents}, fee_base_cents = ${fee.feeBaseCents},
               fee_iva_cents = ${fee.feeIvaCents}, fee_total_cents = ${fee.applicationFeeCents}
         where co.id = ${cobroId} and co.org_id = ${orgId} and co.cotizacion_id = ${quoteId}
           and co.status = 'pendiente' and co.monto = ${amount}
           and (co.stripe_payment_intent_id is not distinct from ${previousId} or co.stripe_payment_intent_id = ${intentId})
           and exists (select 1 from cotizacion_pago_intentos a where a.id = ${attemptId}
                       and a.org_id = ${orgId} and a.cobro_id = co.id and a.stripe_payment_intent_id = ${intentId})
           and exists (select 1 from cotizaciones c where c.id = co.cotizacion_id and c.org_id = ${orgId}
                       and c.status in ('approved', 'invoiced') and c.total = ${quoteTotal}
                       and upper(coalesce(c.base_currency, ${currency})) = ${currency})
        returning id`);
    // Even if the quote changed, the attempt keeps the provider id for recovery.
    if (!stored.length || !published.length) throw new QuotePaymentConflict('payment_changed');
}

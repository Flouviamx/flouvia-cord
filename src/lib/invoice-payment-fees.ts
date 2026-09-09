import { sql, withOrgTx } from './db';
import { stripe } from './billing';
import type { FeeResult } from './fees';

/** Save the accepted split with the payment, never reconstruct it from today's rates. */
export function setInvoiceFeeMetadata(form: URLSearchParams, fee: Pick<FeeResult, 'feeBaseCents' | 'feeIvaCents' | 'applicationFeeCents'>) {
    form.set('metadata[cord_fee_version]', '1');
    form.set('metadata[cord_fee_base_cents]', String(fee.feeBaseCents));
    form.set('metadata[cord_fee_tax_cents]', String(fee.feeIvaCents));
    form.set('metadata[cord_fee_total_cents]', String(fee.applicationFeeCents));
}

const idOf = (value: any): string => typeof value === 'string' ? value : String(value?.id || '');
const cents = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) >= 0;
const metadataCents = (value: unknown): number | null => typeof value === 'string' && /^\d+$/.test(value) && cents(Number(value)) ? Number(value) : null;

export function invoiceCommissionValues(intent: any, charge: any) {
    if (!intent?.id || charge?.payment_intent && idOf(charge.payment_intent) !== intent.id
        || charge?.status !== 'succeeded' || charge?.captured !== true
        || !cents(charge.amount) || charge.amount <= 0
        || (charge.amount_captured != null && charge.amount_captured !== charge.amount)
        || (intent.amount_received != null && intent.amount_received !== charge.amount) || !/^[a-z]{3}$/i.test(String(charge.currency || ''))
        || charge.currency.toLowerCase() !== String(intent.currency).toLowerCase()) {
        throw new Error('El cargo no coincide con el pago confirmado de la factura.');
    }
    const currency = charge.currency.toUpperCase();
    // The charge is the evidence of the fee actually collected.
    const total = charge.application_fee_amount ?? 0;
    if (!cents(total) || total > charge.amount) throw new Error('Comisión de factura inválida.');
    const meta = intent.metadata || {};
    let base = metadataCents(meta.cord_fee_base_cents);
    let tax = metadataCents(meta.cord_fee_tax_cents);
    const savedTotal = metadataCents(meta.cord_fee_total_cents);
    let review = meta.cord_fee_version !== '1' || base === null || tax === null
        || savedTotal !== total || base + tax !== total;
    // No tax split needs guessing when the actual platform fee is zero.
    if (total === 0) { base = 0; tax = 0; review = false; }
    if (review) { base = 0; tax = 0; }

    const appFee = typeof charge.application_fee === 'object' ? charge.application_fee : null;
    if (appFee && (String(appFee.currency).toUpperCase() !== currency || appFee.amount !== total)) review = true;
    const bt = typeof charge.balance_transaction === 'object' ? charge.balance_transaction : null;
    let processor: number | null = null, net: number | null = null;
    if (bt) {
        // Costs in a settlement currency cannot be subtracted from a charge in
        // another currency. Keep the known fee and request review instead.
        if (String(bt.currency).toUpperCase() !== currency || bt.amount !== charge.amount
            || !cents(bt.fee) || !Number.isSafeInteger(bt.net) || bt.amount - bt.fee !== bt.net || bt.fee < total) review = true;
        else { processor = bt.fee - total; net = bt.net; }
    }
    if (!Number.isSafeInteger(charge.created) || charge.created <= 0) throw new Error('Cargo sin fecha verificable.');
    return { currency, amount: charge.amount, total, base: base!, tax: tax!, processor, net,
        chargeId: String(charge.id), balanceId: idOf(charge.balance_transaction) || null,
        applicationFeeId: idOf(charge.application_fee) || null,
        method: charge.payment_method_details?.type === 'customer_balance' ? 'spei' : 'tarjeta',
        status: review ? 'needs_review' : bt ? 'settled' : 'pending',
        createdAt: new Date(charge.created * 1000).toISOString() };
}

/** Direct invoice payments have no cotizacion_cobros row. Their payment ledger
 * supplies the org/document relation and comisiones keeps its existing PI key. */
export async function reconcileInvoiceCommission(orgId: string, documentId: string, intent: any, account: string | undefined) {
    if (!account) throw new Error('Falta la cuenta conectada para conciliar la factura.');
    const [payments] = await withOrgTx(orgId, sql`
        select p.id from documento_pagos p join documentos_fiscales d
          on d.id = p.documento_id and d.org_id = p.org_id
        where p.org_id = ${orgId} and d.id = ${documentId}
          and p.stripe_payment_intent_id = ${String(intent.id)}
          and p.currency = upper(${String(intent.currency)}) limit 1`);
    if (!payments.length) throw new Error('El pago no está ligado a esta factura y organización.');
    const chargeId = idOf(intent.latest_charge);
    if (!chargeId) throw new Error('La factura tiene un pago sin cargo conciliable.');
    const charge = await stripe(`/v1/charges/${chargeId}`, {
        'expand[0]': 'balance_transaction', 'expand[1]': 'application_fee',
    }, 'GET', { stripeAccount: account });
    if (charge?.id !== chargeId || idOf(charge.payment_intent) !== intent.id) throw new Error('El proveedor devolvió otro cargo.');
    const v = invoiceCommissionValues(intent, charge);
    const [rows] = await withOrgTx(orgId, sql`
        insert into comisiones
          (org_id, cobro_id, stripe_payment_intent_id, stripe_charge_id,
           stripe_balance_transaction_id, stripe_application_fee_id, metodo_pago,
           moneda, monto_cents, fee_base_cents, fee_iva_cents, fee_total_cents,
           stripe_fee_cents, neto_vendedor_cents, status, created_at, updated_at)
        select ${orgId}, null, ${String(intent.id)}, ${v.chargeId}, ${v.balanceId},
               ${v.applicationFeeId}, ${v.method}, ${v.currency}, ${v.amount}, ${v.base},
               ${v.tax}, ${v.total}, ${v.processor}, ${v.net}, ${v.status}, ${v.createdAt}::timestamptz, now()
        where exists (select 1 from documento_pagos p where p.org_id = ${orgId}
                      and p.documento_id = ${documentId} and p.stripe_payment_intent_id = ${String(intent.id)})
        on conflict (org_id, stripe_payment_intent_id) do update set
          stripe_balance_transaction_id = excluded.stripe_balance_transaction_id,
          stripe_application_fee_id = excluded.stripe_application_fee_id,
          fee_base_cents = excluded.fee_base_cents, fee_iva_cents = excluded.fee_iva_cents,
          stripe_fee_cents = excluded.stripe_fee_cents, neto_vendedor_cents = excluded.neto_vendedor_cents,
          status = case when excluded.status = 'needs_review' then 'needs_review'
                        when comisiones.refunded_cents > 0 then 'fee_refunded' else excluded.status end,
          updated_at = now()
        where comisiones.cobro_id is null and comisiones.stripe_charge_id = excluded.stripe_charge_id
          and comisiones.moneda = excluded.moneda and comisiones.monto_cents = excluded.monto_cents
          and comisiones.fee_total_cents = excluded.fee_total_cents
        returning id`);
    if (!rows.length) throw new Error('La comisión existente no coincide con el pago de la factura.');
    return v.status;
}

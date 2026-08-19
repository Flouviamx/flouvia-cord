// /api/i/[token]/payment-intent — cobro del SALDO de una factura desde su
// hosted invoice page.
//
// Hermano de /api/q/[token]/payment-intent, pero con un sujeto distinto: aquel
// cobra "rebanadas" de una cotización (anticipo, saldo, cuotas) y este cobra el
// saldo vivo de UN documento fiscal. Son dos ledgers distintos y mezclarlos
// haría que un anticipo de la cotización se descontara del saldo de la factura
// dos veces.
//
// Solo tarjeta: SPEI asigna CLABE por customer, liquida únicamente en MXN y es
// un riel exclusivo de México. Ofrecerlo aquí sin esa maquinaria produciría una
// CLABE que el banco rechaza — Regla 21, una capacidad de un solo país se dice,
// no se ofrece y falla en el proveedor.
//
// Admite ABONO PARCIAL: el cuerpo puede traer `{ monto }`. El monto lo propone
// el cliente y por eso se acota contra el saldo real de la base — nunca se
// confía en el importe que llega del navegador.
export const prerender = false;

import type { APIRoute } from 'astro';
import { sql, resolvePublicInvoice, withOrgTx } from '../../../../lib/db';
import { rateLimit, tooMany } from '../../../../lib/ratelimit';
import { currencyDecimals, normalizeCurrency, stripeCurrency, stripeSupportsCurrency, toMinorUnits } from '../../../../lib/currency';
import { computeFee, isFeeScheduleActive } from '../../../../lib/fees';
import { payerError } from '../../../../lib/pay-errors';
import { log } from '../../../../lib/log';

const STRIPE_KEY = import.meta.env.STRIPE_SECRET_KEY || process.env.STRIPE_SECRET_KEY;

export const POST: APIRoute = async ({ params, request }) => {
    if (!STRIPE_KEY) return json({ error: 'El pago en línea aún no está disponible.' }, 503);
    const token = params.token ?? '';
    const rl = await rateLimit(`ipi:${token}`, 10, 60);
    if (!rl.ok) return tooMany(rl.retryAfter);

    const identity = await resolvePublicInvoice(token);
    if (!identity) return json({ error: 'Factura no encontrada' }, 404);

    const [rows] = await withOrgTx(identity.orgId, sql`
        select d.id, d.org_id, d.invoice_number, d.lifecycle, d.currency,
               d.total, d.amount_remaining, d.stripe_payment_intent_id,
               o.sandbox_of, o.stripe_account_id, o.stripe_charges_enabled,
               o.acepta_tarjeta, o.nombre as org_nombre, o.moneda,
               o.fee_enabled, o.fee_terms_version
          from documentos_fiscales d
          join orgs o on o.id = d.org_id
         where d.id = ${identity.id} and d.org_id = ${identity.orgId}`);
    if (!rows.length) return json({ error: 'Factura no encontrada' }, 404);
    const d = rows[0];
    const orgId = d.org_id as string;

    if (d.lifecycle === 'paid') return json({ alreadyPaid: true });
    if (d.lifecycle !== 'open') {
        return json({ error: 'Esta factura no está abierta a pago.' }, 409);
    }
    if (d.sandbox_of) {
        return json({ error: 'Esta factura es de prueba — el pago en línea está deshabilitado.' }, 409);
    }
    if (!d.stripe_account_id || !d.stripe_charges_enabled) {
        return json({ error: 'El negocio todavía no tiene configurada su cuenta para recibir pagos.' }, 403);
    }
    if (!d.acepta_tarjeta) {
        return json({ error: 'El negocio no acepta pagos con tarjeta en línea.' }, 403);
    }

    // Regla 21: la divisa del cobro es la de la FACTURA, no la de la org.
    const currency = normalizeCurrency((d.currency as string) || (d.moneda as string));
    if (!stripeSupportsCurrency(currency)) {
        return json({ error: 'El pago en línea todavía no está disponible para la moneda de esta factura.' }, 409);
    }

    const saldo = Number(d.amount_remaining ?? d.total ?? 0);
    if (!(saldo > 0)) return json({ alreadyPaid: true });

    // Pago PARCIAL. Un área de cuentas por pagar liquida a plazos con mucha más
    // frecuencia de lo que un botón de "pagar todo" admite; sin esta opción el
    // cliente que quiere abonar la mitad hace la transferencia por fuera y el
    // ledger de la factura se queda mudo.
    //
    // El monto lo propone el CLIENTE, así que no es de confianza: se acota al
    // saldo real leído de la base y a un mínimo cobrable. Aceptarlo tal cual
    // permitiría cobrar de más (y luego reembolsar) o cobrar centavos para
    // ensuciar el ledger.
    let cobrar = saldo;
    const body = await request.json().catch(() => ({} as any));
    if (body?.monto !== undefined && body?.monto !== null && body.monto !== '') {
        const pedido = Number(body.monto);
        if (!Number.isFinite(pedido) || pedido <= 0) {
            return json({ error: 'El monto a pagar no es válido.' }, 400);
        }
        cobrar = Math.min(pedido, saldo);
    }

    // toMinorUnits, nunca Math.round(x*100): JPY/CLP/KRW no tienen decimales y
    // KWD/BHD tienen tres.
    const amount = toMinorUnits(cobrar, currency);
    if (!(amount > 0)) return json({ error: 'El monto es demasiado pequeño para cobrarse en línea.' }, 409);
    // Piso del proveedor, en UNIDAD MÍNIMA. Se declara aquí para no dejar al
    // cliente frente a un rechazo de Stripe sin explicación (regla 14). El
    // umbral va por decimales de la divisa: 50 centavos donde hay dos, 50
    // unidades donde no hay ninguna (JPY, CLP), 500 milésimos donde hay tres.
    const PISO_POR_DECIMALES: Record<number, number> = { 0: 50, 2: 50, 3: 500 };
    const piso = PISO_POR_DECIMALES[currencyDecimals(currency)] ?? 50;
    if (amount < piso) {
        return json({
            error: cobrar < saldo
                ? 'El abono es demasiado pequeño para cobrarse en línea. Paga un poco más o liquida el saldo completo.'
                : 'El saldo de esta factura es demasiado pequeño para cobrarse en línea.',
        }, 409);
    }

    const fee = computeFee({
        amountCents: amount,
        metodo: 'card',
        moneda: currency,
        enabled: isFeeScheduleActive(d.fee_enabled, d.fee_terms_version),
    });

    const acct = d.stripe_account_id as string;
    const headers = {
        Authorization: `Bearer ${STRIPE_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Stripe-Account': acct,
    };
    const pubKey = import.meta.env.PUBLIC_STRIPE_PUBLISHABLE_KEY || process.env.PUBLIC_STRIPE_PUBLISHABLE_KEY;

    try {
        // Reutilizar el PaymentIntent vivo de esta factura. Sin esto, cada
        // recarga de la página abre un intento nuevo y el cliente termina con
        // varios cobros en vuelo por la misma factura.
        const prevId = d.stripe_payment_intent_id as string | null;
        if (prevId) {
            const prevRes = await fetch(`https://api.stripe.com/v1/payment_intents/${prevId}`, { headers });
            const prev: any = await prevRes.json();
            if (prevRes.ok && prev?.id) {
                if (prev.status === 'succeeded') return json({ alreadyPaid: true });
                const updateable = ['requires_payment_method', 'requires_confirmation'].includes(prev.status);
                const sameAmount = prev.amount === amount
                    && Number(prev.application_fee_amount || 0) === fee.applicationFeeCents;
                if (prev.status !== 'canceled' && (sameAmount || updateable)) {
                    let current = prev;
                    if (!sameAmount && updateable) {
                        const upd = new URLSearchParams({ amount: String(amount) });
                        if (fee.applicationFeeCents > 0) upd.set('application_fee_amount', String(fee.applicationFeeCents));
                        const updated = await fetch(`https://api.stripe.com/v1/payment_intents/${prevId}`, {
                            method: 'POST', headers, body: upd.toString(),
                        });
                        current = await updated.json();
                        if (!updated.ok) throw current?.error || new Error('No se pudo actualizar el cobro');
                    }
                    return json({
                        clientSecret: current.client_secret, publishableKey: pubKey,
                        accountId: acct, amount, currency,
                    });
                }
            }
        }

        const form = new URLSearchParams();
        form.set('amount', String(amount));
        form.set('currency', stripeCurrency(currency));
        form.set('description', `Factura ${d.invoice_number || ''} — ${d.org_nombre}`.trim());
        form.set('payment_method_types[0]', 'card');
        // El webhook concilia por esta metadata: sin `documento_id` el pago
        // llegaría a Stripe sin saber a qué factura se aplica.
        form.set('metadata[documento_id]', d.id as string);
        form.set('metadata[invoice_token]', token);
        form.set('metadata[invoice_number]', String(d.invoice_number ?? ''));
        if (fee.applicationFeeCents > 0) form.set('application_fee_amount', String(fee.applicationFeeCents));

        const res = await fetch('https://api.stripe.com/v1/payment_intents', {
            method: 'POST', headers, body: form.toString(),
        });
        const data: any = await res.json();
        if (!res.ok || !data?.client_secret) {
            const safe = payerError(data?.error);
            log.error('el proveedor rechazó el cobro de factura', { route: 'cord-pagos', reference: safe.reference, err: data?.error });
            return json({ error: `${safe.message} Ref: ${safe.reference}` }, 502);
        }

        await withOrgTx(orgId, sql`
            update documentos_fiscales
               set stripe_payment_intent_id = ${data.id}, updated_at = now()
             where id = ${d.id} and org_id = ${orgId}`);

        return json({
            clientSecret: data.client_secret, publishableKey: pubKey,
            accountId: acct, amount, currency,
        });
    } catch (error: unknown) {
        const safe = payerError(error);
        log.error('no se pudo crear el cobro de la factura', { route: 'cord-pagos', reference: safe.reference, err: error });
        return json({ error: `${safe.message} Ref: ${safe.reference}` }, 502);
    }
};

function json(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

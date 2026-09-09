export const prerender = false;

import type { APIRoute } from 'astro';
import { sql, resolvePublicQuote, withOrgTx } from '../../../../lib/db';
import { dueDateFor, isoDay, venceDia, materializeAnticipoCobros } from '../../../../lib/cobros';
import { trackServer } from '../../../../lib/posthog-server';
import { fromMinorUnits, normalizeCurrency, stripeCurrency, stripeSupportsCurrency, toMinorUnits } from '../../../../lib/currency';
import { computeFee, isFeeScheduleActive, type PaymentFeeMethod } from '../../../../lib/fees';
import { payerError } from '../../../../lib/pay-errors';
import { after } from '../../../../lib/after';
import { log } from '../../../../lib/log';
import { limitPublicPayment } from '../../../../lib/connect-security';
import { claimQuotePaymentAttempt, publishQuotePaymentAttempt, QuotePaymentConflict } from '../../../../lib/quote-payment-attempts';

const STRIPE_KEY = import.meta.env.STRIPE_SECRET_KEY || process.env.STRIPE_SECRET_KEY;

export const POST: APIRoute = async ({ params, request }) => {
    if (!STRIPE_KEY) return json({ error: 'El pago en línea aún no está configurado.' }, 503);
    const token = params.token ?? '';
    // Estricto y con componente de IP: es el carril donde vive el fraude de
    // prueba de tarjetas, y `rateLimit()` a secas fallaba abierto.
    const limited = await limitPublicPayment(request, 'pi', token, 10);
    if (limited) return limited;

    // Cobro específico (anticipo/saldo/cuota) — opcional; sin él se elige el
    // siguiente cobro pendiente cuya fecha ya llegó.
    let requestedCobroId = '';
    let requestedMethod = '';
    try {
        const body = await request.json();
        if (body && typeof body.cobro_id === 'string') requestedCobroId = body.cobro_id;
        if (body && typeof body.metodo === 'string') requestedMethod = body.metodo;
    } catch { /* sin body = pagar el siguiente cobro pendiente */ }

    const identity = await resolvePublicQuote(token);
    if (!identity) return json({ error: 'Cotización no encontrada' }, 404);
    const [rows] = await withOrgTx(identity.orgId, sql`
        select c.id, c.org_id, c.folio, c.total, c.status, c.anticipo_pct, c.base_currency,
               coalesce(c.terminos, cl.terminos_default) as terminos,
               coalesce(c.approved_at, c.created_at) as base_date,
               o.sandbox_of, o.stripe_account_id, o.stripe_charges_enabled,
               o.acepta_tarjeta, o.cobro_spei_auto, o.nombre as org_nombre, o.is_demo,
               o.checkout_v2, o.fee_enabled, o.fee_plan, o.fee_terms_version, o.moneda
        from cotizaciones c
        left join clientes cl on cl.id = c.cliente_id
        join orgs o on o.id = c.org_id
        where c.id = ${identity.id} and c.org_id = ${identity.orgId}`);
    if (!rows.length) return json({ error: 'Cotización no encontrada' }, 404);
    const c = rows[0];
    const orgId = c.org_id as string;
    if (c.status === 'paid') {
        return json({ alreadyPaid: true });
    }
    if (!['approved', 'invoiced'].includes(c.status as string)) {
        return json({ error: 'Esta cotización no está lista para pago' }, 409);
    }
    if (c.sandbox_of) {
        return json({ error: 'Esta cotización es de prueba — el pago en línea está deshabilitado.' }, 409);
    }
    if (!c.stripe_account_id || !c.stripe_charges_enabled) {
        return json({ error: 'El vendedor no tiene configurada su cuenta para recibir pagos' }, 403);
    }
    if (!c.acepta_tarjeta && !c.cobro_spei_auto) {
        return json({ error: 'El vendedor no acepta pagos en línea' }, 403);
    }
    const checkoutV2 = !!c.checkout_v2;
    let method: PaymentFeeMethod | null = null;
    if (checkoutV2) {
        if (requestedMethod !== 'card' && requestedMethod !== 'spei') {
            return json({ error: 'Selecciona un método de pago válido' }, 400);
        }
        method = requestedMethod;
        if ((method === 'card' && !c.acepta_tarjeta) || (method === 'spei' && !c.cobro_spei_auto)) {
            return json({ error: 'El método de pago seleccionado no está disponible' }, 409);
        }
    }

    // Divisa canónica de ESTE cobro: la de la cotización. Todo el endpoint
    // (montos, reutilización de PaymentIntent, comisión y analytics) la usa.
    const currency = normalizeCurrency((c.base_currency as string) || (c.moneda as string));
    if (!stripeSupportsCurrency(currency)) {
        return json({ error: 'El pago en línea todavía no está disponible para la moneda de esta cotización.' }, 409);
    }
    // SPEI es un riel EXCLUSIVO de México y solo liquida en MXN. Ofrecerlo en
    // otra divisa produce una CLABE que el banco del cliente rechaza.
    if (method === 'spei' && currency !== 'MXN') {
        return json({ error: 'La transferencia SPEI solo está disponible para cobros en pesos mexicanos.' }, 409);
    }
    const toCents = (value: unknown) => toMinorUnits(Number(value), currency);
    const totalCents = toCents(c.total);
    const hoyISO = new Date().toISOString().slice(0, 10);
    const acct = c.stripe_account_id as string;
    const connectHeaders = {
        Authorization: `Bearer ${STRIPE_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Stripe-Account': acct,
    };

    // ── Resolver QUÉ cobro se paga ─────────────────────────────────────────
    // La cotización se cobra por "rebanadas" (cotizacion_cobros): anticipo +
    // saldo, cuotas negociadas, o una fila 'total' para el pago simple —
    // creada aquí de forma perezosa la primera vez que alguien intenta pagar.
    let [cobros] = await withOrgTx(orgId, sql`
        select id, tipo, numero_cuota, monto, status, vence, stripe_payment_intent_id
        from cotizacion_cobros where org_id = ${orgId} and cotizacion_id = ${c.id}
        order by vence asc nulls first, created_at asc`);

    // Never delete a payable row while an external creation may be in flight.
    // Keep its identity/history and ask the seller to reconcile the revised quote.
    const activos = cobros.filter((co: any) => co.status !== 'cancelado');
    const sumCents = activos.reduce((sum: number, co: any) => sum + toCents(co.monto), 0);
    const nadaPagado = cobros.every((co: any) => co.status !== 'pagado');
    if (cobros.length && nadaPagado && sumCents !== totalCents) {
        return json({ error: 'El importe de la cotización cambió. Pide al vendedor que revise el desglose antes de pagar.', code: 'payment_changed' }, 409);
    }

    if (!cobros.length) {
        const pct = Number(c.anticipo_pct);
        if (pct > 0 && pct < 100) {
            await materializeAnticipoCobros(c.id as string, orgId);
        } else {
            // Pago total simple. El vencimiento hereda los términos de crédito:
            // contado = hoy; net30/net60 = la fecha de vencimiento (defensa en
            // profundidad — la UI ya oculta el botón, esto bloquea el API directo).
            const venceTotal = isoDay(dueDateFor(c.base_date as string, c.terminos as string));
            await withOrgTx(orgId, sql`
                insert into cotizacion_cobros (org_id, cotizacion_id, tipo, monto, vence)
                select org_id, id, 'total', total, ${venceTotal}
                from cotizaciones where id = ${c.id}
                on conflict (cotizacion_id, tipo, numero_cuota) do nothing`);
        }
        [cobros] = await withOrgTx(orgId, sql`
            select id, tipo, numero_cuota, monto, status, vence, stripe_payment_intent_id
            from cotizacion_cobros where org_id = ${orgId} and cotizacion_id = ${c.id}
            order by vence asc nulls first, created_at asc`);
        if (!cobros.length) return json({ error: 'No se pudo preparar el cobro' }, 500);
    }

    let cobro: any = null;
    if (requestedCobroId) {
        // Solo cobros de ESTA cotización (la query ya filtra por cotizacion_id).
        cobro = cobros.find((co: any) => co.id === requestedCobroId) || null;
        if (!cobro) return json({ error: 'Cobro no encontrado' }, 404);
        if (cobro.status === 'pagado') return json({ alreadyPaid: true });
        if (cobro.status === 'cancelado') return json({ error: 'Este cobro ya no está vigente' }, 409);
    } else {
        const pendientes = cobros.filter((co: any) => co.status === 'pendiente');
        if (!pendientes.length) return json({ alreadyPaid: true });
        cobro = pendientes.find((co: any) => !co.vence || venceDia(co.vence) <= hoyISO) || null;
        if (!cobro) cobro = pendientes[0]; // el gate de fecha de abajo responde con el 409
    }
    // Gate por fecha de vencimiento (aplica también con cobro explícito).
    if (cobro.vence && venceDia(cobro.vence) > hoyISO) {
        return json({ error: `Este pago aún no está disponible — se habilita el ${venceDia(cobro.vence)}.` }, 409);
    }

    let amount: number; // unidad mínima de la divisa (no siempre /100)
    try { amount = toCents(cobro.monto); }
    catch { return json({ error: 'Monto de cobro inválido' }, 500); }
    if (!(amount > 0)) return json({ error: 'Monto de cobro inválido' }, 500);
    const fee = method
        ? computeFee({
            amountCents: amount,
            metodo: method,
            moneda: currency,
            enabled: isFeeScheduleActive(c.fee_enabled, c.fee_terms_version),
        })
        : computeFee({ amountCents: amount, metodo: 'card', moneda: currency, enabled: false });

    const pubKey = import.meta.env.PUBLIC_STRIPE_PUBLISHABLE_KEY || process.env.PUBLIC_STRIPE_PUBLISHABLE_KEY;

    // Los payment_method_types según la config vigente del vendedor. Se calculan
    // aquí porque también deciden si un PI previo sigue siendo reutilizable.
    // SPEI (customer_balance + mx_bank_transfer) solo existe en MXN: fuera de esa
    // divisa el vendedor cobra con tarjeta aunque tenga SPEI activado.
    const speiDisponible = currency === 'MXN';
    const pmTypes: string[] = [];
    if (method === 'card') pmTypes.push('card');
    else if (method === 'spei') pmTypes.push('customer_balance');
    else {
        if (c.acepta_tarjeta) pmTypes.push('card');
        if (c.cobro_spei_auto && speiDisponible) pmTypes.push('customer_balance');
    }
    if (!pmTypes.length) {
        return json({ error: 'El vendedor no tiene un método de pago disponible para la moneda de esta cotización.' }, 409);
    }

    async function presentIntent(intent: any): Promise<Response> {
        let current = intent;
        if (method === 'spei' && ['requires_payment_method', 'requires_confirmation'].includes(current.status)) {
            // The intent is durably linked BEFORE confirmation, so an immediate
            // cash-balance settlement cannot race an untracked creation.
            const result = await fetch(`https://api.stripe.com/v1/payment_intents/${current.id}/confirm`, {
                method: 'POST', headers: { ...connectHeaders, 'Idempotency-Key': `cord-quote-confirm-${current.id}` },
                body: new URLSearchParams({ 'payment_method_data[type]': 'customer_balance' }).toString(),
                signal: AbortSignal.timeout(15000),
            });
            const confirmed: any = await result.json();
            if (!result.ok || confirmed.id !== current.id) return json({ error: 'No pudimos confirmar las instrucciones. Actualiza el enlace para consultar este mismo pago.' }, 502);
            current = confirmed;
        }
        if (['succeeded', 'processing', 'requires_capture'].includes(current.status)) return pendingPayment();
        if (current.status === 'canceled') throw new QuotePaymentConflict('payment_changed');
        if (method === 'spei') {
            const instructions = bankTransferInstructions(current, c.org_nombre as string);
            if (!instructions) return json({ error: 'No pudimos generar las instrucciones SPEI. Intenta de nuevo.' }, 502);
            return json({ metodo: method, instructions, amount, cobroId: cobro.id, cobroTipo: cobro.tipo });
        }
        if (!current.client_secret) return json({ error: 'No pudimos preparar el pago. Actualiza el enlace.' }, 502);
        return json({ metodo: method, clientSecret: current.client_secret, publishableKey: pubKey, accountId: acct, amount, cobroId: cobro.id, cobroTipo: cobro.tipo });
    }

    try {
        // ── 1) Reutilizar el PaymentIntent existente del COBRO si sigue vigente ──
        // Crucial para SPEI: la CLABE se asigna por customer — un PI/customer nuevo
        // en cada visita significaría una CLABE distinta en cada recarga.
        const prevId = cobro.stripe_payment_intent_id as string | null;
        let previousCustomer = '';
        if (prevId) {
            const prevRes = await fetch(`https://api.stripe.com/v1/payment_intents/${prevId}`, {
                headers: connectHeaders, signal: AbortSignal.timeout(15000),
            });
            const prev: any = await prevRes.json();
            if (!prevRes.ok || prev?.id !== prevId) {
                return json({ error: 'No pudimos verificar el pago anterior. Intenta de nuevo antes de cambiar de método.' }, 502);
            }
            previousCustomer = typeof prev.customer === 'string' ? prev.customer : String(prev.customer?.id || '');
            if (['succeeded', 'processing', 'requires_capture'].includes(prev.status)) return pendingPayment();
            if (prev.metadata?.cobro_id && prev.metadata.cobro_id !== cobro.id) return pendingPayment();
            const sameMethods = Array.isArray(prev.payment_method_types)
                && prev.payment_method_types.length === pmTypes.length
                && pmTypes.every((type) => prev.payment_method_types.includes(type));
            const sameTerms = sameMethods && prev.amount === amount
                && String(prev.currency).toLowerCase() === stripeCurrency(currency)
                && Number(prev.application_fee_amount || 0) === fee.applicationFeeCents;
            if (sameTerms && ['requires_payment_method', 'requires_confirmation', 'requires_action'].includes(prev.status)) {
                const [currentRows] = await withOrgTx(orgId, sql`update cotizacion_cobros set
                    metodo_pago = ${method}, application_fee_cents = ${fee.applicationFeeCents},
                    fee_base_cents = ${fee.feeBaseCents}, fee_iva_cents = ${fee.feeIvaCents},
                    fee_total_cents = ${fee.applicationFeeCents}
                    where id = ${cobro.id} and org_id = ${orgId} and status = 'pendiente'
                      and monto = ${Number(cobro.monto)} and stripe_payment_intent_id = ${prevId}
                      and exists (select 1 from cotizaciones q where q.id = ${c.id} and q.org_id = ${orgId}
                                  and q.status in ('approved', 'invoiced') and q.total = ${Number(c.total)}
                                  and upper(coalesce(q.base_currency, ${currency})) = ${currency})
                    returning id`);
                if (!currentRows.length) throw new QuotePaymentConflict('payment_changed');
                after(trackServer('checkout_resumed', orgId, {
                    quote_id: c.id, cobro_id: cobro.id, cobro_tipo: cobro.tipo, checkout_id: prev.id,
                    amount: fromMinorUnits(amount, currency), currency, payment_method: method || 'choice',
                    checkout_version: checkoutV2 ? 2 : 1, source: 'public_link',
                }, !!c.sandbox_of, !!c.is_demo));
                return await presentIntent(prev);
            }
            if (prev.status !== 'canceled') {
                // An authorization, processing payment or partially funded SPEI
                // must not be canceled/replaced to offer a different method.
                const remaining = prev.next_action?.display_bank_transfer_instructions?.amount_remaining;
                const funded = Number(prev.amount_received || 0) > 0 || Number(prev.amount_capturable || 0) > 0
                    || (remaining != null && Number(remaining) < Number(prev.amount));
                if (funded || !['requires_payment_method', 'requires_confirmation', 'requires_action'].includes(prev.status)) return pendingPayment();
                let canceled = false;
                try {
                    const result = await fetch(`https://api.stripe.com/v1/payment_intents/${prevId}/cancel`, {
                        method: 'POST', headers: { ...connectHeaders, 'Idempotency-Key': `cord-quote-cancel-${prevId}` },
                        signal: AbortSignal.timeout(15000),
                    });
                    const data: any = await result.json();
                    canceled = result.ok && data.id === prevId && data.status === 'canceled';
                } catch { /* response loss is resolved by a fresh authoritative read below */ }
                if (!canceled) {
                    const result = await fetch(`https://api.stripe.com/v1/payment_intents/${prevId}`, { headers: connectHeaders, signal: AbortSignal.timeout(15000) });
                    const data: any = await result.json();
                    canceled = result.ok && data.id === prevId && data.status === 'canceled';
                }
                if (!canceled) return pendingPayment();
            }
        }

        // ── 2) Customer (solo requerido por customer_balance / SPEI) ──────────
        // Un customer POR COBRO (no por cotización): la CLABE de SPEI se asigna
        // por customer, y cada cobro necesita la suya para conciliarse solo.
        let customerId = previousCustomer;
        if (!customerId && (method === 'spei' || (!checkoutV2 && c.cobro_spei_auto && speiDisponible))) {
            const cusForm = new URLSearchParams();
            cusForm.set('metadata[cotizacion_id]', c.id as string);
            cusForm.set('metadata[cobro_id]', cobro.id as string);
            cusForm.set('description', `Cliente de cotización ${c.folio} (${cobro.tipo})`);
            // Idempotencia determinística por COBRO: sin ella, un reintento del
            // navegador (o un doble clic) acuñaba un Customer nuevo en la cuenta
            // conectada, y como la CLABE de SPEI se asigna POR CUSTOMER, el
            // cliente terminaba con dos CLABEs vivas para la misma factura y el
            // pago llegaba a una que nadie estaba conciliando.
            const cusRes = await fetch('https://api.stripe.com/v1/customers', {
                method: 'POST',
                headers: { ...connectHeaders, 'Idempotency-Key': `cord-cus-${cobro.id}` },
                body: cusForm.toString(),
            });
            const cus: any = await cusRes.json();
            if (!cusRes.ok || !cus?.id) {
                const safe = payerError(cus?.error);
                log.error('el proveedor rechazó la creación del customer', { route: 'cord-pagos', reference: safe.reference, err: cus?.error });
                return json({ error: `${safe.message} Ref: ${safe.reference}` }, 502);
            }
            customerId = cus.id;
        }

        // ── 3) Crear el PaymentIntent ─────────────────────────────────────────
        // NO se manda payment_method_data: el Payment Element decide el método al
        // confirmar. Forzarlo a customer_balance aquí rompía el pago con tarjeta
        // cuando ambos métodos estaban activos.
        const tipoDesc = cobro.tipo === 'anticipo' ? ' (anticipo)'
            : cobro.tipo === 'saldo' ? ' (saldo)'
            : cobro.tipo === 'cuota' ? ` (cuota ${cobro.numero_cuota})`
            : '';
        const form = new URLSearchParams();
        form.set('amount', String(amount));
        form.set('currency', stripeCurrency(currency));
        form.set('description', `Cotización ${c.folio}${tipoDesc} — ${c.org_nombre}`);
        form.set('metadata[token]', token);
        form.set('metadata[cotizacion_id]', c.id as string);
        form.set('metadata[folio]', String(c.folio ?? ''));
        form.set('metadata[cobro_id]', cobro.id as string);
        form.set('metadata[cobro_tipo]', String(cobro.tipo ?? 'total'));
        pmTypes.forEach((t, i) => form.set(`payment_method_types[${i}]`, t));
        if (method === 'spei' || (!checkoutV2 && c.cobro_spei_auto && speiDisponible)) {
            form.set('payment_method_options[customer_balance][funding_type]', 'bank_transfer');
            form.set('payment_method_options[customer_balance][bank_transfer][type]', 'mx_bank_transfer');
        }
        // Carry the existing customer through card switches as well, so a
        // later return to SPEI can reuse its bank-transfer destination.
        if (customerId) form.set('customer', customerId);
        if (fee.applicationFeeCents > 0) form.set('application_fee_amount', String(fee.applicationFeeCents));


        const attemptInput = { orgId, quoteId: String(c.id), cobroId: String(cobro.id), previousId: prevId,
            amount: Number(cobro.monto), quoteTotal: Number(c.total), currency, request: form };
        const attempt = await claimQuotePaymentAttempt(attemptInput);
        form.set('metadata[cord_attempt_id]', attempt.id);
        let data: any;
        if (attempt.paymentIntentId) {
            const res = await fetch(`https://api.stripe.com/v1/payment_intents/${attempt.paymentIntentId}`, { headers: connectHeaders, signal: AbortSignal.timeout(15000) });
            data = await res.json();
            if (!res.ok || data.id !== attempt.paymentIntentId) throw new Error('No se pudo recuperar el intento');
        } else {
            const res = await fetch('https://api.stripe.com/v1/payment_intents', {
                method: 'POST', headers: { ...connectHeaders, 'Idempotency-Key': `cord-quote-attempt-${attempt.id}` },
                body: form.toString(), signal: AbortSignal.timeout(15000),
            });
            data = await res.json();
            if (!res.ok || !data?.id) {
                if (data?.error?.type === 'idempotency_error' || data?.error?.code === 'idempotency_key_in_use') return pendingPayment();
                const safe = payerError(data?.error);
                log.error('el proveedor rechazó el payment intent', { route: 'cord-pagos', reference: safe.reference, err: data?.error });
                return json({ error: `${safe.message} Ref: ${safe.reference}` }, 502);
            }
        }
        if (data.amount !== amount || data.currency !== stripeCurrency(currency)) throw new QuotePaymentConflict('payment_changed');
        await publishQuotePaymentAttempt(attemptInput, attempt.id, data.id, fee, method);
        // Compat: la columna legacy sigue reflejando el PI del pago total simple
        // (nadie más la escribe; queda de solo-lectura para cotizaciones viejas).
        if (cobro.tipo === 'total') {
            await withOrgTx(orgId, sql`update cotizaciones set stripe_payment_intent_id = ${data.id}
                where id = ${c.id} and org_id = ${orgId}
                  and exists (select 1 from cotizacion_cobros co where co.id = ${cobro.id} and co.org_id = ${orgId}
                              and co.stripe_payment_intent_id = ${data.id})`);
        }

        // `checkout_started` significa un checkout NUEVO, no cada recarga del
        // link. Los PaymentIntents reutilizados emiten `checkout_resumed` arriba.
        after(trackServer('checkout_started', orgId, {
            event_id: data.id,
            quote_id: c.id,
            cobro_id: cobro.id,
            cobro_tipo: cobro.tipo,
            checkout_id: data.id,
            amount: fromMinorUnits(amount, currency),
            currency,
            payment_method: method || 'choice',
            checkout_version: checkoutV2 ? 2 : 1,
            source: 'public_link',
        }, !!c.sandbox_of, !!c.is_demo));

        return await presentIntent(data);
    } catch (e) {
        if (e instanceof QuotePaymentConflict) return json({ error: e.message, code: e.code }, 409);
        log.error('error no controlado', { route: 'cord-pagos', err: e });
        return json({ error: 'No pudimos conectar con el procesador de pagos' }, 502);
    }
};

function json(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer' } });
}

function pendingPayment() {
    return json({ error: 'Hay un pago recibido o en proceso de confirmación. Actualiza el enlace en unos momentos antes de intentar otro método.', code: 'payment_pending' }, 409);
}

function bankTransferInstructions(paymentIntent: any, beneficiary: string) {
    const display = paymentIntent?.next_action?.display_bank_transfer_instructions;
    const addresses = Array.isArray(display?.financial_addresses) ? display.financial_addresses : [];
    const spei = addresses.map((address: any) => address?.spei).find((value: any) => value?.clabe);
    if (!display || !spei?.clabe || !spei?.bank_name || !display?.reference) return null;
    return {
        clabe: String(spei.clabe),
        bankName: String(spei.bank_name),
        beneficiary: String(beneficiary || 'Beneficiario'),
        reference: String(display.reference),
        amountRemaining: Number(display.amount_remaining || paymentIntent.amount || 0),
        currency: String(display.currency || paymentIntent.currency || 'mxn').toUpperCase(),
        expiresAt: Number(display.expires_at || 0) || null,
    };
}

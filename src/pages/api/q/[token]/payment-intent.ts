export const prerender = false;

import type { APIRoute } from 'astro';
import { sql, resolvePublicQuote, withOrgTx } from '../../../../lib/db';
import { rateLimit, tooMany } from '../../../../lib/ratelimit';
import { dueDateFor, isoDay, venceDia, materializeAnticipoCobros } from '../../../../lib/cobros';
import { trackServer } from '../../../../lib/posthog-server';
import { computeFee, isFeeScheduleActive, type PaymentFeeMethod } from '../../../../lib/fees';
import { payerError } from '../../../../lib/pay-errors';
import { after } from '../../../../lib/after';

const STRIPE_KEY = import.meta.env.STRIPE_SECRET_KEY || process.env.STRIPE_SECRET_KEY;

export const POST: APIRoute = async ({ params, request }) => {
    if (!STRIPE_KEY) return json({ error: 'El pago en línea aún no está configurado.' }, 503);
    const token = params.token ?? '';
    const rl = await rateLimit(`pi:${token}`, 10, 60);
    if (!rl.ok) return tooMany(rl.retryAfter);

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
        select c.id, c.org_id, c.folio, c.total, c.status, c.anticipo_pct,
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

    const totalCents = Math.round(Number(c.total) * 100);
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

    // Re-versión: si el total cambió después de materializar los cobros y aún
    // no se pagó NINGUNO, se regeneran (sus montos congelados ya no suman el total).
    // ANTES de borrar, se cancelan sus PaymentIntents en Stripe: un PI en vuelo
    // (CLABE SPEI emitida) podría liquidarse después y quedaría huérfano. Si
    // algún PI no se puede cancelar (p. ej. SPEI 'processing'), se ABORTA la
    // regeneración — mejor un desglose desactualizado que un pago sin rastro.
    const activos = cobros.filter((co: any) => co.status !== 'cancelado');
    const sumCents = activos.reduce((s: number, co: any) => s + Math.round(Number(co.monto) * 100), 0);
    const nadaPagado = cobros.every((co: any) => co.status !== 'pagado');
    if (cobros.length && nadaPagado && sumCents !== totalCents) {
        let cancelablesOk = true;
        for (const co of cobros) {
            if (co.status !== 'pendiente' || !co.stripe_payment_intent_id) continue;
            try {
                const r = await fetch(`https://api.stripe.com/v1/payment_intents/${co.stripe_payment_intent_id}/cancel`, {
                    method: 'POST', headers: connectHeaders,
                });
                if (!r.ok) {
                    const d: any = await r.json().catch(() => ({}));
                    // "ya cancelado" es aceptable; cualquier otro fallo aborta.
                    const yaCancelado = String(d?.error?.message || '').includes('canceled');
                    if (!yaCancelado) { cancelablesOk = false; break; }
                }
            } catch { cancelablesOk = false; break; }
        }
        if (cancelablesOk) {
            await withOrgTx(orgId, sql`delete from cotizacion_cobros
                where org_id = ${orgId} and cotizacion_id = ${c.id} and status = 'pendiente'`);
            cobros = [];
            requestedCobroId = '';
        }
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

    const amount = Math.round(Number(cobro.monto) * 100); // centavos
    if (!(amount > 0)) return json({ error: 'Monto de cobro inválido' }, 500);
    const fee = method
        ? computeFee({
            amountCents: amount,
            metodo: method,
            moneda: String(c.moneda || 'MXN'),
            enabled: isFeeScheduleActive(c.fee_enabled, c.fee_terms_version),
        })
        : computeFee({ amountCents: amount, metodo: 'card', moneda: 'MXN', enabled: false });

    const pubKey = import.meta.env.PUBLIC_STRIPE_PUBLISHABLE_KEY || process.env.PUBLIC_STRIPE_PUBLISHABLE_KEY;

    // Los payment_method_types según la config vigente del vendedor. Se calculan
    // aquí porque también deciden si un PI previo sigue siendo reutilizable.
    const pmTypes: string[] = [];
    if (method === 'card') pmTypes.push('card');
    else if (method === 'spei') pmTypes.push('customer_balance');
    else {
        if (c.acepta_tarjeta) pmTypes.push('card');
        if (c.cobro_spei_auto) pmTypes.push('customer_balance');
    }

    try {
        // ── 1) Reutilizar el PaymentIntent existente del COBRO si sigue vigente ──
        // Crucial para SPEI: la CLABE se asigna por customer — un PI/customer nuevo
        // en cada visita significaría una CLABE distinta en cada recarga.
        const prevId = cobro.stripe_payment_intent_id as string | null;
        if (prevId) {
            const prevRes = await fetch(`https://api.stripe.com/v1/payment_intents/${prevId}`, {
                headers: connectHeaders,
            });
            const prev: any = await prevRes.json();
            if (prevRes.ok && prev?.id) {
                if (prev.status === 'succeeded') {
                    return json({ alreadyPaid: true });
                }
                const sameMethods = Array.isArray(prev.payment_method_types)
                    && prev.payment_method_types.length === pmTypes.length
                    && pmTypes.every((t) => prev.payment_method_types.includes(t));
                const sameFee = Number(prev.application_fee_amount || 0) === fee.applicationFeeCents;
                const updateable = ['requires_payment_method', 'requires_confirmation'].includes(prev.status);
                const reusable = !['canceled'].includes(prev.status) && sameMethods
                    && ((prev.amount === amount && sameFee) || (method !== 'spei' && updateable));
                if (reusable) {
                    // Tarjeta: si cambia el monto, cambia también la comisión del
                    // MISMO PI. SPEI ya confirmado conserva instrucciones estables.
                    let current = prev;
                    if ((prev.amount !== amount || !sameFee) && updateable) {
                        const upd = new URLSearchParams({ amount: String(amount) });
                        if (fee.applicationFeeCents > 0) upd.set('application_fee_amount', String(fee.applicationFeeCents));
                        const updated = await fetch(`https://api.stripe.com/v1/payment_intents/${prevId}`, {
                            method: 'POST', headers: connectHeaders, body: upd.toString(),
                        });
                        current = await updated.json();
                        if (!updated.ok) throw current?.error || new Error('No se pudo actualizar el cobro');
                    }
                    await withOrgTx(orgId, sql`update cotizacion_cobros set
                        metodo_pago = ${method}, application_fee_cents = ${fee.applicationFeeCents},
                        fee_base_cents = ${fee.feeBaseCents}, fee_iva_cents = ${fee.feeIvaCents},
                        fee_total_cents = ${fee.applicationFeeCents}
                        where id = ${cobro.id} and org_id = ${orgId}`);
                    after(trackServer('checkout_resumed', orgId, {
                        quote_id: c.id,
                        cobro_id: cobro.id,
                        cobro_tipo: cobro.tipo,
                        checkout_id: current.id,
                        amount: amount / 100,
                        currency: String(c.moneda || 'MXN').toUpperCase(),
                        payment_method: method || 'choice',
                        checkout_version: checkoutV2 ? 2 : 1,
                        source: 'public_link',
                    }, !!c.sandbox_of, !!c.is_demo));
                    if (method === 'spei') {
                        const instructions = bankTransferInstructions(current, c.org_nombre as string);
                        if (!instructions) return json({ error: 'No pudimos generar las instrucciones SPEI. Intenta de nuevo.' }, 502);
                        return json({ metodo: method, instructions, amount, cobroId: cobro.id, cobroTipo: cobro.tipo });
                    }
                    return json({ metodo: method, clientSecret: current.client_secret, publishableKey: pubKey, accountId: acct, amount, cobroId: cobro.id, cobroTipo: cobro.tipo });
                }
            }
            // No existe / cancelado / cambió la config → crear uno nuevo abajo.
        }

        // ── 2) Customer (solo requerido por customer_balance / SPEI) ──────────
        // Un customer POR COBRO (no por cotización): la CLABE de SPEI se asigna
        // por customer, y cada cobro necesita la suya para conciliarse solo.
        let customerId = '';
        if (method === 'spei' || (!checkoutV2 && c.cobro_spei_auto)) {
            const cusForm = new URLSearchParams();
            cusForm.set('metadata[cotizacion_id]', c.id as string);
            cusForm.set('metadata[cobro_id]', cobro.id as string);
            cusForm.set('description', `Cliente de cotización ${c.folio} (${cobro.tipo})`);
            const cusRes = await fetch('https://api.stripe.com/v1/customers', {
                method: 'POST', headers: connectHeaders, body: cusForm.toString(),
            });
            const cus: any = await cusRes.json();
            if (!cusRes.ok || !cus?.id) {
                const safe = payerError(cus?.error);
                console.error(`[cord-pagos:${safe.reference}]`, cus?.error);
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
        form.set('currency', 'mxn');
        form.set('description', `Cotización ${c.folio}${tipoDesc} — ${c.org_nombre}`);
        form.set('metadata[token]', token);
        form.set('metadata[cotizacion_id]', c.id as string);
        form.set('metadata[folio]', String(c.folio ?? ''));
        form.set('metadata[cobro_id]', cobro.id as string);
        form.set('metadata[cobro_tipo]', String(cobro.tipo ?? 'total'));
        pmTypes.forEach((t, i) => form.set(`payment_method_types[${i}]`, t));
        if (method === 'spei' || (!checkoutV2 && c.cobro_spei_auto)) {
            form.set('payment_method_options[customer_balance][funding_type]', 'bank_transfer');
            form.set('payment_method_options[customer_balance][bank_transfer][type]', 'mx_bank_transfer');
        }
        if (customerId) form.set('customer', customerId);
        if (fee.applicationFeeCents > 0) form.set('application_fee_amount', String(fee.applicationFeeCents));
        if (method === 'spei') {
            form.set('confirm', 'true');
            form.set('payment_method_data[type]', 'customer_balance');
        }

        const res = await fetch('https://api.stripe.com/v1/payment_intents', {
            method: 'POST',
            headers: {
                ...connectHeaders,
                'Idempotency-Key': `cord-pi-${cobro.id}-${method || 'legacy'}-${amount}-${prevId || 'new'}`,
            },
            body: form.toString(),
        });
        const data: any = await res.json();
        if (!res.ok) {
            const safe = payerError(data?.error);
            console.error(`[cord-pagos:${safe.reference}]`, data?.error);
            return json({ error: `${safe.message} Ref: ${safe.reference}` }, 502);
        }

        const [updated] = await withOrgTx(orgId, sql`update cotizacion_cobros
                  set stripe_payment_intent_id = ${data.id}, metodo_pago = ${method},
                      application_fee_cents = ${fee.applicationFeeCents},
                      fee_base_cents = ${fee.feeBaseCents}, fee_iva_cents = ${fee.feeIvaCents},
                      fee_total_cents = ${fee.applicationFeeCents}
                  where id = ${cobro.id} and org_id = ${orgId}
                  returning id`);
        if (!updated.length) throw new Error('No se pudo ligar el cobro preparado');
        // Compat: la columna legacy sigue reflejando el PI del pago total simple
        // (nadie más la escribe; queda de solo-lectura para cotizaciones viejas).
        if (cobro.tipo === 'total') {
            await withOrgTx(orgId, sql`update cotizaciones set stripe_payment_intent_id = ${data.id}
                where id = ${c.id} and org_id = ${orgId}`);
        }

        // `checkout_started` significa un checkout NUEVO, no cada recarga del
        // link. Los PaymentIntents reutilizados emiten `checkout_resumed` arriba.
        after(trackServer('checkout_started', orgId, {
            event_id: data.id,
            quote_id: c.id,
            cobro_id: cobro.id,
            cobro_tipo: cobro.tipo,
            checkout_id: data.id,
            amount: amount / 100,
            currency: String(c.moneda || 'MXN').toUpperCase(),
            payment_method: method || 'choice',
            checkout_version: checkoutV2 ? 2 : 1,
            source: 'public_link',
        }, !!c.sandbox_of, !!c.is_demo));

        if (method === 'spei') {
            const instructions = bankTransferInstructions(data, c.org_nombre as string);
            if (!instructions) return json({ error: 'No pudimos generar las instrucciones SPEI. Intenta de nuevo.' }, 502);
            return json({ metodo: method, instructions, amount, cobroId: cobro.id, cobroTipo: cobro.tipo });
        }
        return json({ metodo: method, clientSecret: data.client_secret, publishableKey: pubKey, accountId: acct, amount, cobroId: cobro.id, cobroTipo: cobro.tipo });
    } catch (e) {
        console.error(e);
        return json({ error: 'No pudimos conectar con el procesador de pagos' }, 502);
    }
};

function json(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
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

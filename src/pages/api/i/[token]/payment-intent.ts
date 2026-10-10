// /api/i/[token]/payment-intent — cobro del SALDO de una factura desde su
// hosted invoice page.
//
// Hermano de /api/q/[token]/payment-intent, pero con un sujeto distinto: aquel
// cobra "rebanadas" de una cotización (anticipo, saldo, cuotas) y este cobra el
// saldo vivo de UN documento fiscal. Son dos ledgers distintos y mezclarlos
// haría que un anticipo de la cotización se descontara del saldo de la factura
// dos veces.
//
// Dos caminos, uno por método (`{ metodo }` en el cuerpo):
//
//   - Tarjeta y, si el negocio la encendió y su cuenta la tiene activa, la
//     domiciliación de la divisa de la factura (SEPA en EUR, ACH en USD;
//     `metodosDelCobro`). Devuelve el secreto para el Payment Element.
//   - SPEI (`metodo: 'spei'`): transferencia con CLABE, solo MXN y solo cuentas
//     mexicanas con la capacidad activa (`speiDisponible`). La CLABE es del
//     Customer del proveedor, así que cada FACTURA tiene el suyo
//     (`documentos_fiscales.stripe_spei_customer_id`) y nunca hay más de un
//     intento SPEI abierto por factura: lo que llegue a esa CLABE solo puede
//     fondear un pago de ella. El intento se liga a la factura ANTES de
//     confirmarse (la confirmación devuelve las instrucciones) y el servidor
//     responde CLABE, banco, referencia e importe. El pago se registra cuando el
//     proveedor lo completa (`payment_intent.succeeded`); un fondeo parcial no
//     es dinero del negocio todavía. Contrato completo en `src/lib/cobros/spei.ts`.
//
// Admite ABONO PARCIAL: el cuerpo puede traer `{ monto }`. El monto lo propone
// el cliente y por eso se acota contra el saldo real de la base — nunca se
// confía en el importe que llega del navegador.
export const prerender = false;

import type { APIRoute } from 'astro';
import { sql, resolvePublicInvoice, withOrgTx } from '../../../../lib/db';
import { currencyDecimals, normalizeCurrency, stripeCurrency, stripeSupportsCurrency, toMinorUnits } from '../../../../lib/currency';
import { computeFee, isFeeScheduleActive } from '../../../../lib/fees';
import { setInvoiceFeeMetadata } from '../../../../lib/invoice-payment-fees';
import { payerError } from '../../../../lib/pay-errors';
import { log } from '../../../../lib/log';
import { limitPublicPayment } from '../../../../lib/connect-security';
import { after } from '../../../../lib/after';
import { trackServer } from '../../../../lib/posthog-server';
import { metodosDelCobro } from '../../../../lib/cobros/agrupados';
import { speiDisponible } from '../../../../lib/cobros/metodos';
import { esIntentSpei, fondeoSpei, instruccionesSpei } from '../../../../lib/cobros/spei';

const STRIPE_KEY = import.meta.env.STRIPE_SECRET_KEY || process.env.STRIPE_SECRET_KEY;

export const POST: APIRoute = async ({ params, request }) => {
    if (!STRIPE_KEY) return json({ error: 'El pago en línea aún no está disponible.' }, 503);
    const token = params.token ?? '';
    const limited = await limitPublicPayment(request, 'ipi', token, 10);
    if (limited) return limited;

    const identity = await resolvePublicInvoice(token);
    if (!identity) return json({ error: 'Factura no encontrada' }, 404);

    const [rows] = await withOrgTx(identity.orgId, sql`
        select d.id, d.org_id, d.invoice_number, d.lifecycle, d.currency,
               d.total, d.amount_remaining, d.stripe_payment_intent_id, d.credit_note_of, d.document_type,
               exists (select 1 from documento_pagos p
                       where p.documento_id = d.id and p.org_id = d.org_id
                         and p.stripe_payment_intent_id = d.stripe_payment_intent_id) as previous_payment_applied,
               d.provider_data, d.pago_en_proceso_pi,
               exists (select 1 from pago_agrupado_documentos a
                        join pagos_agrupados p on p.id = a.pago_id and p.org_id = a.org_id
                       where a.org_id = d.org_id and a.documento_id = d.id
                         and p.estado in ('creado', 'procesando')) as agrupado_en_vuelo,
               o.sandbox_of, o.is_demo, o.stripe_account_id, o.stripe_charges_enabled,
               o.acepta_tarjeta, o.acepta_domiciliacion, o.stripe_capacidades, o.nombre as org_nombre, o.moneda,
               o.fee_enabled, o.fee_terms_version,
               o.cobro_spei_auto, o.country_code as org_country, d.stripe_spei_customer_id,
               coalesce(nullif(d.recipient_snapshot->>'email', ''), cl.email) as cliente_email
          from documentos_fiscales d
          join orgs o on o.id = d.org_id
          left join clientes cl on cl.id = d.cliente_id and cl.org_id = d.org_id
         where d.id = ${identity.id} and d.org_id = ${identity.orgId}`);
    if (!rows.length) return json({ error: 'Factura no encontrada' }, 404);
    const d = rows[0];
    const orgId = d.org_id as string;

    if (d.credit_note_of || ['cfdi_egreso', 'credit_note'].includes(String(d.document_type))) {
        return json({ error: 'Una nota de crédito no admite cobros.' }, 409);
    }
    if (d.lifecycle === 'paid') return json({ alreadyPaid: true });
    if (d.lifecycle !== 'open') {
        return json({ error: 'Esta factura no está abierta a pago.' }, 409);
    }
    // Con la cancelación del CFDI en trámite la factura sigue `open`, pero va a
    // anularse: cobrarla ahora dejaría dinero sobre un documento muerto.
    if (['pending', 'verifying'].includes(String(d.provider_data?.cancelacion?.status ?? ''))) {
        return json({ error: 'Esta factura está en proceso de cancelación y no admite pagos.' }, 409);
    }
    if (d.sandbox_of) {
        return json({ error: 'Esta factura es de prueba. El pago en línea está deshabilitado.' }, 409);
    }
    if (d.provider_data?.simulado === true || d.provider_data?.livemode === false) {
        return json({ error: 'Este documento no tiene una emisión fiscal activa. El pago en línea está deshabilitado.' }, 409);
    }
    if (!d.stripe_account_id || !d.stripe_charges_enabled) {
        return json({ error: 'El negocio todavía no tiene configurada su cuenta para recibir pagos.' }, 403);
    }
    // Un débito bancario tarda días: mientras está en proceso (o la factura va
    // dentro de un cobro agrupado del portal o del cobro automático) no se abre
    // otro cobro sobre el mismo saldo.
    if (d.pago_en_proceso_pi || d.agrupado_en_vuelo) {
        return json({ error: 'Hay un pago en proceso para esta factura. Espera su confirmación antes de pagar otra vez.', code: 'payment_pending' }, 409);
    }

    // Regla 21: la divisa del cobro es la de la FACTURA, no la de la org.
    const currency = normalizeCurrency((d.currency as string) || (d.moneda as string));
    if (!stripeSupportsCurrency(currency)) {
        return json({ error: 'El pago en línea todavía no está disponible para la moneda de esta factura.' }, 409);
    }
    const body = await request.json().catch(() => ({} as any));
    // Sin `metodo` (o con cualquier otro valor) es el camino de siempre: el
    // Payment Element con tarjeta o domiciliación.
    const metodo: 'card' | 'spei' = body?.metodo === 'spei' ? 'spei' : 'card';
    const metodos = metodosDelCobro({
        nombre: String(d.org_nombre || ''), stripeAccountId: String(d.stripe_account_id),
        aceptaTarjeta: !!d.acepta_tarjeta, aceptaDomiciliacion: !!d.acepta_domiciliacion,
        capacidades: d.stripe_capacidades, feeEnabled: d.fee_enabled, feeTermsVersion: d.fee_terms_version,
    }, currency);
    // Regla 21: SPEI es de México y solo liquida MXN. Se decide con la misma
    // regla que pinta la opción en la factura, no con lo que mande el navegador.
    const spei = speiDisponible({
        pais: d.org_country as string, cobroSpeiAuto: !!d.cobro_spei_auto, capacidades: d.stripe_capacidades,
    }, currency);
    if (metodo === 'spei' && !spei) {
        return json({ error: 'La transferencia SPEI no está disponible para esta factura.' }, 409);
    }
    if (metodo === 'card' && !metodos.length) {
        return json({ error: spei
            ? 'Esta factura se paga por transferencia SPEI.'
            : 'El negocio no acepta pagos en línea para esta factura.' }, spei ? 409 : 403);
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

    // La comisión de Cord es la de la tabla del método (`fees.ts`): SPEI cobra
    // la suya, igual que en la cotización. Fuera de MXN no hay comisión.
    const fee = computeFee({
        amountCents: amount,
        metodo,
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

    /**
     * Cancela un intento SIN fondos para reemplazarlo. Falla cerrado: una
     * respuesta perdida no autoriza otro intento; solo una lectura del
     * proveedor que diga `canceled`.
     */
    const cancelarIntent = async (id: string): Promise<boolean> => {
        try {
            const res = await fetch(`https://api.stripe.com/v1/payment_intents/${id}/cancel`, {
                method: 'POST', headers: { ...headers, 'Idempotency-Key': `cord-inv-cancel-${id}` },
                signal: AbortSignal.timeout(15000),
            });
            const data: any = await res.json();
            if (res.ok && data?.id === id && data.status === 'canceled') return true;
        } catch { /* se resuelve con la lectura de abajo */ }
        try {
            const res = await fetch(`https://api.stripe.com/v1/payment_intents/${id}`, { headers, signal: AbortSignal.timeout(15000) });
            const data: any = await res.json();
            return res.ok && data?.id === id && data.status === 'canceled';
        } catch {
            return false;
        }
    };

    /**
     * Confirma (si hace falta) el intento SPEI ya ligado a la factura y devuelve
     * sus instrucciones. Confirmar DESPUÉS de ligarlo importa: si el saldo del
     * cliente ya cubre el pago, el proveedor lo completa en el acto y el webhook
     * tiene que encontrar a qué factura aplicarlo.
     */
    const presentarSpei = async (intent: any): Promise<Response> => {
        let actual = intent;
        if (['requires_payment_method', 'requires_confirmation'].includes(actual?.status)) {
            const res = await fetch(`https://api.stripe.com/v1/payment_intents/${actual.id}/confirm`, {
                method: 'POST', headers: { ...headers, 'Idempotency-Key': `cord-inv-spei-confirm-${actual.id}` },
                body: new URLSearchParams({ 'payment_method_data[type]': 'customer_balance' }).toString(),
                signal: AbortSignal.timeout(15000),
            });
            const confirmado: any = await res.json();
            if (!res.ok || confirmado?.id !== actual.id) {
                const safe = payerError(confirmado?.error);
                log.error('el proveedor no confirmó el SPEI de la factura', { route: 'cord-pagos', reference: safe.reference, err: confirmado?.error });
                return json({ error: `No pudimos generar las instrucciones SPEI. Actualiza la factura para consultar este mismo pago. Ref: ${safe.reference}` }, 502);
            }
            actual = confirmado;
        }
        if (['succeeded', 'processing', 'requires_capture'].includes(actual?.status)) {
            return json({ error: 'Ya recibimos una transferencia que cubre este pago. Estamos registrándolo: actualiza la factura en unos momentos.', code: 'payment_pending' }, 409);
        }
        if (actual?.status === 'canceled') {
            return json({ error: 'El pago cambió. Actualiza la factura antes de continuar.', code: 'payment_changed' }, 409);
        }
        const instructions = instruccionesSpei(actual, d.org_nombre as string);
        if (!instructions) return json({ error: 'No pudimos generar las instrucciones SPEI. Intenta de nuevo.' }, 502);
        return json({ metodo: 'spei', instructions, amount: instructions.amount, currency });
    };

    try {
        // Reutilizar el PaymentIntent vivo de esta factura. Sin esto, cada
        // recarga de la página abre un intento nuevo y el cliente termina con
        // varios cobros en vuelo por la misma factura.
        const prevId = d.stripe_payment_intent_id as string | null;
        if (prevId) {
            const prevRes = await fetch(`https://api.stripe.com/v1/payment_intents/${prevId}`, { headers });
            const prev: any = await prevRes.json();
            // Una respuesta fallida no demuestra que el intento ya no exista.
            if (!prevRes.ok || prev?.id !== prevId) throw prev?.error || new Error('No se pudo verificar el abono anterior');
            if (prevRes.ok && prev?.id) {
                // El éxito de UN abono no liquida necesariamente la factura.
                // Esperar su asiento antes de ofrecer el siguiente evita cobrar
                // otra vez el saldo viejo mientras llega el webhook.
                if (prev.status === 'succeeded' && !d.previous_payment_applied) {
                    return json({ error: 'Estamos confirmando tu abono. Actualiza la factura en unos momentos.', code: 'payment_pending' }, 409);
                }
                const vivo = !['canceled', 'succeeded'].includes(prev.status);
                if (vivo && esIntentSpei(prev)) {
                    // Un SPEI abierto. Lo que ya llegó a la CLABE está RETENIDO en
                    // este intento: cancelarlo o cambiarle el importe lo devolvería
                    // al saldo del cliente sin un pago que lo reciba. Con fondos,
                    // solo se sigue esta misma transferencia.
                    if (fondeoSpei(prev).recibido > 0) {
                        if (metodo === 'spei') return await presentarSpei(prev);
                        return json({ error: 'Ya recibimos parte de tu transferencia SPEI. Transfiere lo que falta a la misma CLABE para completar este pago.', code: 'spei_parcial' }, 409);
                    }
                    const customerPrevio = typeof prev.customer === 'string' ? prev.customer : String(prev.customer?.id || '');
                    const mismoSpei = metodo === 'spei' && prev.amount === amount
                        && Number(prev.application_fee_amount || 0) === fee.applicationFeeCents
                        && customerPrevio === String(d.stripe_spei_customer_id || '');
                    if (mismoSpei) return await presentarSpei(prev);
                    // Sin fondos: se reemplaza por otro importe u otro método. La
                    // CLABE no cambia (es de la factura); el siguiente intento la
                    // vuelve a usar.
                    if (!(await cancelarIntent(prevId))) {
                        return json({ error: 'No pudimos cambiar el pago en curso. Actualiza la factura e intenta de nuevo.', code: 'payment_pending' }, 409);
                    }
                    prev.status = 'canceled';
                } else if (vivo && metodo === 'spei') {
                    // Un intento de tarjeta (o domiciliación) abierto. La
                    // transferencia lo reemplaza solo si no hay nada en vuelo.
                    if (!['requires_payment_method', 'requires_confirmation', 'requires_action'].includes(prev.status)
                        || Number(prev.amount_received || 0) > 0 || Number(prev.amount_capturable || 0) > 0) {
                        return json({ error: 'Hay un abono en proceso. Espera su confirmación antes de cambiar de método.', code: 'payment_pending' }, 409);
                    }
                    if (!(await cancelarIntent(prevId))) {
                        return json({ error: 'No pudimos cambiar el pago en curso. Actualiza la factura e intenta de nuevo.', code: 'payment_pending' }, 409);
                    }
                    prev.status = 'canceled';
                }
                const updateable = ['requires_payment_method', 'requires_confirmation'].includes(prev.status);
                const mismosMetodos = !Array.isArray(prev.payment_method_types)
                    || prev.payment_method_types.join(',') === metodos.join(',');
                const sameAmount = prev.amount === amount
                    && Number(prev.application_fee_amount || 0) === fee.applicationFeeCents && mismosMetodos;
                const terminal = ['canceled', 'succeeded'].includes(prev.status);
                if (!terminal && (sameAmount || updateable)) {
                    let current = prev;
                    if (!sameAmount && updateable) {
                        const upd = new URLSearchParams({ amount: String(amount) });
                        // El negocio pudo encender o apagar la domiciliación desde el intento anterior.
                        metodos.forEach((m, i) => upd.set(`payment_method_types[${i}]`, m));
                        setInvoiceFeeMetadata(upd, fee);
                        if (fee.applicationFeeCents > 0 || Number(prev.application_fee_amount) > 0) {
                            upd.set('application_fee_amount', String(fee.applicationFeeCents));
                        }
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
                if (!terminal) {
                    return json({ error: 'Hay un abono en proceso. Espera su confirmación antes de cambiar el importe.', code: 'payment_pending' }, 409);
                }
            }
        }

        const form = new URLSearchParams();
        form.set('amount', String(amount));
        form.set('currency', stripeCurrency(currency));
        form.set('description', `Factura ${d.invoice_number || ''} — ${d.org_nombre}`.trim());
        let speiCustomer = '';
        if (metodo === 'spei') {
            // El Customer de la factura: su CLABE. Se crea una vez y se guarda
            // antes del primer pago; la clave de idempotencia del proveedor
            // vence a las 24 horas y no basta para que la CLABE sea estable.
            speiCustomer = String(d.stripe_spei_customer_id || '');
            if (!speiCustomer) {
                const cus = new URLSearchParams();
                cus.set('description', `Factura ${d.invoice_number || ''} — ${d.org_nombre}`.trim());
                cus.set('metadata[documento_id]', d.id as string);
                cus.set('metadata[invoice_number]', String(d.invoice_number ?? ''));
                // El proveedor escribe a este correo para devolver una
                // transferencia (reembolso o saldo a favor): sin él, la
                // devolución falla.
                const correo = String(d.cliente_email || '').trim();
                if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) cus.set('email', correo);
                const cusRes = await fetch('https://api.stripe.com/v1/customers', {
                    method: 'POST',
                    headers: { ...headers, 'Idempotency-Key': `cord-inv-spei-cus-${d.id}` },
                    body: cus.toString(),
                });
                const cliente: any = await cusRes.json();
                if (!cusRes.ok || !cliente?.id) {
                    const safe = payerError(cliente?.error);
                    log.error('el proveedor rechazó el customer SPEI de la factura', { route: 'cord-pagos', reference: safe.reference, err: cliente?.error });
                    return json({ error: `${safe.message} Ref: ${safe.reference}` }, 502);
                }
                // Gana el primero: si otra pestaña ya guardó uno, se usa ese.
                const [guardado] = await withOrgTx(orgId, sql`
                    update documentos_fiscales
                       set stripe_spei_customer_id = coalesce(stripe_spei_customer_id, ${String(cliente.id)}), updated_at = now()
                     where id = ${d.id} and org_id = ${orgId}
                     returning stripe_spei_customer_id`);
                speiCustomer = String(guardado[0]?.stripe_spei_customer_id || '');
                if (!speiCustomer) {
                    return json({ error: 'El saldo o el abono cambió. Actualiza la factura antes de continuar.', code: 'payment_changed' }, 409);
                }
            }
            form.set('customer', speiCustomer);
            form.set('payment_method_types[0]', 'customer_balance');
            form.set('payment_method_options[customer_balance][funding_type]', 'bank_transfer');
            form.set('payment_method_options[customer_balance][bank_transfer][type]', 'mx_bank_transfer');
        } else {
            metodos.forEach((m, i) => form.set(`payment_method_types[${i}]`, m));
        }
        // El webhook concilia por esta metadata: sin `documento_id` el pago
        // llegaría a Stripe sin saber a qué factura se aplica.
        form.set('metadata[documento_id]', d.id as string);
        form.set('metadata[invoice_token]', token);
        form.set('metadata[invoice_number]', String(d.invoice_number ?? ''));
        setInvoiceFeeMetadata(form, fee);
        if (fee.applicationFeeCents > 0) form.set('application_fee_amount', String(fee.applicationFeeCents));

        // Una sola operación sucesora por intento anterior, independiente del
        // importe solicitado. Dos pestañas con montos distintos no crean dos PI;
        // Stripe rechaza parámetros distintos para la misma operación. Después
        // de registrar un abono, su id permite otro abono incluso del mismo monto.
        const res = await fetch('https://api.stripe.com/v1/payment_intents', {
            method: 'POST',
            headers: { ...headers, 'Idempotency-Key': `cord-inv-v2-${d.id}-${prevId || 'first'}` },
            body: form.toString(),
        });
        const data: any = await res.json();
        if (!res.ok || !data?.client_secret) {
            if (data?.error?.type === 'idempotency_error' || data?.error?.code === 'idempotency_key_in_use') {
                return json({ error: 'Ya se está preparando un abono. Actualiza la factura antes de continuar.', code: 'payment_changed' }, 409);
            }
            const safe = payerError(data?.error);
            log.error('el proveedor rechazó el cobro de factura', { route: 'cord-pagos', reference: safe.reference, err: data?.error });
            return json({ error: `${safe.message} Ref: ${safe.reference}` }, 502);
        }
        // Una respuesta repetida por idempotencia tiene que ser ESTE pago: otro
        // importe u otra CLABE no se presentan al cliente.
        if (metodo === 'spei' && (data.amount !== amount
            || (typeof data.customer === 'string' ? data.customer : String(data.customer?.id || '')) !== speiCustomer)) {
            return json({ error: 'El saldo o el abono cambió. Actualiza la factura antes de continuar.', code: 'payment_changed' }, 409);
        }

        const [saved] = await withOrgTx(orgId, sql`
            update documentos_fiscales
               set stripe_payment_intent_id = ${data.id}, updated_at = now()
             where id = ${d.id} and org_id = ${orgId}
               and lifecycle = 'open' and amount_remaining = ${saldo}
               and (stripe_payment_intent_id is not distinct from ${prevId}
                    or stripe_payment_intent_id = ${data.id})
             returning id`);
        if (!saved.length) {
            return json({ error: 'El saldo o el abono cambió. Actualiza la factura antes de continuar.', code: 'payment_changed' }, 409);
        }

        // Checkout NUEVO de una factura desde su hosted page — el gemelo del
        // `checkout_started` que ya emite /api/q/[token]/payment-intent. Las
        // banderas salen de la fila ya cargada: sin query extra (una query de
        // más aquí desincroniza los mocks de tests que encolan resultados).
        after(trackServer('checkout_started', orgId, {
            event_id: String(data.id),
            checkout_id: String(data.id),
            invoice_id: d.id as string,
            amount,
            currency,
            payment_method: metodo === 'spei' ? 'spei' : metodos.length === 1 && metodos[0] === 'card' ? 'tarjeta' : metodos.join('+'),
            checkout_version: 2,
            source: 'public_link',
        }, d.sandbox_of != null, !!d.is_demo));

        if (metodo === 'spei') return await presentarSpei(data);
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
    return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
}

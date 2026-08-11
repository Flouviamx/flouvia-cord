export const prerender = false;

// POST /api/q/[token]/subscription-intent
// Espejo de payment-intent.ts, pero para IGUALAS RECURRENTES (retainers): en vez
// de un PaymentIntent de un solo cobro, crea/reutiliza una Stripe Subscription
// sobre la cuenta conectada del vendedor (dinero directo a su banco). La
// suscripción nace `default_incomplete`: se devuelve el client_secret del
// PaymentIntent de la PRIMERA factura para que el cliente autorice la tarjeta con
// el Payment Element; una vez confirmada, Stripe cobra el total cada mes solo.
//
// SOLO tarjeta: SPEI/customer_balance NO auto-cobra (obliga al cliente a fondear su
// balance cada periodo), así que una iguala "automática" no puede correr sobre él.
import type { APIRoute } from 'astro';
import { sql, resolvePublicQuote, withOrgTx } from '../../../../lib/db';
import { rateLimit, tooMany } from '../../../../lib/ratelimit';
import { isFeeScheduleActive, SUBSCRIPTION_APPLICATION_FEE_PERCENT } from '../../../../lib/fees';
import { payerError } from '../../../../lib/pay-errors';

const STRIPE_KEY = import.meta.env.STRIPE_SECRET_KEY || process.env.STRIPE_SECRET_KEY;

export const POST: APIRoute = async ({ params }) => {
    if (!STRIPE_KEY) return json({ error: 'El pago en línea aún no está configurado.' }, 503);
    const token = params.token ?? '';
    const rl = await rateLimit(`si:${token}`, 10, 60);
    if (!rl.ok) return tooMany(rl.retryAfter);

    const identity = await resolvePublicQuote(token);
    if (!identity) return json({ error: 'Cotización no encontrada' }, 404);
    const [rows] = await withOrgTx(identity.orgId, sql`
        select c.id, c.org_id, c.folio, c.total, c.status, c.es_recurrente, c.cliente_id,
               o.sandbox_of, o.stripe_account_id, o.stripe_charges_enabled,
               o.acepta_tarjeta, o.nombre as org_nombre, o.fee_enabled, o.fee_terms_version
        from cotizaciones c
        join orgs o on o.id = c.org_id
        where c.id = ${identity.id} and c.org_id = ${identity.orgId}`);
    if (!rows.length) return json({ error: 'Cotización no encontrada' }, 404);
    const c = rows[0];
    const orgId = c.org_id as string;

    if (!c.es_recurrente) return json({ error: 'Esta cotización no es una iguala recurrente' }, 400);
    if (!['approved', 'invoiced'].includes(c.status as string)) {
        return json({ error: 'Esta cotización no está lista para autorizar el cobro' }, 409);
    }
    if (c.sandbox_of) {
        return json({ error: 'Esta cotización es de prueba — el cobro en línea está deshabilitado.' }, 409);
    }
    if (!c.stripe_account_id || !c.stripe_charges_enabled) {
        return json({ error: 'El vendedor no tiene configurada su cuenta para recibir pagos' }, 403);
    }
    if (!c.acepta_tarjeta) {
        // La iguala automática necesita tarjeta para renovar sola cada mes.
        return json({ error: 'El cobro recurrente requiere pago con tarjeta.' }, 403);
    }

    const amount = Math.round(Number(c.total) * 100); // centavos
    if (!(amount > 0)) return json({ error: 'Monto inválido' }, 500);

    const acct = c.stripe_account_id as string;
    const applicationFeePercent = isFeeScheduleActive(c.fee_enabled, c.fee_terms_version)
        ? SUBSCRIPTION_APPLICATION_FEE_PERCENT
        : null;
    const pubKey = import.meta.env.PUBLIC_STRIPE_PUBLISHABLE_KEY || process.env.PUBLIC_STRIPE_PUBLISHABLE_KEY;
    const H = {
        Authorization: `Bearer ${STRIPE_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Stripe-Account': acct,
    };
    // `idem` = Idempotency-Key determinística (derivada del cotizacion_id): dos
    // requests concurrentes (doble clic, doble pestaña, retry sin abort) que creen
    // el MISMO objeto reciben la MISMA respuesta de Stripe en vez de duplicar —
    // defensa robusta contra la carrera aunque el lock de Neon no exista.
    const sfetch = async (path: string, body?: URLSearchParams, method: 'GET' | 'POST' = 'POST', idem?: string) => {
        const isGet = method === 'GET';
        const url = isGet && body ? `https://api.stripe.com${path}?${body.toString()}` : `https://api.stripe.com${path}`;
        const headers: Record<string, string> = { ...H };
        if (idem && !isGet) headers['Idempotency-Key'] = idem;
        const res = await fetch(url, { method, headers, body: isGet ? undefined : body?.toString() });
        const data: any = await res.json();
        return { ok: res.ok, data };
    };
    const invoiceSecret = async (invoice: any): Promise<{ clientSecret: string; status: string | null } | null> => {
        let current = invoice;
        if (typeof current === 'string') {
            const expanded = new URLSearchParams();
            expanded.set('expand[0]', 'confirmation_secret');
            expanded.set('expand[1]', 'payments.data.payment.payment_intent');
            const fetched = await sfetch(`/v1/invoices/${current}`, expanded, 'GET');
            if (!fetched.ok) return null;
            current = fetched.data;
        }
        const legacy = current?.payment_intent;
        if (legacy?.client_secret) return { clientSecret: legacy.client_secret, status: legacy.status || null };
        if (current?.confirmation_secret?.client_secret) {
            return { clientSecret: current.confirmation_secret.client_secret, status: null };
        }
        const payment = (current?.payments?.data || []).find((entry: any) =>
            entry?.payment?.type === 'payment_intent' && entry?.payment?.payment_intent,
        )?.payment?.payment_intent;
        return payment?.client_secret ? { clientSecret: payment.client_secret, status: payment.status || null } : null;
    };
    const cid = c.id as string;

    try {
        // Fila de suscripción (una por cotización). Se crea perezosamente aquí.
        let [[sub]] = await withOrgTx(orgId, sql`
            select * from cotizacion_suscripciones where org_id = ${orgId} and cotizacion_id = ${c.id}`);
        if (!sub) {
            const [ins] = await withOrgTx(orgId, sql`
                insert into cotizacion_suscripciones (org_id, cotizacion_id, cliente_id, stripe_account_id, monto, moneda, estado)
                values (${c.org_id}, ${c.id}, ${c.cliente_id || null}, ${acct}, ${Number(c.total)}, 'MXN', 'incomplete')
                on conflict (cotizacion_id) do nothing
                returning *`);
            if (ins.length) sub = ins[0];
            else {
                const [[existing]] = await withOrgTx(orgId, sql`
                    select * from cotizacion_suscripciones where org_id = ${orgId} and cotizacion_id = ${c.id}`);
                sub = existing;
            }
        }

        // ── 1) Reutilizar la suscripción existente si sigue vigente ──────────────
        if (sub.stripe_subscription_id) {
            const { ok, data: existing } = await sfetch(
                `/v1/subscriptions/${sub.stripe_subscription_id}`,
                new URLSearchParams({ 'expand[0]': 'latest_invoice.confirmation_secret' }), 'GET');
            if (ok && existing?.id) {
                // Ya autorizada (o en reintento tras un fallo): nada que confirmar.
                if (['active', 'trialing', 'past_due'].includes(existing.status)) {
                    return json({ alreadyActive: true });
                }
                // Aún incompleta: reutilizar el PI de la primera factura si el monto
                // coincide y sigue confirmable. `on conflict` de la fila garantiza
                // que no re-creamos objetos de Stripe en cada visita del cliente.
                const secret = await invoiceSecret(existing?.latest_invoice);
                const currentUnit = existing?.items?.data?.[0]?.price?.unit_amount;
                const sameAmount = Number(currentUnit) === amount;
                const existingFee = existing?.application_fee_percent == null
                    ? null
                    : Number(existing.application_fee_percent);
                const sameFee = existingFee === applicationFeePercent;
                if (existing.status === 'incomplete' && secret?.clientSecret && sameAmount && sameFee
                    && (!secret.status || ['requires_payment_method', 'requires_confirmation', 'requires_action'].includes(secret.status))) {
                    return json({ clientSecret: secret.clientSecret, publishableKey: pubKey, accountId: acct, amount, subscription: true });
                }
                // Incompleta pero inservible (expirada, monto cambió, cancelada): la
                // cancelamos antes de crear una fresca para no dejar objetos huérfanos.
                if (['incomplete', 'incomplete_expired'].includes(existing.status)) {
                    await fetch(`https://api.stripe.com/v1/subscriptions/${sub.stripe_subscription_id}`, { method: 'DELETE', headers: H }).catch(() => {});
                }
            }
        }

        // ── 2) Customer en la cuenta conectada (reutilizar si ya existe) ─────────
        let customerId = sub.stripe_customer_id as string | null;
        if (customerId) {
            const { ok, data } = await sfetch(`/v1/customers/${customerId}`, undefined, 'GET');
            if (!ok || data?.deleted) customerId = null;
        }
        if (!customerId) {
            const cf = new URLSearchParams();
            cf.set('description', `Iguala ${c.folio} — ${c.org_nombre}`);
            cf.set('metadata[cotizacion_id]', cid);
            const { ok, data } = await sfetch('/v1/customers', cf, 'POST', `sub-cust-${cid}`);
            if (!ok || !data?.id) return payFailure(data?.error);
            customerId = data.id;
        }

        // ── 3) Product (reutilizar si ya existe) ────────────────────────────────
        let productId = sub.stripe_product_id as string | null;
        if (productId) {
            const { ok } = await sfetch(`/v1/products/${productId}`, undefined, 'GET');
            if (!ok) productId = null;
        }
        if (!productId) {
            const pf = new URLSearchParams();
            pf.set('name', `Iguala mensual — ${c.folio} (${c.org_nombre})`);
            pf.set('metadata[cotizacion_id]', cid);
            const { ok, data } = await sfetch('/v1/products', pf, 'POST', `sub-prod-${cid}`);
            if (!ok || !data?.id) return payFailure(data?.error);
            productId = data.id;
        }

        // ── 4) Price mensual (las prices son inmutables → crear una si el monto cambió) ──
        let priceId = sub.stripe_price_id as string | null;
        if (priceId) {
            const { ok, data } = await sfetch(`/v1/prices/${priceId}`, undefined, 'GET');
            if (!ok || Number(data?.unit_amount) !== amount || data?.recurring?.interval !== 'month') priceId = null;
        }
        if (!priceId) {
            const prf = new URLSearchParams();
            prf.set('unit_amount', String(amount));
            prf.set('currency', 'mxn');
            prf.set('recurring[interval]', 'month');
            prf.set('product', productId as string);
            const { ok, data } = await sfetch('/v1/prices', prf, 'POST', `sub-price-${cid}-${amount}`);
            if (!ok || !data?.id) return payFailure(data?.error);
            priceId = data.id;
        }

        // Re-lectura defensiva justo antes de crear: si otra request concurrente ya
        // dejó una suscripción en la fila mientras nosotros armábamos los objetos,
        // reutilizamos su PI en vez de crear otra (angosta la ventana de carrera; la
        // Idempotency-Key de abajo es la garantía real si aun así corremos a la par).
        const [[fresh]] = await withOrgTx(orgId, sql`
            select stripe_subscription_id from cotizacion_suscripciones where id = ${sub.id} and org_id = ${orgId}`);
        const existingSubId = (fresh?.stripe_subscription_id as string | null) || (sub.stripe_subscription_id as string | null) || null;
        if (existingSubId) {
            const { ok, data } = await sfetch(`/v1/subscriptions/${existingSubId}`,
                new URLSearchParams({ 'expand[0]': 'latest_invoice.confirmation_secret' }), 'GET');
            const access = ok ? await invoiceSecret(data?.latest_invoice) : null;
            const piCs = access?.clientSecret;
            if (ok && piCs && ['active', 'trialing', 'past_due'].includes(data.status)) return json({ alreadyActive: true });
            const freshFee = data?.application_fee_percent == null ? null : Number(data.application_fee_percent);
            if (ok && piCs && data.status === 'incomplete' && freshFee === applicationFeePercent) {
                return json({ clientSecret: piCs, publishableKey: pubKey, accountId: acct, amount, subscription: true });
            }
        }

        // ── 5) Subscription (default_incomplete) ────────────────────────────────
        // Idempotency-Key basada en (cotizacion_id + sub que reemplaza): dos requests
        // que arranquen del MISMO estado crean la MISMA suscripción; una recreación
        // legítima (reemplazando otra sub) usa otra key y sí crea una nueva.
        const subForm = new URLSearchParams();
        subForm.set('customer', customerId as string);
        subForm.set('items[0][price]', priceId as string);
        subForm.set('payment_behavior', 'default_incomplete');
        subForm.set('payment_settings[save_default_payment_method]', 'on_subscription');
        subForm.set('payment_settings[payment_method_types][0]', 'card');
        subForm.set('expand[0]', 'latest_invoice.confirmation_secret');
        subForm.set('metadata[cotizacion_id]', cid);
        subForm.set('metadata[org_id]', c.org_id as string);
        subForm.set('metadata[token]', token);
        subForm.set('metadata[suscripcion_id]', sub.id as string);
        if (applicationFeePercent != null) {
            subForm.set('application_fee_percent', String(applicationFeePercent));
        }
        const { ok, data: newSub } = await sfetch('/v1/subscriptions', subForm, 'POST', `sub-${cid}-${existingSubId || 'new'}`);
        if (!ok || !newSub?.id) return payFailure(newSub?.error);

        const access = await invoiceSecret(newSub?.latest_invoice);
        const clientSecret = access?.clientSecret;
        if (!clientSecret) return json({ error: 'No se pudo preparar el cobro de la suscripción' }, 502);

        const [updated] = await withOrgTx(orgId, sql`
            update cotizacion_suscripciones set
                stripe_subscription_id = ${newSub.id},
                stripe_customer_id = ${customerId},
                stripe_product_id = ${productId},
                stripe_price_id = ${priceId},
                monto = ${Number(c.total)},
                application_fee_percent = ${applicationFeePercent},
                estado = ${newSub.status || 'incomplete'}
            where id = ${sub.id} and org_id = ${orgId}
            returning id`);
        if (!updated.length) throw new Error('No se pudo ligar la iguala preparada');

        return json({ clientSecret, publishableKey: pubKey, accountId: acct, amount, subscription: true });
    } catch (e) {
        console.error('[subscription-intent]', e);
        return payFailure(e);
    }
};

function payFailure(error: unknown) {
    const safe = payerError(error);
    console.error('[subscription-intent] error de proveedor', { reference: safe.reference });
    return json({ error: safe.message, reference: safe.reference }, 502);
}

function json(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

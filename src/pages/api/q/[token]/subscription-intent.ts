export const prerender = false;

// POST /api/q/[token]/subscription-intent
// Espejo de payment-intent.ts, pero para IGUALAS RECURRENTES (retainers): en vez
// de un PaymentIntent de un solo cobro, crea/reutiliza una Stripe Subscription
// sobre la CUENTA CONECTADA del vendedor (dinero directo a su banco, cero comisión
// de Cord — mismo patrón `Stripe-Account: acct_...` que payment-intent.ts). La
// suscripción nace `default_incomplete`: se devuelve el client_secret del
// PaymentIntent de la PRIMERA factura para que el cliente autorice la tarjeta con
// el Payment Element; una vez confirmada, Stripe cobra el total cada mes solo.
//
// SOLO tarjeta: SPEI/customer_balance NO auto-cobra (obliga al cliente a fondear su
// balance cada periodo), así que una iguala "automática" no puede correr sobre él.
import type { APIRoute } from 'astro';
import { sql } from '../../../../lib/db';
import { rateLimit, tooMany } from '../../../../lib/ratelimit';

const STRIPE_KEY = import.meta.env.STRIPE_SECRET_KEY || process.env.STRIPE_SECRET_KEY;

export const POST: APIRoute = async ({ params }) => {
    if (!STRIPE_KEY) return json({ error: 'El pago en línea aún no está configurado.' }, 503);
    const token = params.token ?? '';
    const rl = await rateLimit(`si:${token}`, 10, 60);
    if (!rl.ok) return tooMany(rl.retryAfter);

    const rows = await sql`
        select c.id, c.org_id, c.folio, c.total, c.status, c.es_recurrente, c.cliente_id,
               o.sandbox_of, o.stripe_account_id, o.stripe_charges_enabled,
               o.acepta_tarjeta, o.nombre as org_nombre
        from cotizaciones c
        join orgs o on o.id = c.org_id
        where c.public_token = ${token}`;
    if (!rows.length) return json({ error: 'Cotización no encontrada' }, 404);
    const c = rows[0];

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
    const cid = c.id as string;

    try {
        // Fila de suscripción (una por cotización). Se crea perezosamente aquí.
        let [sub] = await sql`select * from cotizacion_suscripciones where cotizacion_id = ${c.id}`;
        if (!sub) {
            const ins = await sql`
                insert into cotizacion_suscripciones (org_id, cotizacion_id, cliente_id, stripe_account_id, monto, moneda, estado)
                values (${c.org_id}, ${c.id}, ${c.cliente_id || null}, ${acct}, ${Number(c.total)}, 'MXN', 'incomplete')
                on conflict (cotizacion_id) do nothing
                returning *`;
            sub = ins.length ? ins[0] : (await sql`select * from cotizacion_suscripciones where cotizacion_id = ${c.id}`)[0];
        }

        // ── 1) Reutilizar la suscripción existente si sigue vigente ──────────────
        if (sub.stripe_subscription_id) {
            const { ok, data: existing } = await sfetch(
                `/v1/subscriptions/${sub.stripe_subscription_id}`,
                new URLSearchParams({ 'expand[0]': 'latest_invoice.payment_intent' }), 'GET');
            if (ok && existing?.id) {
                // Ya autorizada (o en reintento tras un fallo): nada que confirmar.
                if (['active', 'trialing', 'past_due'].includes(existing.status)) {
                    return json({ alreadyActive: true });
                }
                // Aún incompleta: reutilizar el PI de la primera factura si el monto
                // coincide y sigue confirmable. `on conflict` de la fila garantiza
                // que no re-creamos objetos de Stripe en cada visita del cliente.
                const pi = existing?.latest_invoice?.payment_intent;
                const currentUnit = existing?.items?.data?.[0]?.price?.unit_amount;
                const sameAmount = Number(currentUnit) === amount;
                if (existing.status === 'incomplete' && pi?.client_secret && sameAmount
                    && ['requires_payment_method', 'requires_confirmation', 'requires_action'].includes(pi.status)) {
                    return json({ clientSecret: pi.client_secret, publishableKey: pubKey, accountId: acct, amount, subscription: true });
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
            if (!ok || !data?.id) return json({ error: data?.error?.message || 'No se pudo iniciar la suscripción' }, 502);
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
            if (!ok || !data?.id) return json({ error: data?.error?.message || 'No se pudo iniciar la suscripción' }, 502);
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
            prf.set('product', productId);
            const { ok, data } = await sfetch('/v1/prices', prf, 'POST', `sub-price-${cid}-${amount}`);
            if (!ok || !data?.id) return json({ error: data?.error?.message || 'No se pudo iniciar la suscripción' }, 502);
            priceId = data.id;
        }

        // Re-lectura defensiva justo antes de crear: si otra request concurrente ya
        // dejó una suscripción en la fila mientras nosotros armábamos los objetos,
        // reutilizamos su PI en vez de crear otra (angosta la ventana de carrera; la
        // Idempotency-Key de abajo es la garantía real si aun así corremos a la par).
        const [fresh] = await sql`select stripe_subscription_id from cotizacion_suscripciones where id = ${sub.id}`;
        const existingSubId = (fresh?.stripe_subscription_id as string | null) || (sub.stripe_subscription_id as string | null) || null;
        if (existingSubId) {
            const { ok, data } = await sfetch(`/v1/subscriptions/${existingSubId}`,
                new URLSearchParams({ 'expand[0]': 'latest_invoice.payment_intent' }), 'GET');
            const piCs = data?.latest_invoice?.payment_intent?.client_secret;
            if (ok && piCs && ['active', 'trialing', 'past_due'].includes(data.status)) return json({ alreadyActive: true });
            if (ok && piCs && data.status === 'incomplete') {
                return json({ clientSecret: piCs, publishableKey: pubKey, accountId: acct, amount, subscription: true });
            }
        }

        // ── 5) Subscription (default_incomplete) ────────────────────────────────
        // Idempotency-Key basada en (cotizacion_id + sub que reemplaza): dos requests
        // que arranquen del MISMO estado crean la MISMA suscripción; una recreación
        // legítima (reemplazando otra sub) usa otra key y sí crea una nueva.
        const subForm = new URLSearchParams();
        subForm.set('customer', customerId as string);
        subForm.set('items[0][price]', priceId);
        subForm.set('payment_behavior', 'default_incomplete');
        subForm.set('payment_settings[save_default_payment_method]', 'on_subscription');
        subForm.set('payment_settings[payment_method_types][0]', 'card');
        subForm.set('expand[0]', 'latest_invoice.payment_intent');
        subForm.set('metadata[cotizacion_id]', cid);
        subForm.set('metadata[org_id]', c.org_id as string);
        subForm.set('metadata[token]', token);
        subForm.set('metadata[suscripcion_id]', sub.id as string);
        const { ok, data: newSub } = await sfetch('/v1/subscriptions', subForm, 'POST', `sub-${cid}-${existingSubId || 'new'}`);
        if (!ok || !newSub?.id) return json({ error: newSub?.error?.message || 'No se pudo crear la suscripción' }, 502);

        const clientSecret = newSub?.latest_invoice?.payment_intent?.client_secret;
        if (!clientSecret) return json({ error: 'No se pudo preparar el cobro de la suscripción' }, 502);

        await sql`
            update cotizacion_suscripciones set
                stripe_subscription_id = ${newSub.id},
                stripe_customer_id = ${customerId},
                stripe_product_id = ${productId},
                stripe_price_id = ${priceId},
                monto = ${Number(c.total)},
                estado = ${newSub.status || 'incomplete'}
            where id = ${sub.id}`;

        return json({ clientSecret, publishableKey: pubKey, accountId: acct, amount, subscription: true });
    } catch (e) {
        console.error('[subscription-intent]', e);
        return json({ error: 'No se pudo conectar con Stripe' }, 502);
    }
};

function json(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

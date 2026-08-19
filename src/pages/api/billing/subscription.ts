// GET /api/billing/subscription — la suscripción tal como la va a cobrar.
//
// NO se deriva de `orgs.plan`: esa columna es la proyección de ENTITLEMENTS y
// puede diferir legítimamente de lo contratado. El caso que lo hizo evidente es
// una cuenta con 100 % de descuento: la suscripción existe y renueva, pero nunca
// produce una factura pagada, así que `hasPaidBillingEvidence()` la deja en
// `free` (regla 17, y está bien). Mostrar "Gratis · $0" sobre una suscripción
// anual viva sería mentirle al dueño sobre lo que tiene contratado.
//
// Aquí se responde la otra pregunta: qué se cobra, cuándo y con qué descuento.
export const prerender = false;

import type { APIRoute } from 'astro';
import { stripe } from '../../../lib/billing';
import { billingContext, json } from '../../../lib/billing-surface';
import { fromMinorUnits } from '../../../lib/currency';

export const GET: APIRoute = async () => {
    const gate = await billingContext();
    if ('denied' in gate) return gate.denied;
    const { subscriptionId, customer } = gate.ctx;
    if (!subscriptionId) return json({ subscription: null });

    try {
        const sub = await stripe(`/v1/subscriptions/${subscriptionId}`, {
            'expand[0]': 'items.data.price.product',
            'expand[1]': 'discounts',
        }, 'GET');

        const owner = typeof sub?.customer === 'string' ? sub.customer : sub?.customer?.id;
        if (owner !== customer) return json({ subscription: null });

        // El item base es el de precio fijo: los medidos no tienen importe hasta
        // que hay consumo, y sumarlos aquí anunciaría un cobro que no existe.
        const base = (sub.items?.data ?? []).find((i: any) => i.price?.recurring?.usage_type !== 'metered')
            ?? sub.items?.data?.[0];
        const price = base?.price;
        const product = price?.product;
        const currency = String(price?.currency || sub.currency || 'mxn').toUpperCase();

        const descuentos = (sub.discounts ?? []).map((d: any) => {
            const c = d?.coupon ?? d;
            return {
                nombre: c?.name ?? null,
                porcentaje: c?.percent_off ?? null,
                importe: c?.amount_off != null ? fromMinorUnits(Number(c.amount_off), currency) : null,
            };
        }).filter((d: any) => d.porcentaje != null || d.importe != null || d.nombre);

        return json({
            subscription: {
                nombre: typeof product === 'object' ? (product?.name ?? null) : null,
                estado: sub.status ?? null,
                intervalo: price?.recurring?.interval === 'year' ? 'anual' : 'mensual',
                importe: fromMinorUnits(Number(price?.unit_amount || 0), currency),
                currency,
                periodoFin: Number(base?.current_period_end || sub.current_period_end || 0) || null,
                cancelaAlCierre: Boolean(sub.cancel_at_period_end),
                descuentos,
            },
        });
    } catch {
        return json({ error: 'No pudimos cargar tu suscripción. Intenta de nuevo.' }, 502);
    }
};

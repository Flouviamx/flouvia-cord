// POST /api/billing/subscribe — alta de plan. Dos modos:
//  • ui:'element' (default de la app): crea la SUSCRIPCIÓN directo en estado
//    `incomplete` y devuelve el client_secret para montar el Payment Element
//    custom en /app/checkout. El cobro lo confirma el cliente; el webhook activa
//    el plan al concretarse el pago (status active).
//  • sin ui (fallback): Stripe Checkout hosteado (modo suscripción) → { url }.
// Ambos incluyen el precio base + los precios MEDIDOS (overage) del plan.
// Ruta INTERNA (el middleware exige sesión Clerk).
export const prerender = false;

import type { APIRoute } from 'astro';
import { sql, getActiveOrgId, logAudit, reqIp } from '../../../lib/db';
import { getOrg } from '../../../lib/queries';
import {
    STRIPE_KEY, PLAN_PRICES, METER_PRICES, isPaidPlan, getOrCreateCustomer, stripe,
    type Cycle,
} from '../../../lib/billing';

// API version mínima para billing_mode flexible + invoice.confirmation_secret.
const STRIPE_VERSION = '2025-06-30.basil';

export const POST: APIRoute = async ({ request }) => {
    if (!STRIPE_KEY) return json({ error: 'La facturación aún no está configurada.' }, 503);

    let body: any = {};
    try { body = await request.json(); } catch { /* sin body */ }
    const plan = String(body.plan || '');
    const cycle: Cycle = body.cycle === 'anual' ? 'anual' : 'mensual';
    const useElement = body.ui === 'element';
    if (!isPaidPlan(plan)) return json({ error: 'Plan inválido' }, 400);

    const orgId = await getActiveOrgId();
    const org = await getOrg();
    const origin = new URL(request.url).origin;

    try {
        const customer = await getOrCreateCustomer(orgId, org.email, org.nombre);

        if (useElement) {
            // Guard anti-doble-cobro: si ya hay suscripción vigente, los cambios de
            // plan se hacen por el Customer Portal (no creamos una segunda).
            const [o] = await sql`select subscription_status from orgs where id = ${orgId}`;
            const st = (o?.subscription_status as string) || '';
            if (st === 'active' || st === 'trialing') {
                return json({ error: 'Ya tienes una suscripción activa. Usa “Gestionar suscripción” para cambiar de plan.' }, 409);
            }

            const params: Record<string, string> = {
                customer,
                'items[0][price]': PLAN_PRICES[plan][cycle],
                payment_behavior: 'default_incomplete',
                'payment_settings[save_default_payment_method]': 'on_subscription',
                'billing_mode[type]': 'flexible',
                'expand[0]': 'latest_invoice.confirmation_secret',
                'metadata[org_id]': orgId,
                'metadata[plan]': plan,
                'metadata[cycle]': cycle,
            };
            // Items medidos (overage): sin quantity → uso.
            let i = 1;
            for (const price of Object.values(METER_PRICES[plan])) {
                if (!price) continue;
                params[`items[${i}][price]`] = price;
                i++;
            }

            const sub = await stripe('/v1/subscriptions', params, 'POST', { version: STRIPE_VERSION });
            const clientSecret = sub?.latest_invoice?.confirmation_secret?.client_secret;
            if (!clientSecret) return json({ error: 'No se pudo iniciar el pago' }, 502);
            await logAudit(orgId, { accion: 'billing.checkout', entidad: 'org', entidad_id: orgId, detalle: `Payment Element ${plan} (${cycle})`, ip: reqIp(request) });
            return json({ client_secret: clientSecret });
        }

        // ── Fallback: Checkout hosteado ──
        // Item 0 = precio base (flat). Items siguientes = precios medidos (sin qty).
        const params: Record<string, string> = {
            mode: 'subscription',
            customer,
            success_url: `${origin}/app/ajustes/plan?suscrito=1`,
            cancel_url: `${origin}/app/ajustes/plan`,
            allow_promotion_codes: 'true',
            'line_items[0][price]': PLAN_PRICES[plan][cycle],
            'line_items[0][quantity]': '1',
            'subscription_data[metadata][org_id]': orgId,
            'subscription_data[metadata][plan]': plan,
            'subscription_data[metadata][cycle]': cycle,
            'metadata[org_id]': orgId,
            'metadata[plan]': plan,
            'metadata[cycle]': cycle,
        };
        let i = 1;
        for (const price of Object.values(METER_PRICES[plan])) {
            if (!price) continue;
            params[`line_items[${i}][price]`] = price;
            i++;
        }

        const session = await stripe('/v1/checkout/sessions', params);
        await logAudit(orgId, { accion: 'billing.checkout', entidad: 'org', entidad_id: orgId, detalle: `Checkout ${plan} (${cycle})`, ip: reqIp(request) });
        return json({ url: session.url });
    } catch (e: any) {
        return json({ error: e?.message || 'No se pudo iniciar el checkout' }, 502);
    }
};

function json(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

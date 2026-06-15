// POST /api/billing/subscribe — inicia el alta/cambio de plan: crea una sesión
// de Stripe Checkout en modo suscripción con el precio base del plan + los
// precios MEDIDOS (overage) de ese plan. Sin prueba gratis: se cobra desde el
// alta (Stripe pide el método de pago en el checkout).
// Ruta INTERNA (el middleware exige sesión Clerk). El webhook sincroniza Neon
// cuando el pago/cambio se concreta.
export const prerender = false;

import type { APIRoute } from 'astro';
import { getActiveOrgId, logAudit, reqIp } from '../../../lib/db';
import { getOrg } from '../../../lib/queries';
import {
    STRIPE_KEY, PLAN_PRICES, METER_PRICES, isPaidPlan, getOrCreateCustomer, stripe,
    type Cycle,
} from '../../../lib/billing';

export const POST: APIRoute = async ({ request }) => {
    if (!STRIPE_KEY) return json({ error: 'La facturación aún no está configurada.' }, 503);

    let body: any = {};
    try { body = await request.json(); } catch { /* sin body */ }
    const plan = String(body.plan || '');
    const cycle: Cycle = body.cycle === 'anual' ? 'anual' : 'mensual';
    if (!isPaidPlan(plan)) return json({ error: 'Plan inválido' }, 400);

    const orgId = await getActiveOrgId();
    const org = await getOrg();
    const origin = new URL(request.url).origin;

    try {
        const customer = await getOrCreateCustomer(orgId, org.email, org.nombre);

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
            params[`line_items[${i}][price]`] = price; // medido → sin quantity
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

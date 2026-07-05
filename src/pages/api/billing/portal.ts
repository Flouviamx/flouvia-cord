// POST /api/billing/portal — abre el Customer Portal de Stripe para que la org
// gestione su suscripción (cambiar plan, método de pago, cancelar, ver recibos).
// Ruta INTERNA (el middleware exige sesión Clerk).
// ⚠️ Requiere tener configurado el Customer Portal en el dashboard de Stripe.
export const prerender = false;

import type { APIRoute } from 'astro';
import { getActiveOrgId } from '../../../lib/db';
import { sql } from '../../../lib/db';
import { STRIPE_KEY, stripe } from '../../../lib/billing';

export const POST: APIRoute = async ({ request }) => {
    if (!STRIPE_KEY) return json({ error: 'La facturación aún no está configurada.' }, 503);

    const orgId = await getActiveOrgId();
    const [o] = await sql`select stripe_customer_id, sandbox_of from orgs where id = ${orgId}`;
    if (o?.sandbox_of) return json({ error: 'Estás en el entorno de prueba. Sal del modo de prueba para gestionar tu plan.' }, 409);
    const customer = o?.stripe_customer_id as string | undefined;
    if (!customer) return json({ error: 'Aún no tienes una suscripción activa.' }, 409);

    const origin = new URL(request.url).origin;
    try {
        const session = await stripe('/v1/billing_portal/sessions', {
            customer,
            return_url: `${origin}/app/ajustes/plan`,
        });
        return json({ url: session.url });
    } catch (e: any) {
        return json({ error: e?.message || 'No se pudo abrir el portal' }, 502);
    }
};

function json(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

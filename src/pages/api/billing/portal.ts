// POST /api/billing/portal — ESCAPE DE SOPORTE. No es un camino de producto.
//
// Ago 2026: la gestión de la suscripción se trajo a Cord
// (billing.cordhq.app + `/api/billing/{methods,invoices,datos,cancelar,pagar,factura}`).
// Ninguna superficie enlaza aquí y ninguna debe volver a hacerlo: mandar al
// cliente a un dominio del procesador es justo lo que ese trabajo vino a quitar.
//
// El endpoint sobrevive a propósito, como red: si la superficie propia tuviera un
// hueco, soporte todavía puede abrirle el portal a una cuenta concreta en vez de
// dejarla sin salida. Si algún día se elimina, quita también los asserts de
// configuración del portal en scripts/verify-stripe-billing.mjs.
//
// Ruta INTERNA (el middleware exige sesión).
// ⚠️ Requiere tener configurado el Customer Portal en el dashboard de Stripe.
export const prerender = false;

import type { APIRoute } from 'astro';
import { getActiveOrgId } from '../../../lib/db';
import { sql } from '../../../lib/db';
import { STRIPE_KEY, stripe } from '../../../lib/billing';
import { requirePerm } from '../../../lib/queries';
import { currentLocale } from '../../../lib/context';
import { t } from '../../../i18n/app';
import { siteOrigin } from '../../../lib/email';

export const POST: APIRoute = async () => {
    const denied = await requirePerm('ajustes');
    if (denied) return denied;
    if (!STRIPE_KEY) return json({ error: 'La facturación aún no está configurada.' }, 503);

    const orgId = await getActiveOrgId();
    const [o] = await sql`select stripe_customer_id, sandbox_of from orgs where id = ${orgId}`;
    if (o?.sandbox_of) return json({ error: t(currentLocale(), 'err.test.plan') }, 409);
    const customer = o?.stripe_customer_id as string | undefined;
    if (!customer) return json({ error: 'Aún no tienes una suscripción activa.' }, 409);

    const origin = siteOrigin();
    try {
        const session = await stripe('/v1/billing_portal/sessions', {
            customer,
            return_url: `${origin}/app/ajustes/plan`,
        }, 'POST', { idempotencyKey: `billing-portal:${orgId}:${Math.floor(Date.now() / 60_000)}` });
        return json({ url: session.url });
    } catch (e: any) {
        return json({ error: e?.message || 'No se pudo abrir el portal' }, 502);
    }
};

function json(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

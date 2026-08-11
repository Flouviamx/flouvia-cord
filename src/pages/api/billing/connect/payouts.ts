export const prerender = false;

import type { APIRoute } from 'astro';
import { sql, getActiveOrgId } from '../../../../lib/db';
import { requirePermAny } from '../../../../lib/queries';
import { getStripeSnapshot, listPayoutsLite } from '../../../../lib/stripe-cobros';
import { translateStripeError } from '../../../../lib/stripe-catalogs';
import { rateLimit, tooMany } from '../../../../lib/ratelimit';

export const GET: APIRoute = async () => {
    // Dos superficies consumen esto con gates distintos: Ajustes › Cobros (`ajustes`)
    // y el dashboard "Mi dinero" (`cobranza`). Exigir solo `ajustes` dejaba a un
    // miembro de cobranza con la página renderizada y un 403 desde el navegador.
    const denied = await requirePermAny(['ajustes', 'cobranza']);
    if (denied) return denied;

    const orgId = await getActiveOrgId();
    const rl = await rateLimit(`api:payouts:${orgId}`, 60, 60);
    if (!rl.ok) return tooMany(rl.retryAfter);

    const [org] = await sql`select stripe_account_id from orgs where id = ${orgId}`;
    if (!org?.stripe_account_id) {
        return new Response(JSON.stringify({ error: 'No account' }), { status: 400 });
    }

    try {
        const acct = org.stripe_account_id as string;
        // DTOs recortados de stripe-cobros.ts en vez de los objetos crudos de Stripe:
        // el Balance y el Payout traen campos que no tienen por qué salir del servidor,
        // y de paso esto hereda la caché de 60 s y la normalización a pesos.
        const [snapshot, payouts] = await Promise.all([
            getStripeSnapshot(orgId, acct),
            listPayoutsLite(orgId, acct, 10),
        ]);
        return new Response(JSON.stringify({ ok: true, snapshot, payouts }), {
            headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store' },
        });
    } catch (e: any) {
        return new Response(JSON.stringify({ error: translateStripeError(e) }), { status: 400 });
    }
};

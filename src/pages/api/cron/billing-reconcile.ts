// GET /api/cron/billing-reconcile — reconcilia Stripe Billing y entrega el
// outbox de consumo. El webhook sigue siendo el camino rápido; este cron es la
// red de seguridad independiente para eventos perdidos o fuera de orden.
export const prerender = false;

import type { APIRoute } from 'astro';
import { assertCronAuth } from '../../../lib/cron-auth';
import { reqContext } from '../../../lib/context';
import { reconcileBilling } from '../../../lib/billing-reconcile';

export const GET: APIRoute = async ({ request }) => {
    const authError = assertCronAuth(request);
    if (authError) return authError;
    try {
        const result = await reqContext.run({ userId: null, cronScope: true }, () => reconcileBilling());
        return new Response(JSON.stringify({ ok: true, ...result }), {
            headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
        });
    } catch (error) {
        console.error('[billing-reconcile]', error);
        return new Response(JSON.stringify({ error: 'No se pudo reconciliar Billing.' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
        });
    }
};

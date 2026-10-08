// GET /api/cron/billing-reconcile — reconcilia Stripe Billing y entrega el
// outbox de consumo. El webhook sigue siendo el camino rápido; este cron es la
// red de seguridad independiente para eventos perdidos o fuera de orden.
export const prerender = false;

import type { APIRoute } from 'astro';
import { assertCronAuth } from '../../../lib/cron-auth';
import { reqContext } from '../../../lib/context';
import { reconcileBilling } from '../../../lib/billing-reconcile';
import { log } from '../../../lib/log';
import { cronPeriod, runCronOnce } from '../../../lib/cron-runs';

export const GET: APIRoute = async ({ request }) => {
    const authError = assertCronAuth(request);
    if (authError) return authError;
    // Una vez al día; un 500 deja el periodo en `error` y la siguiente corrida
    // de cord-crons.yml lo reintenta.
    return runCronOnce(request, '/api/cron/billing-reconcile', cronPeriod('dia'), async () => {
        try {
            const result = await reqContext.run({ userId: null, cronScope: true }, () => reconcileBilling());
            return new Response(JSON.stringify({ ok: true, ...result }), {
                headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
            });
        } catch (error) {
            log.error('error no controlado', { route: 'billing-reconcile', err: error });
            return new Response(JSON.stringify({ error: 'No se pudo reconciliar Billing.' }), {
                status: 500,
                headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
            });
        }
    });
};

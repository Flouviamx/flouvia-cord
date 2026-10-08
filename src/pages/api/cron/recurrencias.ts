// GET /api/cron/recurrencias — emite las facturas recurrentes que ya tocan.
//
// Corre a diario (ver vercel.json). El cálculo de qué toca vive en
// `lib/fiscal/recurrencias.ts`; esta ruta solo valida el secreto, abre el carril
// de sistema y reporta.
export const prerender = false;

import type { APIRoute } from 'astro';
import { assertCronAuth } from '../../../lib/cron-auth';
import { reqContext } from '../../../lib/context';
import { runRecurrencias } from '../../../lib/fiscal/recurrencias';
import { cronPeriod, runCronOnce } from '../../../lib/cron-runs';

export const GET: APIRoute = async ({ request }) => {
    const authError = assertCronAuth(request);
    if (authError) return authError;

    // `withSystemTx` exige este carril y lo verifica: una ruta con sesión de
    // usuario normal nunca puede barrer organizaciones ajenas por accidente.
    // Una vez al día (reclamo en cron_runs): lo disparan vercel.json y
    // cord-crons.yml. Cada recurrencia además reclama su fecha con
    // compare-and-set, así que un disparo repetido no emite dos veces.
    return runCronOnce(request, '/api/cron/recurrencias', cronPeriod('dia'), async () => {
        const result = await reqContext.run(
            { userId: null, sessionId: null, activeOrgId: null, cronScope: true },
            () => runRecurrencias({ limit: 200 }),
        );
        return new Response(JSON.stringify(result), {
            status: 200, headers: { 'Content-Type': 'application/json' },
        });
    });
};

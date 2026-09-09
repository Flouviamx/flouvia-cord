export const prerender = false;

import type { APIRoute } from 'astro';
import { reqContext } from '../../lib/context';
import { assertCronAuth } from '../../lib/cron-auth';
import {
    logFailedHealthResults,
    persistHealthResults,
    probePlatformHealth,
    publicHealthResults,
} from '../../lib/platform-health';

export const GET: APIRoute = async ({ request }) => {
    const authError = assertCronAuth(request);
    if (authError) return authError;

    return reqContext.run(
        { userId: null, sessionId: null, activeOrgId: null, cronScope: true },
        async () => {
            const results = await probePlatformHealth();
            logFailedHealthResults(results);

            let persisted = true;
            try {
                await persistHealthResults(results);
            } catch {
                // Si Neon está caído la propia muestra de BD no puede guardarse.
                // La ausencia vuelve obsoleta la última muestra visible y el
                // status público pasa a "sin señal reciente" en vez de mentir.
                persisted = false;
            }

            const ok = results.every((result) => result.ok) && persisted;
            return new Response(JSON.stringify({
                ok,
                persisted,
                checkedAt: results[0]?.checkedAt ?? new Date().toISOString(),
                services: publicHealthResults(results),
            }), {
                status: ok ? 200 : 503,
                headers: {
                    'Content-Type': 'application/json',
                    'Cache-Control': 'no-store',
                },
            });
        },
    );
};

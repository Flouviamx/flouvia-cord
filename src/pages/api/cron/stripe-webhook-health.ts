export const prerender = false;

import type { APIRoute } from 'astro';
import { assertCronAuth } from '../../../lib/cron-auth';
import { sql } from '../../../lib/db';
import { sendOpsAlert } from '../../../lib/ops-alert';
import { paymentsConfirmation } from '../../../lib/platform-health';


export const GET: APIRoute = async ({ request }) => {
    const authError = assertCronAuth(request);
    if (authError) return authError;

    // Mismo criterio que la página de estado: solo es falla si Stripe cobró algo
    // que Cord no registró (ver paymentsConfirmation en platform-health).
    const state = await paymentsConfirmation();
    const [health] = await sql`select last_alert_at from platform_health where key = 'stripe_webhook'`;
    const lastSuccess = state.lastSuccessAt;
    const pendingCount = state.pendingCount;
    const stale = state.broken;
    const lastAlert = health?.last_alert_at ? new Date(health.last_alert_at as string) : null;
    const canAlert = !lastAlert || Date.now() - lastAlert.getTime() > 24 * 3_600_000;

    let alerted = false;
    if (stale && canAlert) {
        alerted = await sendOpsAlert(
            'Stripe webhook sin actividad',
            (state.reason === 'missed' ? 'Stripe tiene pagos cobrados que Cord no ha registrado. ' : 'No se pudo verificar contra Stripe. ')
                + (lastSuccess ? `Último evento firmado: ${lastSuccess.toISOString()}` : 'No se ha registrado un evento firmado.'),
        );
        if (alerted) {
            await sql`
                insert into platform_health (key, last_alert_at, updated_at)
                values ('stripe_webhook', now(), now())
                on conflict (key) do update set last_alert_at = now(), updated_at = now()`;
        }
    }

    return json({ ok: !stale, stale, reason: state.reason, alerted, pendingCount, lastSuccessAt: lastSuccess?.toISOString() || null });
};

function json(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

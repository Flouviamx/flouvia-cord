export const prerender = false;

import type { APIRoute } from 'astro';
import { assertCronAuth } from '../../../lib/cron-auth';
import { sql } from '../../../lib/db';
import { sendOpsAlert } from '../../../lib/ops-alert';

const MAX_QUIET_HOURS = 26;

export const GET: APIRoute = async ({ request }) => {
    const authError = assertCronAuth(request);
    if (authError) return authError;

    const [health] = await sql`
        select h.last_success_at, h.last_alert_at, cord_pending_payment_count() as pending_count
        from (values (1)) as seed(n)
        left join platform_health h on h.key = 'stripe_webhook'
        limit 1`;
    const lastSuccess = health?.last_success_at ? new Date(health.last_success_at as string) : null;
    const pendingCount = Number(health?.pending_count || 0);
    const stale = pendingCount > 0 && (!lastSuccess || Date.now() - lastSuccess.getTime() > MAX_QUIET_HOURS * 3_600_000);
    const lastAlert = health?.last_alert_at ? new Date(health.last_alert_at as string) : null;
    const canAlert = !lastAlert || Date.now() - lastAlert.getTime() > 24 * 3_600_000;

    let alerted = false;
    if (stale && canAlert) {
        alerted = await sendOpsAlert(
            'Stripe webhook sin actividad',
            lastSuccess ? `Último evento firmado: ${lastSuccess.toISOString()}` : 'No se ha registrado un evento firmado.',
        );
        if (alerted) {
            await sql`
                insert into platform_health (key, last_alert_at, updated_at)
                values ('stripe_webhook', now(), now())
                on conflict (key) do update set last_alert_at = now(), updated_at = now()`;
        }
    }

    return json({ ok: !stale, stale, alerted, pendingCount, lastSuccessAt: lastSuccess?.toISOString() || null });
};

function json(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

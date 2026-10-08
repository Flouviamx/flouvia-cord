// Evalúa las alertas de Cord Ops y avisa a los operadores al DISPARARSE y al
// RESOLVERSE, no en cada corrida. Corre en cada pasada del reloj de GitHub
// (scripts/cron-schedule.mjs, EN_CADA_CORRIDA) y reclama su hora en cron_runs.
//
// Carril: las métricas de negocio salen de cord_ops_alert_metrics() (security
// definer, solo agregados); cron_runs y las tablas de alertas se leen en el
// carril de sistema, después de validar CRON_SECRET. Ninguna fila de un
// negocio viaja en el aviso: solo el nombre de la métrica y su valor.
export const prerender = false;

import type { APIRoute } from 'astro';
import { assertCronAuth } from '../../../lib/cron-auth';
import { reqContext } from '../../../lib/context';
import { cronPeriod, runCronOnce } from '../../../lib/cron-runs';
import { sql, withSystemTx } from '../../../lib/db';
import { sendEmail } from '../../../lib/email';
import { log } from '../../../lib/log';
import { sendOpsAlert } from '../../../lib/ops-alert';
import { evaluateOpsAlerts, opsAlertValue, opsAlertMetricValues, type OpsAlertRow } from '../../../lib/ops-alerts';
import { opsCronProblemCount, opsCronRuns, type OpsCronRun } from '../../../lib/ops-crons';

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

export const GET: APIRoute = async ({ request }) => {
    const authError = assertCronAuth(request);
    if (authError) return authError;
    return runCronOnce(request, '/api/cron/ops-alertas', cronPeriod('hora'), () => run());
};

async function run(): Promise<Response> {
    return reqContext.run({ userId: null, cronScope: true }, async () => {
        const [metricRows, rules, states, runs, operators] = await withSystemTx(
            opsAlertMetricValues(),
            sql`select metric, enabled, threshold, updated_by from ops_alert_rules`,
            sql`select metric, firing, since from ops_alert_state`,
            opsCronRuns(),
            sql`select email from ops_operators where active`,
        );
        const values = new Map<string, number>(metricRows.map((r) => [String(r.metric), Number(r.value)]));
        const now = new Date();
        values.set('crons_problem', opsCronProblemCount(runs as OpsCronRun[], now));

        const rows = evaluateOpsAlerts(values, rules as any[], states as any[], now);
        const changed = rows.filter((r) => r.transition);

        // El estado se guarda ANTES de avisar: si el aviso falla, la siguiente
        // corrida no repite un correo que quizá sí salió.
        await withSystemTx(...rows.map((r) => sql`
            insert into ops_alert_state (metric, firing, value, since, notified_at, checked_at)
            values (${r.metric.id}, ${r.firing}, ${r.value}, ${r.since}, ${r.transition ? now : null}, now())
            on conflict (metric) do update set
              firing = excluded.firing, value = excluded.value, since = excluded.since, checked_at = now(),
              notified_at = coalesce(excluded.notified_at, ops_alert_state.notified_at)`));

        let notified = 0;
        if (changed.length) {
            const fired = changed.filter((r) => r.transition === 'fired');
            const resolved = changed.filter((r) => r.transition === 'resolved');
            const line = (r: OpsAlertRow) => `${r.metric.label}: ${opsAlertValue(r.metric, r.value)} (umbral ${opsAlertValue(r.metric, r.threshold)})`;
            const subject = fired.length
                ? `Cord Ops: ${fired.length === 1 ? fired[0].metric.label : `${fired.length} alertas`}`
                : `Cord Ops: ${resolved.length === 1 ? `${resolved[0].metric.label} se resolvió` : `${resolved.length} alertas resueltas`}`;
            const text = [
                ...fired.map((r) => `Disparada · ${line(r)}`),
                ...resolved.map((r) => `Resuelta · ${r.metric.label}`),
            ].join('\n');
            await sendOpsAlert(subject.replace(/^Cord Ops: /, ''), text);
            const html = `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;max-width:540px;margin:0 auto;padding:32px 20px;color:#111827;">
                <p style="font-size:16px;font-weight:600;margin:0 0 16px;">${esc(subject)}</p>
                ${fired.map((r) => `<p style="font-size:14px;line-height:1.55;margin:0 0 10px;"><strong>${esc(r.metric.label)}</strong>: ${esc(opsAlertValue(r.metric, r.value))} (umbral ${esc(opsAlertValue(r.metric, r.threshold))}).<br><span style="color:#6B7280;">${esc(r.metric.description)}</span><br><a href="https://ops.cordhq.app${r.metric.href}" style="color:#2563EB;">Abrir en Cord Ops</a></p>`).join('')}
                ${resolved.map((r) => `<p style="font-size:14px;line-height:1.55;margin:0 0 10px;color:#374151;">Resuelta: ${esc(r.metric.label)}.</p>`).join('')}
                <p style="font-size:12px;color:#6B7280;margin-top:28px;">Las reglas se ajustan en Cord Ops › Alertas.</p>
            </div>`;
            for (const op of operators) {
                const to = String(op.email || '');
                if (!to) continue;
                const sent = await sendEmail({ to, subject, html, fromName: 'Cord Ops', operation: 'ops_alert' }).catch((err) => {
                    log.warn('aviso de alerta de Ops no enviado', { route: 'cron/ops-alertas', err });
                    return { sent: false };
                });
                if (sent.sent) notified++;
            }
        }
        return new Response(JSON.stringify({
            ok: true, evaluadas: rows.length, disparadas: rows.filter((r) => r.firing).length,
            cambios: changed.length, avisos: notified,
        }), { status: 200, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
    });
}

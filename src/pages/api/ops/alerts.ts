// Ajuste de una regla de alerta de Ops: encenderla, apagarla o mover su umbral.
// Solo admin. La métrica sale del catálogo cerrado de src/lib/ops-alerts.ts y
// el cambio se audita en la misma transacción que lo escribe.
export const prerender = false;

import type { APIRoute } from 'astro';
import { sql, withOpsTx } from '../../../lib/db';
import { trustedIp } from '../../../lib/ip';
import { log } from '../../../lib/log';
import { opsAuditQuery } from '../../../lib/ops-auth';
import { OPS_ALERT_METRICS, parseOpsThreshold } from '../../../lib/ops-alerts';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});

export const PATCH: APIRoute = async ({ request, locals }) => {
    const operator = locals.opsOperator;
    if (!operator) return json({ error: 'No autenticado' }, 401);
    if (operator.role !== 'admin') return json({ error: 'Permiso insuficiente' }, 403);
    let body: any;
    try { body = await request.json(); } catch { return json({ error: 'JSON inválido' }, 400); }
    const metric = OPS_ALERT_METRICS.find((m) => m.id === body?.metric);
    if (!metric) return json({ error: 'Métrica desconocida' }, 400);
    const threshold = parseOpsThreshold(metric, body?.threshold);
    if (threshold === null) return json({ error: metric.unit === 'pct' ? 'El umbral es un porcentaje entre 0 y 100.' : 'El umbral es un número mayor o igual a 0.' }, 400);
    const enabled = body?.enabled === true;

    try {
        await withOpsTx(
            sql`insert into ops_alert_rules (metric, enabled, threshold, updated_by, updated_at)
                values (${metric.id}, ${enabled}, ${threshold}, ${operator.email}, now())
                on conflict (metric) do update set
                  enabled = excluded.enabled, threshold = excluded.threshold,
                  updated_by = excluded.updated_by, updated_at = now()`,
            opsAuditQuery({
                actorUserId: operator.userId,
                actorEmail: operator.email,
                action: 'ops.alert_rule_updated',
                targetType: 'alert',
                targetId: metric.id,
                metadata: { enabled, threshold },
                ip: trustedIp(request),
                userAgent: request.headers.get('user-agent') || 'desconocido',
            }),
        );
        return json({ success: true, message: enabled ? `${metric.label}: avisa desde ${threshold}${metric.unit === 'pct' ? '%' : ''}.` : `${metric.label}: apagada.` });
    } catch (error) {
        log.error('error no controlado', { route: 'ops/alerts', err: error });
        return json({ error: 'No se pudo guardar la regla.' }, 500);
    }
};

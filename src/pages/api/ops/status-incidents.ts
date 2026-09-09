export const prerender = false;

import { randomUUID } from 'node:crypto';
import type { APIRoute } from 'astro';
import { sql } from '../../../lib/db';
import { trustedIp } from '../../../lib/ip';
import { opsAuditQuery } from '../../../lib/ops-auth';

const STATUSES = new Set(['investigating', 'identified', 'monitoring', 'resolved']);
const SEVERITIES = new Set(['minor', 'major', 'critical']);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});

function text(value: unknown, max: number): string | null {
    if (typeof value !== 'string') return null;
    const normalized = value.trim();
    return normalized.length >= 3 && normalized.length <= max ? normalized : null;
}

function startedAt(value: unknown): Date | null {
    if (typeof value !== 'string') return null;
    const parsed = new Date(value);
    if (!Number.isFinite(parsed.getTime())) return null;
    if (parsed.getTime() > Date.now() + 5 * 60_000) return null;
    return parsed;
}

function auditBase(request: Request, operator: NonNullable<App.Locals['opsOperator']>) {
    return {
        actorUserId: operator.userId,
        actorEmail: operator.email,
        targetType: 'status_incident',
        result: 'success' as const,
        ip: trustedIp(request),
        userAgent: request.headers.get('user-agent'),
    };
}

export const POST: APIRoute = async ({ request, locals }) => {
    const operator = locals.opsOperator;
    if (!operator) return json({ error: 'No autenticado' }, 401);
    if (operator.role !== 'admin') return json({ error: 'Permiso insuficiente' }, 403);

    let body: Record<string, unknown>;
    try { body = await request.json(); } catch { return json({ error: 'JSON inválido' }, 400); }

    const titleEs = text(body.titleEs, 160);
    const titleEn = text(body.titleEn, 160);
    const summaryEs = text(body.summaryEs, 4000);
    const summaryEn = text(body.summaryEn, 4000);
    const severity = typeof body.severity === 'string' && SEVERITIES.has(body.severity) ? body.severity : null;
    const began = startedAt(body.startedAt);
    if (!titleEs || !titleEn || !summaryEs || !summaryEn || !severity || !began) {
        return json({ error: 'Completa ambos idiomas, severidad y una fecha de inicio válida.' }, 400);
    }

    const id = randomUUID();
    const [created] = await sql.transaction([
        sql`
            insert into status_incidents (
                id, status, severity, title_es, title_en, summary_es, summary_en, started_at
            ) values (
                ${id}, 'investigating', ${severity}, ${titleEs}, ${titleEn},
                ${summaryEs}, ${summaryEn}, ${began}
            ) returning id`,
        opsAuditQuery({
            ...auditBase(request, operator),
            action: 'ops.status_incident_created',
            targetId: id,
            metadata: { severity },
        }),
    ]);
    return json({ success: true, id: created[0]?.id }, 201);
};

export const PATCH: APIRoute = async ({ request, locals }) => {
    const operator = locals.opsOperator;
    if (!operator) return json({ error: 'No autenticado' }, 401);
    if (operator.role !== 'admin') return json({ error: 'Permiso insuficiente' }, 403);

    let body: Record<string, unknown>;
    try { body = await request.json(); } catch { return json({ error: 'JSON inválido' }, 400); }
    const targetId = typeof body.targetId === 'string' && UUID_RE.test(body.targetId) ? body.targetId : null;
    if (!targetId) return json({ error: 'Incidente inválido' }, 400);

    const existing = await sql`select id, status from status_incidents where id = ${targetId} limit 1`;
    if (!existing.length) return json({ error: 'Incidente no encontrado' }, 404);

    if (body.action === 'set_status') {
        const status = typeof body.status === 'string' && STATUSES.has(body.status) ? body.status : null;
        if (!status) return json({ error: 'Estado inválido' }, 400);
        const [updated] = await sql.transaction([
            sql`
                update status_incidents
                set status = ${status},
                    resolved_at = case when ${status} = 'resolved' then coalesce(resolved_at, now()) else null end,
                    updated_at = now()
                where id = ${targetId}
                returning id`,
            opsAuditQuery({
                ...auditBase(request, operator),
                action: 'ops.status_incident_status_changed',
                targetId,
                metadata: { from: existing[0].status, to: status },
            }),
        ]);
        return json({ success: true, id: updated[0]?.id });
    }

    if (body.action === 'edit') {
        const titleEs = text(body.titleEs, 160);
        const titleEn = text(body.titleEn, 160);
        const summaryEs = text(body.summaryEs, 4000);
        const summaryEn = text(body.summaryEn, 4000);
        const severity = typeof body.severity === 'string' && SEVERITIES.has(body.severity) ? body.severity : null;
        if (!titleEs || !titleEn || !summaryEs || !summaryEn || !severity) {
            return json({ error: 'Contenido bilingüe o severidad inválidos' }, 400);
        }
        const [updated] = await sql.transaction([
            sql`
                update status_incidents
                set severity = ${severity}, title_es = ${titleEs}, title_en = ${titleEn},
                    summary_es = ${summaryEs}, summary_en = ${summaryEn}, updated_at = now()
                where id = ${targetId}
                returning id`,
            opsAuditQuery({
                ...auditBase(request, operator),
                action: 'ops.status_incident_updated',
                targetId,
                metadata: { severity },
            }),
        ]);
        return json({ success: true, id: updated[0]?.id });
    }

    return json({ error: 'Acción no permitida' }, 400);
};

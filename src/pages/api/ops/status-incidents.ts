export const prerender = false;

import { randomUUID } from 'node:crypto';
import type { APIRoute } from 'astro';
import { sql } from '../../../lib/db';
import { trustedIp } from '../../../lib/ip';
import { log } from '../../../lib/log';
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

function instant(value: unknown): Date | null {
    if (typeof value !== 'string' || !value) return null;
    const parsed = new Date(value);
    return Number.isFinite(parsed.getTime()) ? parsed : null;
}

// Un incidente se documenta después de que ocurre: ni el inicio ni el fin
// pueden quedar en el futuro (5 min de gracia por relojes desfasados).
const inFuture = (date: Date) => date.getTime() > Date.now() + 5 * 60_000;
const isoOrUndefined = (value: unknown) => value ? new Date(String(value)).toISOString() : undefined;

type Content = { titleEs: string; titleEn: string; summaryEs: string; summaryEn: string; severity: string };

/** Valida el contenido bilingüe y dice exactamente qué campo falla. */
function content(body: Record<string, unknown>): Content | string {
    const titleEs = text(body.titleEs, 160);
    const titleEn = text(body.titleEn, 160);
    const summaryEs = text(body.summaryEs, 4000);
    const summaryEn = text(body.summaryEn, 4000);
    if (!titleEs) return 'El título en español debe tener entre 3 y 160 caracteres.';
    if (!titleEn) return 'El título en inglés debe tener entre 3 y 160 caracteres.';
    if (!summaryEs) return 'El resumen en español debe tener entre 3 y 4,000 caracteres.';
    if (!summaryEn) return 'El resumen en inglés debe tener entre 3 y 4,000 caracteres.';
    const severity = typeof body.severity === 'string' && SEVERITIES.has(body.severity) ? body.severity : null;
    if (!severity) return 'Elige una severidad.';
    return { titleEs, titleEn, summaryEs, summaryEn, severity };
}

/**
 * Fechas coherentes con el estado (el schema exige fin solo si está resuelto,
 * y fin >= inicio). Resolver sin fin explícito cierra el incidente ahora.
 */
function incidentWindow(status: string, startValue: unknown, endValue: unknown): { began: Date; ended: Date | null } | string {
    const began = instant(startValue);
    if (!began) return 'Indica la fecha y hora de inicio.';
    if (inFuture(began)) return 'La fecha de inicio está en el futuro. Revisa la fecha y la hora.';
    if (status !== 'resolved') return { began, ended: null };
    const ended = endValue === undefined || endValue === null || endValue === '' ? new Date() : instant(endValue);
    if (!ended) return 'La fecha de fin no es válida.';
    if (inFuture(ended)) return 'La fecha de fin está en el futuro. Revisa la fecha y la hora.';
    if (ended < began) return 'La fecha de fin es anterior a la de inicio.';
    return { began, ended };
}

function saveFailed(cause: unknown) {
    log.error('error no controlado', { route: 'api/ops/status-incidents', err: cause });
    return json({ error: 'No se pudo guardar el incidente y no se publicó nada. Intenta de nuevo.' }, 500);
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

async function readBody(request: Request): Promise<Record<string, unknown> | null> {
    try {
        const body = await request.json();
        return body && typeof body === 'object' ? body as Record<string, unknown> : null;
    } catch {
        return null;
    }
}

export const POST: APIRoute = async ({ request, locals }) => {
    const operator = locals.opsOperator;
    if (!operator) return json({ error: 'No autenticado' }, 401);
    if (operator.role !== 'admin') return json({ error: 'Tu acceso a Ops es de solo lectura; un administrador debe publicarlo.' }, 403);

    const body = await readBody(request);
    if (!body) return json({ error: 'JSON inválido' }, 400);

    const fields = content(body);
    if (typeof fields === 'string') return json({ error: fields }, 400);
    const status = typeof body.status === 'string' && STATUSES.has(body.status) ? body.status : 'investigating';
    const dates = incidentWindow(status, body.startedAt, body.resolvedAt);
    if (typeof dates === 'string') return json({ error: dates }, 400);

    const id = randomUUID();
    try {
        const [created] = await sql.transaction([
            sql`
                insert into status_incidents (
                    id, status, severity, title_es, title_en, summary_es, summary_en, started_at, resolved_at
                ) values (
                    ${id}, ${status}, ${fields.severity}, ${fields.titleEs}, ${fields.titleEn},
                    ${fields.summaryEs}, ${fields.summaryEn}, ${dates.began}, ${dates.ended}
                ) returning id`,
            opsAuditQuery({
                ...auditBase(request, operator),
                action: 'ops.status_incident_created',
                targetId: id,
                metadata: { severity: fields.severity, status },
            }),
        ]);
        return json({ success: true, id: created[0]?.id }, 201);
    } catch (cause) {
        return saveFailed(cause);
    }
};

export const PATCH: APIRoute = async ({ request, locals }) => {
    const operator = locals.opsOperator;
    if (!operator) return json({ error: 'No autenticado' }, 401);
    if (operator.role !== 'admin') return json({ error: 'Tu acceso a Ops es de solo lectura; un administrador debe hacer el cambio.' }, 403);

    const body = await readBody(request);
    if (!body) return json({ error: 'JSON inválido' }, 400);
    const targetId = typeof body.targetId === 'string' && UUID_RE.test(body.targetId) ? body.targetId : null;
    if (!targetId) return json({ error: 'Incidente inválido' }, 400);

    let existing: Record<string, any>[];
    try {
        existing = await sql`select id, status, started_at, resolved_at from status_incidents where id = ${targetId} limit 1`;
    } catch (cause) {
        return saveFailed(cause);
    }
    if (!existing.length) return json({ error: 'Incidente no encontrado' }, 404);
    const current = existing[0];

    if (body.action === 'set_status') {
        const status = typeof body.status === 'string' && STATUSES.has(body.status) ? body.status : null;
        if (!status) return json({ error: 'Estado inválido' }, 400);
        // Al resolver se conserva el fin ya registrado; si no hay, es ahora.
        const dates = incidentWindow(status, isoOrUndefined(current.started_at), body.resolvedAt ?? isoOrUndefined(current.resolved_at));
        if (typeof dates === 'string') return json({ error: dates }, 400);
        try {
            const [updated] = await sql.transaction([
                sql`
                    update status_incidents
                    set status = ${status}, resolved_at = ${dates.ended}, updated_at = now()
                    where id = ${targetId}
                    returning id`,
                opsAuditQuery({
                    ...auditBase(request, operator),
                    action: 'ops.status_incident_status_changed',
                    targetId,
                    metadata: { from: current.status, to: status },
                }),
            ]);
            return json({ success: true, id: updated[0]?.id });
        } catch (cause) {
            return saveFailed(cause);
        }
    }

    if (body.action === 'edit') {
        const fields = content(body);
        if (typeof fields === 'string') return json({ error: fields }, 400);
        const status = typeof body.status === 'string' && STATUSES.has(body.status) ? body.status : String(current.status);
        const dates = incidentWindow(status, body.startedAt ?? isoOrUndefined(current.started_at), body.resolvedAt ?? isoOrUndefined(current.resolved_at));
        if (typeof dates === 'string') return json({ error: dates }, 400);
        try {
            const [updated] = await sql.transaction([
                sql`
                    update status_incidents
                    set status = ${status}, severity = ${fields.severity},
                        title_es = ${fields.titleEs}, title_en = ${fields.titleEn},
                        summary_es = ${fields.summaryEs}, summary_en = ${fields.summaryEn},
                        started_at = ${dates.began}, resolved_at = ${dates.ended}, updated_at = now()
                    where id = ${targetId}
                    returning id`,
                opsAuditQuery({
                    ...auditBase(request, operator),
                    action: 'ops.status_incident_updated',
                    targetId,
                    metadata: { severity: fields.severity, from: current.status, to: status },
                }),
            ]);
            return json({ success: true, id: updated[0]?.id });
        } catch (cause) {
            return saveFailed(cause);
        }
    }

    return json({ error: 'Acción no permitida' }, 400);
};

// "Ver como" de Cord Ops (src/lib/ops-view.ts): POST emite el enlace de un
// solo uso hacia la app en solo lectura; DELETE termina las vistas abiertas
// de esa organización.
//
// Ver la app de un negocio expone sus clientes, precios y cobros: solo admin,
// con autenticación reciente, un motivo que queda en la bitácora y límite
// estricto. Ops solo escribe en su tabla (`ops_view_sessions`).
export const prerender = false;

import type { APIRoute } from 'astro';
import { sql, withOpsTx } from '../../../../../lib/db';
import { trustedIp } from '../../../../../lib/ip';
import { log } from '../../../../../lib/log';
import { opsAuditQuery, requireFreshOpsAuth } from '../../../../../lib/ops-auth';
import {
    OPS_VIEW_ENTER_PATH, OPS_VIEW_HANDOFF_SECONDS, OPS_VIEW_TTL_MINUTES,
    newOpsViewToken, opsViewAppOrigin, opsViewHash,
} from '../../../../../lib/ops-view';
import { strictRateLimit } from '../../../../../lib/ratelimit';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});

export const POST: APIRoute = async ({ params, request, locals }) => {
    const operator = locals.opsOperator;
    if (!operator) return json({ error: 'No autenticado' }, 401);
    if (operator.role !== 'admin') return json({ error: 'Permiso insuficiente' }, 403);
    const orgId = params.id || '';
    if (!UUID.test(orgId)) return json({ error: 'Organización inválida' }, 400);
    let body: any;
    try { body = await request.json(); } catch { return json({ error: 'JSON inválido' }, 400); }
    const reason = typeof body?.reason === 'string' ? body.reason.trim() : '';
    if (reason.length < 3 || reason.length > 300) return json({ error: 'Escribe el motivo (de 3 a 300 caracteres). Queda en la bitácora.' }, 400);
    const stale = requireFreshOpsAuth(operator);
    if (stale) return stale;
    const limited = await strictRateLimit(`ops-view:${operator.userId}`, 20, 3600);
    if (!limited.ok) return json({ error: 'Demasiadas vistas en poco tiempo. Espera unos minutos.' }, 429);

    const token = newOpsViewToken();
    const now = Date.now();
    try {
        const [orgs] = await withOpsTx(sql`select id, nombre from orgs where id = ${orgId} limit 1`);
        if (!orgs.length) return json({ error: 'Organización no encontrada' }, 404);
        const [inserted] = await withOpsTx(
            sql`insert into ops_view_sessions (org_id, operator_id, operator_email, reason, handoff_hash, handoff_expires_at, expires_at)
                values (${orgId}, ${operator.userId}, ${operator.email}, ${reason}, ${opsViewHash(token)},
                        ${new Date(now + OPS_VIEW_HANDOFF_SECONDS * 1000).toISOString()},
                        ${new Date(now + (OPS_VIEW_TTL_MINUTES * 60 + OPS_VIEW_HANDOFF_SECONDS) * 1000).toISOString()})
                returning id`,
            opsAuditQuery({
                actorUserId: operator.userId, actorEmail: operator.email, action: 'ops.view_as_started',
                targetType: 'organization', targetId: orgId, result: 'success', metadata: { reason },
                ip: trustedIp(request), userAgent: request.headers.get('user-agent') || 'desconocido',
            }),
        );
        if (!inserted.length) throw new Error('vista no creada');
        // El token va en la query del enlace: un solo uso, 90 s, y /ops-vista/entrar
        // responde con Referrer-Policy no-referrer y lo cambia por otro en la cookie.
        return json({ ok: true, url: `${opsViewAppOrigin()}${OPS_VIEW_ENTER_PATH}?t=${token}` });
    } catch (error) {
        log.error('no se pudo iniciar una vista de Ops', { route: 'ops/view', orgId, err: error });
        return json({ error: 'No se pudo abrir la vista. Inténtalo de nuevo.' }, 500);
    }
};

export const DELETE: APIRoute = async ({ params, request, locals }) => {
    const operator = locals.opsOperator;
    if (!operator) return json({ error: 'No autenticado' }, 401);
    if (operator.role !== 'admin') return json({ error: 'Permiso insuficiente' }, 403);
    const orgId = params.id || '';
    if (!UUID.test(orgId)) return json({ error: 'Organización inválida' }, 400);
    try {
        const [ended] = await withOpsTx(
            sql`update ops_view_sessions set ended_at = now(), ended_by = ${operator.email}
                where org_id = ${orgId} and ended_at is null and expires_at > now() returning id`,
            opsAuditQuery({
                actorUserId: operator.userId, actorEmail: operator.email, action: 'ops.view_as_ended',
                targetType: 'organization', targetId: orgId, result: 'success', metadata: {},
                ip: trustedIp(request), userAgent: request.headers.get('user-agent') || 'desconocido',
            }),
        );
        return json({ ok: true, ended: ended.length });
    } catch (error) {
        log.error('no se pudieron terminar las vistas de Ops', { route: 'ops/view', orgId, err: error });
        return json({ error: 'No se pudieron terminar las vistas.' }, 500);
    }
};

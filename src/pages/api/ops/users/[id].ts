export const prerender = false;

import type { APIRoute } from 'astro';
import { sql } from '../../../../lib/db';
import { trustedIp } from '../../../../lib/ip';
import { isAllowedOpsEmail, opsAuditQuery } from '../../../../lib/ops-auth';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});

export const PATCH: APIRoute = async ({ params, request, locals }) => {
    const operator = locals.opsOperator;
    if (!operator) return json({ error: 'No autenticado' }, 401);
    if (operator.role !== 'admin') return json({ error: 'Permiso insuficiente' }, 403);

    const targetId = params.id || '';
    if (!UUID.test(targetId)) return json({ error: 'Usuario inválido' }, 400);

    let body: any;
    try { body = await request.json(); } catch { return json({ error: 'JSON inválido' }, 400); }

    const rows = await sql`
      select u.id, u.email, u.suspended_at,
             exists(select 1 from ops_operators o where o.user_id = u.id and o.active) as is_operator,
             (select count(*)::int from orgs o where o.owner_id = u.id) as owned_orgs
      from users u where u.id = ${targetId} limit 1
    `;
    if (!rows.length) return json({ error: 'Usuario no encontrado' }, 404);
    const target = rows[0] as any;
    const ip = trustedIp(request);
    const userAgent = request.headers.get('user-agent') || 'desconocido';
    const auditBase = {
        actorUserId: operator.userId,
        actorEmail: operator.email,
        targetType: 'user',
        targetId,
        ip,
        userAgent,
    };

    if (body?.action === 'revoke_sessions') {
        const [revoked] = await sql.transaction([
            sql`delete from sessions where user_id = ${targetId} returning id`,
            opsAuditQuery({ ...auditBase, action: 'ops.user_sessions_revoked', metadata: { target_email: target.email } }),
        ]);
        return json({ success: true, affected: revoked.length });
    }

    if (body?.action === 'unlock') {
        await sql.transaction([
            sql`update users set failed_login_count = 0, locked_until = null where id = ${targetId}`,
            opsAuditQuery({ ...auditBase, action: 'ops.user_unlocked', metadata: { target_email: target.email } }),
        ]);
        return json({ success: true });
    }

    if (body?.action === 'suspend') {
        if (target.is_operator || isAllowedOpsEmail(target.email)) {
            return json({ error: 'Los operadores de Ops no pueden suspenderse desde Ops' }, 403);
        }
        if (body?.confirmation !== target.email) {
            return json({ error: 'La confirmación no coincide con el correo' }, 400);
        }
        const reason = typeof body?.reason === 'string' ? body.reason.trim().slice(0, 500) : '';
        const [sessions] = await sql.transaction([
            sql`delete from sessions where user_id = ${targetId} returning id`,
            sql`update users set suspended_at = now(), suspended_reason = ${reason || null} where id = ${targetId}`,
            opsAuditQuery({ ...auditBase, action: 'ops.user_suspended', metadata: { target_email: target.email, reason: reason || null } }),
        ]);
        return json({ success: true, affected: sessions.length });
    }

    if (body?.action === 'restore') {
        await sql.transaction([
            sql`update users set suspended_at = null, suspended_reason = null, failed_login_count = 0, locked_until = null where id = ${targetId}`,
            opsAuditQuery({ ...auditBase, action: 'ops.user_restored', metadata: { target_email: target.email } }),
        ]);
        return json({ success: true });
    }

    if (body?.action === 'delete_user') {
        if (target.is_operator || isAllowedOpsEmail(target.email)) {
            return json({ error: 'Los operadores de Ops no pueden eliminarse desde Ops' }, 403);
        }
        if (Number(target.owned_orgs) > 0) {
            return json({ error: 'Transfiere o elimina primero las organizaciones de este usuario' }, 409);
        }
        if (body?.confirmation !== target.email) {
            return json({ error: 'La confirmación no coincide con el correo' }, 400);
        }
        await sql.transaction([
            sql`delete from users where id = ${targetId}`,
            opsAuditQuery({ ...auditBase, action: 'ops.user_deleted', metadata: { target_email: target.email } }),
        ]);
        return json({ success: true });
    }

    return json({ error: 'Acción no permitida' }, 400);
};

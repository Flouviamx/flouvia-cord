export const prerender = false;

import type { APIRoute } from 'astro';
import { sql, withOpsTx } from '../../../../lib/db';
import { trustedIp } from '../../../../lib/ip';
import { log } from '../../../../lib/log';
import { isAllowedOpsEmail, opsAuditQuery, requireFreshOpsAuth } from '../../../../lib/ops-auth';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});

/**
 * Accesos que una persona delegó y que sobreviven a cerrar sus sesiones: los
 * permisos OAuth (Zapier, Make) con su llave de acceso, y las llaves que
 * acuñó `cord login`. Suspender sin esto dejaba a la cuenta operando por API.
 * Las llaves de API de la organización NO se tocan: son del negocio, no de
 * la persona que las creó.
 */
function revokeDelegatedAccess(userId: string) {
    return [
        sql`
          update api_keys set revoked_at = now()
          where revoked_at is null and id in (
            select g.api_key_id from oauth_grants g where g.user_id = ${userId}
            union
            select c.api_key_id from cli_logins c where c.aprobado_por = ${userId} and c.api_key_id is not null
          )
          returning id
        `,
        sql`update oauth_grants set revoked_at = now() where user_id = ${userId} and revoked_at is null returning id`,
    ];
}

export const PATCH: APIRoute = async (context) => {
    try {
        return await handle(context);
    } catch (error) {
        log.error('error no controlado', { route: 'ops/users', err: error });
        return json({ error: 'No se pudo completar la acción. Revisa el estado de la cuenta antes de reintentar.' }, 500);
    }
};

async function handle({ params, request, locals }: Parameters<APIRoute>[0]): Promise<Response> {
    const operator = locals.opsOperator;
    if (!operator) return json({ error: 'No autenticado' }, 401);
    if (operator.role !== 'admin') return json({ error: 'Permiso insuficiente' }, 403);

    const targetId = params.id || '';
    if (!UUID.test(targetId)) return json({ error: 'Usuario inválido' }, 400);

    let body: any;
    try { body = await request.json(); } catch { return json({ error: 'JSON inválido' }, 400); }

    const [rows] = await withOpsTx(sql`
      select u.id, u.email, u.suspended_at,
             exists(select 1 from ops_operators o where o.user_id = u.id and o.active) as is_operator,
             (select count(*)::int from orgs o where o.owner_id = u.id) as owned_orgs
      from users u where u.id = ${targetId} limit 1
    `);
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
        const [revoked] = await withOpsTx(
            sql`delete from sessions where user_id = ${targetId} returning id`,
            opsAuditQuery({ ...auditBase, action: 'ops.user_sessions_revoked', metadata: { target_email: target.email } }),
        );
        return json({ success: true, affected: revoked.length });
    }

    if (body?.action === 'unlock') {
        await withOpsTx(
            sql`update users set failed_login_count = 0, locked_until = null where id = ${targetId}`,
            opsAuditQuery({ ...auditBase, action: 'ops.user_unlocked', metadata: { target_email: target.email } }),
        );
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
        const [sessions, keys, grants] = await withOpsTx(
            sql`delete from sessions where user_id = ${targetId} returning id`,
            ...revokeDelegatedAccess(targetId),
            sql`update users set suspended_at = now(), suspended_reason = ${reason || null} where id = ${targetId}`,
            opsAuditQuery({ ...auditBase, action: 'ops.user_suspended', metadata: { target_email: target.email, reason: reason || null } }),
        );
        return json({ success: true, affected: sessions.length, revokedKeys: keys.length, revokedGrants: grants.length });
    }

    if (body?.action === 'restore') {
        await withOpsTx(
            sql`update users set suspended_at = null, suspended_reason = null, failed_login_count = 0, locked_until = null where id = ${targetId}`,
            opsAuditQuery({ ...auditBase, action: 'ops.user_restored', metadata: { target_email: target.email } }),
        );
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
        const stale = requireFreshOpsAuth(operator);
        if (stale) return stale;
        // Borrar al usuario borra sus permisos OAuth en cascada, pero NO la
        // llave de acceso que cada permiso acuñó: se revoca antes.
        await withOpsTx(
            ...revokeDelegatedAccess(targetId),
            sql`delete from users where id = ${targetId}`,
            opsAuditQuery({ ...auditBase, action: 'ops.user_deleted', metadata: { target_email: target.email } }),
        );
        return json({ success: true });
    }

    return json({ error: 'Acción no permitida' }, 400);
}

export const prerender = false;

import type { APIRoute } from 'astro';
import { sql } from '../../../../lib/db';
import { trustedIp } from '../../../../lib/ip';
import { OPS_ALLOWED_EMAILS, opsAuditQuery } from '../../../../lib/ops-auth';

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
    if (!UUID.test(targetId)) return json({ error: 'Organización inválida' }, 400);
    let body: any;
    try { body = await request.json(); } catch { return json({ error: 'JSON inválido' }, 400); }

    const rows = await sql`
      select o.id, o.nombre,
             exists(
               select 1 from users owner where owner.id = o.owner_id
               and lower(owner.email) = any(${[...OPS_ALLOWED_EMAILS]}::text[])
             ) or exists(
               select 1 from org_members om join users u on u.id = om.user_id
               where om.org_id = o.id and lower(u.email) = any(${[...OPS_ALLOWED_EMAILS]}::text[])
             ) as protected
      from orgs o where o.id = ${targetId} limit 1
    `;
    if (!rows.length) return json({ error: 'Organización no encontrada' }, 404);
    const target = rows[0] as any;
    const ip = trustedIp(request);
    const userAgent = request.headers.get('user-agent') || 'desconocido';
    const auditBase = {
        actorUserId: operator.userId,
        actorEmail: operator.email,
        targetType: 'organization',
        targetId,
        ip,
        userAgent,
    };

    if (body?.action === 'revoke_api_keys') {
        const [keys] = await sql.transaction([
            sql`update api_keys set revoked_at = now() where org_id = ${targetId} and revoked_at is null returning id`,
            opsAuditQuery({ ...auditBase, action: 'ops.organization_api_keys_revoked', metadata: { organization: target.nombre } }),
        ]);
        return json({ success: true, affected: keys.length });
    }

    if (body?.action === 'disable_webhooks') {
        const [webhooks] = await sql.transaction([
            sql`update webhooks set activo = false where org_id = ${targetId} and activo = true returning id`,
            opsAuditQuery({ ...auditBase, action: 'ops.organization_webhooks_disabled', metadata: { organization: target.nombre } }),
        ]);
        return json({ success: true, affected: webhooks.length });
    }

    if (body?.action === 'revoke_member_sessions') {
        if (body?.confirmation !== target.nombre) {
            return json({ error: 'La confirmación no coincide con la organización' }, 400);
        }
        const [sessions] = await sql.transaction([
            sql`
              delete from sessions
              where user_id in (select user_id from org_members where org_id = ${targetId} and user_id is not null)
              returning id
            `,
            opsAuditQuery({ ...auditBase, action: 'ops.organization_sessions_revoked', metadata: { organization: target.nombre } }),
        ]);
        return json({ success: true, affected: sessions.length });
    }

    if (body?.action === 'delete_organization') {
        if (target.protected) return json({ error: 'Las organizaciones de los operadores están protegidas' }, 403);
        if (body?.confirmation !== target.nombre) {
            return json({ error: 'La confirmación no coincide con la organización' }, 400);
        }
        await sql.transaction([
            sql`delete from orgs where id = ${targetId}`,
            opsAuditQuery({ ...auditBase, action: 'ops.organization_deleted', metadata: { organization: target.nombre } }),
        ]);
        return json({ success: true });
    }

    return json({ error: 'Acción no permitida' }, 400);
};

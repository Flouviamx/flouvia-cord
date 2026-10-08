export const prerender = false;

import type { APIRoute } from 'astro';
import { sql, withOpsTx } from '../../../../lib/db';
import { trustedIp } from '../../../../lib/ip';
import { log } from '../../../../lib/log';
import { releaseOrgBilling } from '../../../../lib/org-delete';
import { OPS_ALLOWED_EMAILS, opsAuditQuery, requireFreshOpsAuth } from '../../../../lib/ops-auth';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});

// Toda acción de esta ruta es destructiva o irreversible: todas exigen escribir
// el nombre exacto de la organización. Revocar llaves no se deshace.
const ACTIONS = new Set(['revoke_api_keys', 'disable_webhooks', 'revoke_member_sessions', 'delete_organization']);

export const PATCH: APIRoute = async ({ params, request, locals }) => {
    const operator = locals.opsOperator;
    if (!operator) return json({ error: 'No autenticado' }, 401);
    if (operator.role !== 'admin') return json({ error: 'Permiso insuficiente' }, 403);

    const targetId = params.id || '';
    if (!UUID.test(targetId)) return json({ error: 'Organización inválida' }, 400);
    let body: any;
    try { body = await request.json(); } catch { return json({ error: 'JSON inválido' }, 400); }
    const action = typeof body?.action === 'string' ? body.action : '';
    if (!ACTIONS.has(action)) return json({ error: 'Acción no permitida' }, 400);

    try {
        const [rows] = await withOpsTx(sql`
          select o.id, o.nombre, o.stripe_subscription_id, o.stripe_account_id,
                 exists(
                   select 1 from users owner where owner.id = o.owner_id
                   and lower(owner.email) = any(${[...OPS_ALLOWED_EMAILS]}::text[])
                 ) or exists(
                   select 1 from org_members om join users u on u.id = om.user_id
                   where om.org_id = o.id and lower(u.email) = any(${[...OPS_ALLOWED_EMAILS]}::text[])
                 ) as protected
          from orgs o where o.id = ${targetId} limit 1
        `);
        if (!rows.length) return json({ error: 'Organización no encontrada' }, 404);
        const target = rows[0] as any;
        if (body?.confirmation !== target.nombre) {
            return json({ error: 'La confirmación no coincide con el nombre de la organización' }, 400);
        }
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

        if (action === 'revoke_api_keys') {
            const [keys] = await withOpsTx(
                sql`update api_keys set revoked_at = now() where org_id = ${targetId} and revoked_at is null returning id`,
                opsAuditQuery({ ...auditBase, action: 'ops.organization_api_keys_revoked', metadata: { organization: target.nombre } }),
            );
            return json({ success: true, affected: keys.length });
        }

        if (action === 'disable_webhooks') {
            const [webhooks] = await withOpsTx(
                sql`update webhooks set activo = false where org_id = ${targetId} and activo = true returning id`,
                opsAuditQuery({ ...auditBase, action: 'ops.organization_webhooks_disabled', metadata: { organization: target.nombre } }),
            );
            return json({ success: true, affected: webhooks.length });
        }

        if (action === 'revoke_member_sessions') {
            // Un operador que además es miembro conserva su sesión: Ops no se
            // corta a sí mismo el acceso a la app al operar sobre un cliente.
            const [sessions] = await withOpsTx(
                sql`
                  delete from sessions
                  where user_id in (
                    select om.user_id from org_members om
                    where om.org_id = ${targetId} and om.user_id is not null
                      and not exists (select 1 from ops_operators op where op.user_id = om.user_id)
                  )
                  returning id
                `,
                opsAuditQuery({ ...auditBase, action: 'ops.organization_sessions_revoked', metadata: { organization: target.nombre } }),
            );
            return json({ success: true, affected: sessions.length });
        }

        // delete_organization
        if (target.protected) return json({ error: 'Las organizaciones de los operadores están protegidas' }, 403);
        const stale = requireFreshOpsAuth(operator);
        if (stale) return stale;
        // Primero el proveedor, igual que el borrado desde la app: si la
        // suscripción no se pudo cancelar, no se borra nada y se puede reintentar.
        const billing = await releaseOrgBilling(target);
        if (target.stripe_subscription_id && !billing.subscriptionCanceled) {
            return json({ error: 'No se pudo cancelar la suscripción de esta organización. No se eliminó nada; inténtalo de nuevo.' }, 502);
        }
        await withOpsTx(
            sql`delete from orgs where id = ${targetId}`,
            opsAuditQuery({
                ...auditBase,
                action: 'ops.organization_deleted',
                metadata: {
                    organization: target.nombre,
                    subscription_canceled: billing.subscriptionCanceled,
                    connect_account_pending_review: billing.connectAccount,
                },
            }),
        );
        return json({ success: true, connectAccountPendingReview: billing.connectAccount });
    } catch (error) {
        log.error('error no controlado', { route: 'ops/organizations', err: error });
        return json({ error: 'No se pudo completar la acción. Revisa el estado de la organización antes de reintentar.' }, 500);
    }
};

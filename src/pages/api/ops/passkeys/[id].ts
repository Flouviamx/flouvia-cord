export const prerender = false;

import type { APIRoute } from 'astro';
import { sql } from '../../../../lib/db';
import { log } from '../../../../lib/log';
import { trustedIp } from '../../../../lib/ip';
import { requireFreshOpsAuth } from '../../../../lib/ops-auth';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});

/** Un operador solo elimina SUS passkeys. Si era la de esta sesión, la sesión cae con ella. */
export const DELETE: APIRoute = async ({ params, request, locals }) => {
    const operator = locals.opsOperator;
    if (!operator) return json({ error: 'No autenticado' }, 401);
    const stale = requireFreshOpsAuth(operator);
    if (stale) return stale;

    const id = String(params.id || '');
    if (!/^[A-Za-z0-9_-]{16,1024}$/.test(id)) return json({ error: 'Passkey inválida' }, 400);

    try {
        const deleted = await sql`
            with del as (
                delete from ops_passkeys where id = ${id} and operator_id = ${operator.userId} returning id
            ), audit as (
                insert into ops_audit_log (actor_operator_id, actor_email, action, target_type, target_id, result, ip, user_agent)
                select ${operator.userId}, ${operator.email}, 'ops.passkey_deleted', 'ops_passkey', left(del.id, 16), 'success',
                       ${trustedIp(request)}, ${request.headers.get('user-agent')}
                from del
            )
            select id from del
        `;
        if (!deleted.length) return json({ error: 'Passkey no encontrada' }, 404);
        // ops_sessions.credential_id es on delete cascade: si esta sesión entró
        // con esa llave, ya no existe.
        const signedOut = await sql`select 1 from ops_sessions where id = ${operator.sessionId}`;
        return json({ success: true, signedOut: signedOut.length === 0 });
    } catch (error) {
        log.error('error no controlado', { route: 'ops/passkeys/delete', err: error });
        return json({ error: 'No se pudo eliminar la passkey.' }, 500);
    }
};

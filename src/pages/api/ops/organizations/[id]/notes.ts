// Notas y etiquetas internas de Ops sobre una organización. Son de Cord, no del
// negocio: solo el carril de Ops las lee (db/migrations/2026-10-08-ops-fase3.sql).
// Cualquier operador escribe; una nota se borra solo por quien la escribió o
// por un admin, y nunca se edita: se borra y se escribe otra. Todo queda en la
// bitácora de Ops en la misma transacción.
export const prerender = false;

import type { APIRoute } from 'astro';
import { sql, withOpsTx } from '../../../../../lib/db';
import { trustedIp } from '../../../../../lib/ip';
import { log } from '../../../../../lib/log';
import { opsAuditQuery } from '../../../../../lib/ops-auth';
import { normalizeOpsTag, OPS_NOTE_MAX } from '../../../../../lib/ops-notes';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});

export const POST: APIRoute = async ({ params, request, locals }) => {
    const operator = locals.opsOperator;
    if (!operator) return json({ error: 'No autenticado' }, 401);
    const orgId = params.id || '';
    if (!UUID.test(orgId)) return json({ error: 'Organización inválida' }, 400);
    let body: any;
    try { body = await request.json(); } catch { return json({ error: 'JSON inválido' }, 400); }

    const audit = (action: string, metadata: Record<string, unknown>) => opsAuditQuery({
        actorUserId: operator.userId,
        actorEmail: operator.email,
        action,
        targetType: 'organization',
        targetId: orgId,
        metadata,
        ip: trustedIp(request),
        userAgent: request.headers.get('user-agent') || 'desconocido',
    });

    try {
        const [exists] = await withOpsTx(sql`select 1 from orgs where id = ${orgId}`);
        if (!exists.length) return json({ error: 'Organización no encontrada' }, 404);

        if (body?.kind === 'note') {
            const text = typeof body.body === 'string' ? body.body.trim() : '';
            if (!text) return json({ error: 'Escribe la nota.' }, 400);
            if (text.length > OPS_NOTE_MAX) return json({ error: `La nota admite hasta ${OPS_NOTE_MAX} caracteres.` }, 400);
            const [rows] = await withOpsTx(
                sql`insert into ops_org_notes (org_id, author_operator_id, author_email, body)
                    values (${orgId}, ${operator.userId}, ${operator.email}, ${text}) returning id`,
                audit('ops.org_note_added', { length: text.length }),
            );
            return json({ success: true, id: rows[0]?.id });
        }

        if (body?.kind === 'tag') {
            const tag = normalizeOpsTag(body.tag);
            if (!tag) return json({ error: 'Una etiqueta usa minúsculas, números y guiones, hasta 24 caracteres.' }, 400);
            const [count] = await withOpsTx(sql`select count(*)::int n from ops_org_tags where org_id = ${orgId}`);
            if (Number(count[0]?.n) >= 12) return json({ error: 'Una organización admite hasta 12 etiquetas.' }, 409);
            await withOpsTx(
                sql`insert into ops_org_tags (org_id, tag, created_by) values (${orgId}, ${tag}, ${operator.email})
                    on conflict (org_id, tag) do nothing`,
                audit('ops.org_tag_added', { tag }),
            );
            return json({ success: true, tag });
        }
        return json({ error: 'Acción no permitida' }, 400);
    } catch (error) {
        log.error('error no controlado', { route: 'ops/organizations/notes', err: error });
        return json({ error: 'No se pudo guardar.' }, 500);
    }
};

export const DELETE: APIRoute = async ({ params, request, locals }) => {
    const operator = locals.opsOperator;
    if (!operator) return json({ error: 'No autenticado' }, 401);
    const orgId = params.id || '';
    if (!UUID.test(orgId)) return json({ error: 'Organización inválida' }, 400);
    let body: any;
    try { body = await request.json(); } catch { return json({ error: 'JSON inválido' }, 400); }

    const audit = (action: string, metadata: Record<string, unknown>) => opsAuditQuery({
        actorUserId: operator.userId,
        actorEmail: operator.email,
        action,
        targetType: 'organization',
        targetId: orgId,
        metadata,
        ip: trustedIp(request),
        userAgent: request.headers.get('user-agent') || 'desconocido',
    });

    try {
        if (body?.kind === 'note') {
            const noteId = typeof body.id === 'string' && UUID.test(body.id) ? body.id : '';
            if (!noteId) return json({ error: 'Nota inválida' }, 400);
            const isAdmin = operator.role === 'admin';
            // El autor o un admin; la condición vive en el DELETE, no en un select previo.
            const [rows] = await withOpsTx(sql`
                with gone as (
                  delete from ops_org_notes
                   where id = ${noteId} and org_id = ${orgId}
                     and (${isAdmin} or author_operator_id = ${operator.userId})
                  returning id, author_email, char_length(body) length
                )
                insert into ops_audit_log (actor_operator_id, actor_email, action, target_type, target_id, result, metadata, ip, user_agent)
                select ${operator.userId}, ${operator.email}, 'ops.org_note_deleted', 'organization', ${orgId}, 'success',
                       jsonb_build_object('author', author_email, 'length', length),
                       ${trustedIp(request)}, ${request.headers.get('user-agent') || 'desconocido'}
                  from gone
                returning id`);
            if (!rows.length) return json({ error: 'Solo quien escribió la nota o un admin puede borrarla.' }, 403);
            return json({ success: true });
        }

        if (body?.kind === 'tag') {
            const tag = normalizeOpsTag(body.tag);
            if (!tag) return json({ error: 'Etiqueta inválida' }, 400);
            await withOpsTx(
                sql`delete from ops_org_tags where org_id = ${orgId} and tag = ${tag}`,
                audit('ops.org_tag_removed', { tag }),
            );
            return json({ success: true });
        }
        return json({ error: 'Acción no permitida' }, 400);
    } catch (error) {
        log.error('error no controlado', { route: 'ops/organizations/notes', err: error });
        return json({ error: 'No se pudo borrar.' }, 500);
    }
};

// POST /api/equipo/resend { id } — regenera el link de una invitación
// pendiente (el token crudo original ya no es recuperable; solo se guarda su
// sha256 — ver equipo.ts). Rota el token, extiende la vigencia otros 7 días y
// reenvía el correo si el miembro tiene uno.
export const prerender = false;

import type { APIRoute } from 'astro';
import { sql, getActiveOrgId, logAudit, reqIp, withOrgTx } from '../../../lib/db';
import { requirePerm } from '../../../lib/queries';
import { sha256Hex } from '../../../lib/auth';
import { sendTeamInviteEmail } from '../../../lib/auth-email';
import { randomBytes } from 'node:crypto';
import { rateLimit, tooMany } from '../../../lib/ratelimit';
import { requireEntitlement } from '../../../lib/org-entitlements';

const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

export const POST: APIRoute = async ({ request }) => {
    const denied = await requirePerm('equipo');
    if (denied) return denied;

    const orgId = await getActiveOrgId();
    const subscriptionDenied = await requireEntitlement(orgId, 'team');
    if (subscriptionDenied) return subscriptionDenied;
    const rl = await rateLimit(`invite-resend:${orgId}`, 20, 60);
    if (!rl.ok) return tooMany(rl.retryAfter);

    let body: any;
    try { body = await request.json(); } catch { return json({ error: 'JSON inválido' }, 400); }
    const id = String(body.id ?? '');
    if (!id) return json({ error: 'Falta el miembro' }, 400);

    const [rows] = await withOrgTx(orgId, sql`select estado, email from org_members where id = ${id} and org_id = ${orgId}`);
    if (!rows.length) return json({ error: 'Miembro no encontrado' }, 404);
    if (rows[0].estado !== 'invitado') return json({ error: 'Esta invitación ya no está pendiente.' }, 409);

    const token = randomBytes(24).toString('base64url');
    const tokenHash = sha256Hex(token);
    await withOrgTx(orgId, sql`
        update org_members set token = ${tokenHash}, token_expires_at = now() + interval '7 days'
        where id = ${id} and org_id = ${orgId}`);

    const [[org]] = await withOrgTx(orgId, sql`select nombre from orgs where id = ${orgId}`);
    const email = rows[0].email as string | null;
    let emailed = false;
    if (email) {
        const sendRes = await sendTeamInviteEmail(email, org.nombre as string, token);
        emailed = sendRes.sent;
    }

    await logAudit(orgId, { accion: 'equipo.invitacion_reenviada', entidad: 'miembro', entidad_id: id, ip: reqIp(request), userAgent: request.headers.get('user-agent') });
    const link = `${new URL(request.url).origin}/unirse/${token}`;
    return json({ ok: true, link, emailed });
};

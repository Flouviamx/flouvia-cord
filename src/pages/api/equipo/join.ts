// POST /api/equipo/join { token } — el usuario logueado acepta una invitación.
// Vincula su clerk_user_id al miembro invitado y lo deja 'activo'. A partir de
// ahí getActiveOrgId lo resuelve hacia esa org. Ruta interna (requiere sesión).
export const prerender = false;

import type { APIRoute } from 'astro';
import { sql, logAudit, reqIp } from '../../../lib/db';
import { currentUserId } from '../../../lib/context';

const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

export const POST: APIRoute = async ({ request }) => {
    const userId = currentUserId();
    if (!userId) return json({ error: 'Inicia sesión para unirte' }, 401);

    let body: any;
    try { body = await request.json(); } catch { return json({ error: 'JSON inválido' }, 400); }
    const token = String(body.token ?? '').trim();
    if (!token) return json({ error: 'Falta el token de invitación' }, 400);

    const rows = await sql`select id, org_id, clerk_user_id, estado from org_members where token = ${token}`;
    if (!rows.length) return json({ error: 'Invitación no válida' }, 404);
    const inv = rows[0];
    if (inv.estado === 'revocado') return json({ error: 'Esta invitación fue cancelada' }, 410);
    if (inv.clerk_user_id && inv.clerk_user_id !== userId) return json({ error: 'Esta invitación ya fue usada' }, 409);

    const orgId = inv.org_id as string;

    // ¿Ya soy miembro de esta org? (evita violar el índice único) → consumo el invite.
    const existing = await sql`select id from org_members where org_id = ${orgId} and clerk_user_id = ${userId} and estado = 'activo' limit 1`;
    if (existing.length) {
        if (existing[0].id !== inv.id) await sql`delete from org_members where id = ${inv.id}`;
        return json({ ok: true, orgId, already: true });
    }

    await sql`update org_members set clerk_user_id = ${userId}, estado = 'activo', joined_at = now() where id = ${inv.id}`;
    await logAudit(orgId, { accion: 'equipo.union', entidad: 'miembro', entidad_id: inv.id, detalle: 'Aceptó la invitación', ip: reqIp(request) });
    return json({ ok: true, orgId });
};

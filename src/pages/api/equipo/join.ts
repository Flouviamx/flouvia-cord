// POST /api/equipo/join { token } — el usuario logueado acepta una invitación.
// Vincula su user_id al miembro invitado y lo deja 'activo'. A partir de
// ahí getActiveOrgId lo resuelve hacia esa org. Ruta interna (requiere sesión).
export const prerender = false;

import type { APIRoute } from 'astro';
import { sql, logAudit, reqIp } from '../../../lib/db';
import { currentUserId } from '../../../lib/context';
import { reportUsage } from '../../../lib/billing';
import { sha256Hex } from '../../../lib/auth';
import { rateLimit, tooMany } from '../../../lib/ratelimit';
import { trustedIp } from '../../../lib/ip';

const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

export const POST: APIRoute = async ({ request }) => {
    const userId = currentUserId();
    if (!userId) return json({ error: 'Inicia sesión para unirte' }, 401);

    const rl = await rateLimit(`invite-join:${trustedIp(request)}`, 20, 60);
    if (!rl.ok) return tooMany(rl.retryAfter);

    let body: any;
    try { body = await request.json(); } catch { return json({ error: 'JSON inválido' }, 400); }
    const token = String(body.token ?? '').trim();
    if (!token) return json({ error: 'Falta el token de invitación' }, 400);

    // El token se guarda hasheado (sha256) — ver equipo.ts. Buscar por el hash
    // del token recibido, nunca por el valor crudo.
    const tokenHash = sha256Hex(token);
    const rows = await sql`select id, org_id, user_id, estado, email, token_expires_at from org_members where token = ${tokenHash}`;
    if (!rows.length) return json({ error: 'Invitación no válida' }, 404);
    const inv = rows[0];
    if (inv.estado === 'revocado') return json({ error: 'Esta invitación fue cancelada' }, 410);
    if (inv.token_expires_at && new Date(inv.token_expires_at as string) < new Date()) {
        return json({ error: 'Esta invitación expiró. Pide una nueva.' }, 410);
    }
    if (inv.user_id && inv.user_id !== userId) return json({ error: 'Esta invitación ya fue usada' }, 409);

    // Si la invitación se dirigió a un correo específico, solo esa cuenta
    // puede consumirla — antes cualquiera que obtuviera el link (reenviado,
    // filtrado, adivinado) podía unirse como ese miembro sin importar su
    // propio correo. Las invitaciones puramente por link (sin email) no
    // llevan esta restricción — es su modo de uso documentado.
    if (inv.email) {
        const [me] = await sql`select email from users where id = ${userId} limit 1`;
        if (!me || String(me.email).toLowerCase() !== String(inv.email).toLowerCase()) {
            return json({ error: 'Esta invitación es para otro correo. Inicia sesión con esa cuenta.' }, 403);
        }
    }

    const orgId = inv.org_id as string;

    // ¿Ya soy miembro de esta org? (evita violar el índice único) → consumo el invite.
    const existing = await sql`select id from org_members where org_id = ${orgId} and user_id = ${userId} and estado = 'activo' limit 1`;
    if (existing.length) {
        if (existing[0].id !== inv.id) await sql`delete from org_members where id = ${inv.id}`;
        return json({ ok: true, orgId, already: true });
    }

    await sql`update org_members set user_id = ${userId}, estado = 'activo', joined_at = now(), token = null, token_expires_at = null where id = ${inv.id}`;
    await logAudit(orgId, { accion: 'equipo.union', entidad: 'miembro', entidad_id: inv.id, detalle: 'Aceptó la invitación', ip: reqIp(request), userAgent: request.headers.get('user-agent') });
    // Un miembro activo más cuenta como usuario del sistema (excedente vía Stripe).
    await reportUsage(orgId, 'usuario', 1);
    return json({ ok: true, orgId });
};

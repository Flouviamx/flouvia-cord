// /api/equipo — gestión de miembros de la org (requiere permiso 'equipo').
//   POST   { email?, nombre?, preset } | { permisos }   → crea invitación (token + link)
//   PATCH  { id, rol?, permisos? }                       → actualiza rol/permisos de un miembro
//   DELETE { id }                                        → revoca a un miembro (no al owner)
// El owner siempre tiene permiso 'equipo'. Todo se valida server-side.
export const prerender = false;

import type { APIRoute } from 'astro';
import { sql, getActiveOrgId, logAudit, reqIp, withOrgTx } from '../../lib/db';
import { currentUserId } from '../../lib/context';
import { requirePerm } from '../../lib/queries';
import { PRESETS, ALL_PERM_KEYS, planTieneEquipo, type PermMap } from '../../lib/permissions';
import { sha256Hex } from '../../lib/auth';
import { sendTeamInviteEmail } from '../../lib/auth-email';
import { randomBytes } from 'node:crypto';
import { rateLimit, tooMany } from '../../lib/ratelimit';
import { trackServer } from '../../lib/posthog-server';

const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

// Nuestro preset -> rol interno

// Sanea una matriz de permisos: solo claves conocidas, valores booleanos.
function cleanPermisos(input: any): PermMap {
    const out: PermMap = {};
    for (const k of ALL_PERM_KEYS) out[k] = !!(input && input[k]);
    return out;
}

export const POST: APIRoute = async (context) => {
    const { request } = context;
    const denied = await requirePerm('equipo');
    if (denied) return denied;

    const orgId = await getActiveOrgId();
    const rl = await rateLimit(`invite-create:${orgId}`, 30, 60);
    if (!rl.ok) return tooMany(rl.retryAfter);

    const [[org]] = await withOrgTx(orgId, sql`select coalesce(plan,'free') as plan, invite_domains, nombre, (sandbox_of is not null) as is_sandbox, is_demo from orgs where id = ${orgId}`);
    if (!planTieneEquipo(org.plan as string)) {
        return json({ error: 'Invitar a tu equipo requiere el plan Negocio.' }, 402);
    }

    let body: any;
    try { body = await request.json(); } catch { return json({ error: 'JSON inválido' }, 400); }

    const email = body.email ? String(body.email).trim().toLowerCase().slice(0, 160) : null;

    // Restricción por dominio (Seguridad): si la org limitó los dominios de
    // invitación, el correo debe pertenecer a uno de ellos.
    const allowed = (org.invite_domains as string | null)?.split(',').map((d) => d.trim()).filter(Boolean) ?? [];
    if (email && allowed.length) {
        const dom = email.split('@')[1] ?? '';
        if (!allowed.includes(dom)) {
            return json({ error: `Solo puedes invitar correos de: ${allowed.join(', ')}. Cámbialo en Ajustes › Seguridad.` }, 422);
        }
    }
    const nombre = body.nombre ? String(body.nombre).trim().slice(0, 120) : null;
    const preset = String(body.preset ?? 'vendedor');

    //    invitación por TOKEN/LINK.
    const permisos = body.permisos ? cleanPermisos(body.permisos)
        : cleanPermisos(PRESETS[preset]?.permisos ?? PRESETS.vendedor.permisos);
    const rol = PRESETS[preset] ? preset : 'miembro';

    // El token CRUDO viaja en el link/correo; solo su sha256 se guarda (mismo
    // patrón que sesiones/reset — antes se guardaba en claro, así que
    // cualquier lectura de `org_members` filtraba invitaciones vivas y
    // utilizables). 7 días de vigencia — antes no caducaban NUNCA.
    const token = randomBytes(24).toString('base64url');
    const tokenHash = sha256Hex(token);

    const [[row]] = await withOrgTx(orgId, sql`
        insert into org_members (org_id, email, nombre, rol, permisos, estado, token, token_expires_at, invited_by)
        values (${orgId}, ${email}, ${nombre}, ${rol}, ${JSON.stringify(permisos)}::jsonb, 'invitado', ${tokenHash}, now() + interval '7 days', ${currentUserId()})
        returning id`);

    await logAudit(orgId, { accion: 'equipo.invitado', entidad: 'miembro', entidad_id: row.id, detalle: email ?? 'invitación por link', ip: reqIp(request), userAgent: request.headers.get('user-agent') });
    await trackServer('team_member_invited', orgId, { role_assigned: rol }, !!org.is_sandbox, !!org.is_demo);
    const link = `${new URL(request.url).origin}/unirse/${token}`;

    let emailed = false;
    if (email) {
        const sendRes = await sendTeamInviteEmail(email, org.nombre as string, token);
        emailed = sendRes.sent;
        if (!sendRes.sent) console.warn('[equipo] no se pudo enviar la invitación:', sendRes.error || sendRes.skipped);
    }

    // El link SIEMPRE va en la respuesta (respaldo copiable para el admin) —
    // antes la UI decía "Invitación enviada" y el link se perdía si el correo
    // fallaba o si la invitación era solo-link (sin email).
    return json({ ok: true, id: row.id, link, emailed });
};

export const PATCH: APIRoute = async ({ request }) => {
    const denied = await requirePerm('equipo');
    if (denied) return denied;

    const orgId = await getActiveOrgId();
    let body: any;
    try { body = await request.json(); } catch { return json({ error: 'JSON inválido' }, 400); }
    const id = String(body.id ?? '');
    if (!id) return json({ error: 'Falta el miembro' }, 400);

    const [rows] = await withOrgTx(orgId, sql`select rol from org_members where id = ${id} and org_id = ${orgId}`);
    if (!rows.length) return json({ error: 'Miembro no encontrado' }, 404);
    if (rows[0].rol === 'owner') return json({ error: 'No puedes cambiar los permisos del dueño.' }, 409);

    const permisos = body.permisos ? cleanPermisos(body.permisos) : null;
    const rol = body.rol !== undefined
        ? (PRESETS[String(body.rol)] ? String(body.rol) : 'miembro')
        : null;

    if (permisos && rol) {
        await withOrgTx(orgId, sql`update org_members set permisos = ${JSON.stringify(permisos)}::jsonb, rol = ${rol} where id = ${id} and org_id = ${orgId}`);
    } else if (permisos) {
        await withOrgTx(orgId, sql`update org_members set permisos = ${JSON.stringify(permisos)}::jsonb, rol = 'miembro' where id = ${id} and org_id = ${orgId}`);
    } else if (rol) {
        const p = cleanPermisos(PRESETS[rol]?.permisos);
        await withOrgTx(orgId, sql`update org_members set rol = ${rol}, permisos = ${JSON.stringify(p)}::jsonb where id = ${id} and org_id = ${orgId}`);
    } else {
        return json({ error: 'Nada que actualizar' }, 400);
    }

    await logAudit(orgId, { accion: 'equipo.actualizado', entidad: 'miembro', entidad_id: id, detalle: rol ?? 'permisos', ip: reqIp(request) });
    return json({ ok: true });
};

export const DELETE: APIRoute = async (context) => {
    const { request } = context;
    const denied = await requirePerm('equipo');
    if (denied) return denied;

    const orgId = await getActiveOrgId();
    let body: any;
    try { body = await request.json(); } catch { return json({ error: 'JSON inválido' }, 400); }
    const id = String(body.id ?? '');
    if (!id) return json({ error: 'Falta el miembro' }, 400);

    const [rows] = await withOrgTx(orgId, sql`select m.rol
                           from org_members m join orgs o on o.id = m.org_id
                           where m.id = ${id} and m.org_id = ${orgId}`);
    if (!rows.length) return json({ error: 'Miembro no encontrado' }, 404);
    if (rows[0].rol === 'owner') return json({ error: 'No puedes quitar al dueño de la organización.' }, 409);

    await withOrgTx(orgId, sql`update org_members set estado = 'revocado', user_id = null where id = ${id} and org_id = ${orgId}`);
    await logAudit(orgId, { accion: 'equipo.revocado', entidad: 'miembro', entidad_id: id, ip: reqIp(request) });
    return json({ ok: true });
};

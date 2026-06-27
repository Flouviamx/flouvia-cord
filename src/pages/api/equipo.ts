// /api/equipo — gestión de miembros de la org (requiere permiso 'equipo').
//   POST   { email?, nombre?, preset } | { permisos }   → crea invitación (token + link)
//   PATCH  { id, rol?, permisos? }                       → actualiza rol/permisos de un miembro
//   DELETE { id }                                        → revoca a un miembro (no al owner)
// El owner siempre tiene permiso 'equipo'. Todo se valida server-side.
export const prerender = false;

import type { APIRoute } from 'astro';
import { clerkClient } from '@clerk/astro/server';
import { sql, getActiveOrgId, logAudit, reqIp, withOrgTx } from '../../lib/db';
import { currentUserId } from '../../lib/context';
import { requirePerm } from '../../lib/queries';
import { PRESETS, ALL_PERM_KEYS, planTieneEquipo, type PermMap } from '../../lib/permissions';

const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

// Nuestro preset → rol coarse de Clerk (Clerk solo modela admin/member por
// defecto; los permisos finos los aplica el webhook como preset y el owner los
// afina después en Ajustes › Equipo).
const clerkRoleFor = (preset: string) => (preset === 'admin' ? 'org:admin' : 'org:member');

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
    const [[org]] = await withOrgTx(orgId, sql`select coalesce(plan,'free') as plan, invite_domains, clerk_org_id from orgs where id = ${orgId}`);
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

    // ── Carril Clerk Organizations: la org ya vive en Clerk → mandamos la
    //    invitación POR CORREO (Clerk envía el email). Al aceptar, el webhook
    //    organizationMembership.created crea la fila en org_members con el preset
    //    del rol; el owner afina los permisos finos después en Ajustes › Equipo.
    const clerkOrgId = org.clerk_org_id as string | null;
    if (clerkOrgId) {
        if (!email) return json({ error: 'Escribe el correo de la persona a invitar.' }, 400);
        try {
            const clerk = clerkClient(context);
            await clerk.organizations.createOrganizationInvitation({
                organizationId: clerkOrgId,
                inviterUserId: currentUserId()!,
                emailAddress: email,
                role: clerkRoleFor(preset),
                redirectUrl: `${new URL(request.url).origin}/app`,
            });
            await logAudit(orgId, { accion: 'equipo.invitado', entidad: 'miembro', detalle: `${email} (correo Clerk)`, ip: reqIp(request) });
            return json({ ok: true, emailed: true });
        } catch (e: any) {
            const msg = String(e?.errors?.[0]?.message || e?.message || 'No se pudo enviar la invitación');
            return json({ error: msg }, 422);
        }
    }

    // ── Fallback legacy (org aún sin clerk_org_id, ej. antes del backfill):
    //    invitación por TOKEN/LINK como antes.
    const permisos = body.permisos ? cleanPermisos(body.permisos)
        : cleanPermisos(PRESETS[preset]?.permisos ?? PRESETS.vendedor.permisos);
    const rol = PRESETS[preset] ? preset : 'miembro';
    const token = crypto.randomUUID().replace(/-/g, '');

    const [[row]] = await withOrgTx(orgId, sql`
        insert into org_members (org_id, email, nombre, rol, permisos, estado, token, invited_by)
        values (${orgId}, ${email}, ${nombre}, ${rol}, ${JSON.stringify(permisos)}::jsonb, 'invitado', ${token}, ${currentUserId()})
        returning id`);

    await logAudit(orgId, { accion: 'equipo.invitado', entidad: 'miembro', entidad_id: row.id, detalle: email ?? 'invitación por link', ip: reqIp(request) });
    const link = `${new URL(request.url).origin}/unirse/${token}`;
    return json({ ok: true, id: row.id, token, link });
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

    const [rows] = await withOrgTx(orgId, sql`select m.rol, m.clerk_user_id, o.clerk_org_id
                           from org_members m join orgs o on o.id = m.org_id
                           where m.id = ${id} and m.org_id = ${orgId}`);
    if (!rows.length) return json({ error: 'Miembro no encontrado' }, 404);
    if (rows[0].rol === 'owner') return json({ error: 'No puedes quitar al dueño de la organización.' }, 409);

    // Si es un miembro de Clerk Organizations, lo quitamos también de Clerk; el
    // webhook organizationMembership.deleted marcará 'revocado' en Neon.
    const clerkOrgId = rows[0].clerk_org_id as string | null;
    const memberUserId = rows[0].clerk_user_id as string | null;
    if (clerkOrgId && memberUserId) {
        try {
            const clerk = clerkClient(context);
            await clerk.organizations.deleteOrganizationMembership({ organizationId: clerkOrgId, userId: memberUserId });
        } catch (e: any) {
            // best-effort: si Clerk falla, revocamos local de todos modos abajo.
            console.error('[equipo] no se pudo quitar de Clerk:', e?.message);
        }
    }

    await withOrgTx(orgId, sql`update org_members set estado = 'revocado', clerk_user_id = null where id = ${id} and org_id = ${orgId}`);
    await logAudit(orgId, { accion: 'equipo.revocado', entidad: 'miembro', entidad_id: id, ip: reqIp(request) });
    return json({ ok: true });
};

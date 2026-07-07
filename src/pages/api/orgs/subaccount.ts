// /api/orgs/subaccount — Ligar una organización recién creada como sub-cuenta
export const prerender = false;

import type { APIRoute } from 'astro';
import { clerkClient } from '@clerk/astro/server';
import { sql } from '../../../lib/db';
import { currentUserId } from '../../../lib/context';

const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

export const POST: APIRoute = async (context) => {
    const { request } = context;
    const userId = currentUserId();
    
    if (!userId) {
        return json({ error: 'No autorizado' }, 401);
    }

    let body: any;
    try { body = await request.json(); } catch { return json({ error: 'JSON inválido' }, 400); }
    
    const childOrgId = body.childOrgId;
    const parentOrgId = body.parentOrgId;

    if (!childOrgId || !parentOrgId) {
        return json({ error: 'childOrgId y parentOrgId son requeridos' }, 400);
    }

    // Validar que el usuario sea miembro de la organización padre en la base de datos.
    // Ojo: el driver de Neon (sql``) devuelve un ARRAY de filas — NO destructurar
    // como `const [rows]` (eso agarra la primera fila y `.length` sería undefined).
    const rows = await sql`
        select m.rol
        from org_members m
        join orgs o on o.id = m.org_id
        where o.clerk_org_id = ${parentOrgId}
          and m.clerk_user_id = ${userId}
          and m.estado = 'activo'
        limit 1
    `;

    if (!rows.length) {
        return json({ error: 'No tienes acceso a la organización padre o no existe.' }, 403);
    }

    // Actualizar la sub-cuenta en Clerk con el parentOrgId
    try {
        const clerk = clerkClient(context);
        await clerk.organizations.updateOrganization({
            organizationId: childOrgId,
            publicMetadata: { parentOrgId }
        });
        
        return json({ ok: true });
    } catch (e: any) {
        const msg = String(e?.errors?.[0]?.message || e?.message || 'Error al ligar la sub-cuenta');
        return json({ error: msg }, 500);
    }
};

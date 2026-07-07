// POST /api/clerk/webhook
// Recibe eventos de Clerk verificados con HMAC-SHA256 vía la cabecera Svix.
// Requiere CLERK_WEBHOOK_SECRET en las env vars.
//
// Configurar en: Clerk Dashboard → Webhooks → Add endpoint
//   URL: https://cord.flouvia.com/api/clerk/webhook
//   Eventos:
//     • user.created, user.deleted
//     • organization.created, organization.updated, organization.deleted
//     • organizationMembership.created, .updated, .deleted
//
// Modo híbrido (jun 2026): Clerk Organizations es la fuente de verdad de la
// IDENTIDAD de org/membresía; este webhook la sincroniza hacia Neon (orgs +
// org_members), que conserva los DATOS, RLS, billing y los permisos granulares.

export const prerender = false;

import type { APIRoute } from 'astro';
import { sql } from '../../../lib/db';
import { reportUsage } from '../../../lib/billing';
import { allPerms, PRESETS } from '../../../lib/permissions';
import { seedDemoData } from '../../../lib/onboarding';

// Mapea el rol coarse de Clerk (org:admin | org:member) a nuestro rol/preset.
// El owner se marca por separado (created_by de organization.created) y NUNCA se
// degrada aquí.
function rolFromClerk(role: string | undefined): 'admin' | 'vendedor' {
    return role === 'org:admin' ? 'admin' : 'vendedor';
}
function presetPermisos(rol: 'admin' | 'vendedor') {
    return rol === 'admin' ? allPerms(true) : (PRESETS.vendedor.permisos ?? {});
}

// Upsert idempotente de la org por clerk_org_id → devuelve el UUID interno.
async function upsertOrg(clerkOrgId: string, nombre: string | undefined): Promise<string> {
    const [row] = await sql`
        insert into orgs (clerk_org_id, nombre)
        values (${clerkOrgId}, ${nombre || 'Mi negocio'})
        on conflict (clerk_org_id) do update set clerk_org_id = excluded.clerk_org_id
        returning id`;
    return row.id as string;
}

async function verifyClerkWebhook(request: Request, secret: string): Promise<any> {
    const svixId = request.headers.get('svix-id');
    const svixTimestamp = request.headers.get('svix-timestamp');
    const svixSignature = request.headers.get('svix-signature');

    if (!svixId || !svixTimestamp || !svixSignature) {
        throw new Error('Faltan cabeceras svix');
    }

    // Svix rechaza timestamps con >5 min de diferencia (anti-replay)
    const ts = parseInt(svixTimestamp, 10);
    if (Math.abs(Date.now() / 1000 - ts) > 300) {
        throw new Error('Timestamp expirado');
    }

    const body = await request.text();
    const toSign = `${svixId}.${svixTimestamp}.${body}`;

    // El secret tiene el prefijo "whsec_" seguido de la clave en base64
    const keyBytes = Uint8Array.from(atob(secret.replace('whsec_', '')), (c) => c.charCodeAt(0));
    const key = await crypto.subtle.importKey(
        'raw', keyBytes,
        { name: 'HMAC', hash: 'SHA-256' },
        false, ['verify'],
    );
    const msgBuffer = new TextEncoder().encode(toSign);

    // svix-signature puede contener múltiples firmas: "v1,sig1 v1,sig2"
    for (const sig of svixSignature.split(' ')) {
        const [version, b64] = sig.split(',');
        if (version !== 'v1' || !b64) continue;
        const sigBytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
        const valid = await crypto.subtle.verify('HMAC', key, sigBytes, msgBuffer);
        if (valid) return JSON.parse(body);
    }
    throw new Error('Firma inválida');
}

export const POST: APIRoute = async ({ request }) => {
    const secret = import.meta.env.CLERK_WEBHOOK_SECRET || process.env.CLERK_WEBHOOK_SECRET;
    if (!secret) {
        return new Response('CLERK_WEBHOOK_SECRET no configurada', { status: 500 });
    }

    let event: { type: string; data: Record<string, any> };
    try {
        event = await verifyClerkWebhook(request.clone(), secret);
    } catch (e: any) {
        console.error('[clerk/webhook] verificación fallida:', e.message);
        return new Response('Firma inválida', { status: 401 });
    }

    const { type, data } = event;

    // ── user.created: pre-crear la org en Neon ───────────────────────────────
    // getActiveOrgId() ya lo hace en el primer login, pero hacerlo aquí acelera
    // la primera carga del dashboard (la org ya existe cuando llegan a /app).
    if (type === 'user.created') {
        const userId = data.id as string;
        await sql`
            insert into orgs (clerk_user_id, nombre)
            values (${userId}, ${'Mi negocio'})
            on conflict (clerk_user_id) do nothing`;
    }

    // ── user.deleted: anonimizar datos (no borrar — compliance) ─────────────
    if (type === 'user.deleted') {
        const userId = data.id as string;
        await sql`
            update orgs
            set nombre = '[cuenta eliminada]', rfc = null, logo_url = null
            where clerk_user_id = ${userId}`;
    }

    // ── organization.created/updated: upsert de la org en Neon ──────────────
    if (type === 'organization.created' || type === 'organization.updated') {
        const orgId = await upsertOrg(data.id as string, data.name as string | undefined);
        
        const parentClerkOrgId = data.public_metadata?.parentOrgId as string | undefined;
        if (parentClerkOrgId) {
            await sql`
                update orgs
                set parent_org_id = (select id from orgs where clerk_org_id = ${parentClerkOrgId} limit 1)
                where id = ${orgId}
            `;
        }

        // En 'created', el creador queda como miembro 'owner' (override total).
        if (type === 'organization.created' && data.created_by) {
            await sql`
                insert into org_members (org_id, clerk_user_id, rol, permisos, estado, joined_at)
                values (${orgId}, ${data.created_by}, 'owner', '{}'::jsonb, 'activo', now())
                on conflict (org_id, clerk_user_id) where clerk_user_id is not null
                do update set rol = 'owner', estado = 'activo'`;
            
            // Sembrar datos de demostración (Onboarding con cotización de ejemplo)
            await seedDemoData(orgId, data.created_by);
        }
    }

    // ── organization.deleted: revocar membresías (conservamos los datos) ────
    if (type === 'organization.deleted') {
        const rows = await sql`select id from orgs where clerk_org_id = ${data.id} limit 1`;
        if (rows.length) {
            await sql`update org_members set estado = 'revocado' where org_id = ${rows[0].id}`;
        }
    }

    // ── organizationMembership.created: alta de miembro ─────────────────────
    if (type === 'organizationMembership.created') {
        const clerkOrgId = data.organization?.id as string;
        const pud = data.public_user_data ?? {};
        const memberUserId = pud.user_id as string | undefined;
        if (clerkOrgId && memberUserId) {
            const orgId = await upsertOrg(clerkOrgId, data.organization?.name);
            const email = (pud.identifier as string) ?? null;
            const nombre = [pud.first_name, pud.last_name].filter(Boolean).join(' ') || null;
            const rol = rolFromClerk(data.role);
            const permisos = presetPermisos(rol);

            // ¿Ya existe (owner sembrado, o reintento del webhook)? No degradar owner
            // ni recontar el usuario para billing.
            const existing = await sql`select rol, estado from org_members where org_id = ${orgId} and clerk_user_id = ${memberUserId} limit 1`;
            if (existing.length) {
                const keepOwner = existing[0].rol === 'owner';
                await sql`update org_members set
                            email = ${email}, nombre = ${nombre}, estado = 'activo',
                            rol = ${keepOwner ? 'owner' : rol},
                            permisos = ${keepOwner ? '{}' : JSON.stringify(permisos)}::jsonb,
                            joined_at = coalesce(joined_at, now())
                          where org_id = ${orgId} and clerk_user_id = ${memberUserId}`;
            } else {
                await sql`insert into org_members (org_id, clerk_user_id, email, nombre, rol, permisos, estado, joined_at)
                          values (${orgId}, ${memberUserId}, ${email}, ${nombre}, ${rol}, ${JSON.stringify(permisos)}::jsonb, 'activo', now())`;
                // Un miembro activo más cuenta como usuario (excedente vía Stripe).
                try { await reportUsage(orgId, 'usuario', 1); } catch { /* best-effort */ }
            }
        }
    }

    // ── organizationMembership.updated: cambio de rol en Clerk ──────────────
    // Solo re-aplicamos el preset si el rol CAMBIÓ — así los permisos granulares
    // afinados en Cord (Ajustes › Equipo) sobreviven a actualizaciones de Clerk.
    if (type === 'organizationMembership.updated') {
        const clerkOrgId = data.organization?.id as string;
        const memberUserId = data.public_user_data?.user_id as string | undefined;
        if (clerkOrgId && memberUserId) {
            const orgRows = await sql`select id from orgs where clerk_org_id = ${clerkOrgId} limit 1`;
            if (orgRows.length) {
                const orgId = orgRows[0].id as string;
                const existing = await sql`select rol from org_members where org_id = ${orgId} and clerk_user_id = ${memberUserId} limit 1`;
                if (existing.length && existing[0].rol !== 'owner') {
                    const rol = rolFromClerk(data.role);
                    if (existing[0].rol !== rol) {
                        await sql`update org_members set rol = ${rol}, permisos = ${JSON.stringify(presetPermisos(rol))}::jsonb
                                  where org_id = ${orgId} and clerk_user_id = ${memberUserId}`;
                    }
                }
            }
        }
    }

    // ── organizationMembership.deleted: baja de miembro ─────────────────────
    if (type === 'organizationMembership.deleted') {
        const clerkOrgId = data.organization?.id as string;
        const memberUserId = data.public_user_data?.user_id as string | undefined;
        if (clerkOrgId && memberUserId) {
            await sql`
                update org_members set estado = 'revocado', clerk_user_id = null
                where clerk_user_id = ${memberUserId}
                  and org_id = (select id from orgs where clerk_org_id = ${clerkOrgId} limit 1)
                  and rol <> 'owner'`;
        }
    }

    return new Response('ok', { status: 200 });
};

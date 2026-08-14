// Fuente única para decidir qué actividad pertenece al equipo interno de Cord.
// La allowlist vive en ops-auth; analítica solo traduce esas dos identidades a
// workspaces para que también queden fuera los links públicos y eventos backend.
import { sql } from './db';
import { OPS_ALLOWED_EMAILS } from './ops-auth';

const CACHE_TTL_MS = 5 * 60 * 1000;
const orgCache = new Map<string, { internal: boolean; expiresAt: number }>();

/**
 * Una org es interna cuando su dueño o un miembro activo pertenece a la
 * allowlist de Ops. Para sandboxes se evalúa la org padre, que es la identidad
 * comercial real. Los fallos de esta consulta nunca deben romper el producto:
 * degradan a captura normal y quedan visibles en los logs de servidor.
 */
export async function isInternalAnalyticsOrg(orgId: string): Promise<boolean> {
    if (!orgId) return false;
    const cached = orgCache.get(orgId);
    if (cached && cached.expiresAt > Date.now()) return cached.internal;

    try {
        const [row] = await sql`
            with target as (
                select coalesce(sandbox_of, id) as id
                from orgs
                where id = ${orgId}
                limit 1
            )
            select (
                exists (
                    select 1
                    from target t
                    join orgs o on o.id = t.id
                    join users u on u.id = o.owner_id
                    where lower(u.email) = any(${[...OPS_ALLOWED_EMAILS]}::text[])
                )
                or exists (
                    select 1
                    from target t
                    join org_members m on m.org_id = t.id and m.estado = 'activo'
                    join users u on u.id = m.user_id
                    where lower(u.email) = any(${[...OPS_ALLOWED_EMAILS]}::text[])
                )
            ) as internal`;
        const internal = !!row?.internal;
        orgCache.set(orgId, { internal, expiresAt: Date.now() + CACHE_TTL_MS });
        return internal;
    } catch (error) {
        console.error('[analytics] No se pudo resolver si la organización es interna', error);
        return false;
    }
}


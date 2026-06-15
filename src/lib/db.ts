// src/lib/db.ts
// Cliente de Neon (PostgreSQL serverless). Una sola conexión HTTP por request —
// ideal para el modelo serverless de Vercel (sin pool persistente).
//
// El `sql` es un tagged-template: sql`select * from orgs where id = ${id}`
// parametriza automáticamente (a prueba de inyección). Para queries dinámicas
// usar sql.query('... $1 ...', [params]).

import { neon } from '@neondatabase/serverless';
import { currentUserId, currentOrgIdOverride } from './context';

const url = import.meta.env.DATABASE_URL || process.env.DATABASE_URL;

if (!url) {
    // No tiramos en build (las páginas SSR sólo tocan la DB en runtime), pero
    // dejamos un error claro si alguna query corre sin la variable.
    console.warn('[db] DATABASE_URL no está definida — las queries fallarán en runtime.');
}

export const sql = neon(url || 'postgres://invalid');

// ── Tenancy seam ──────────────────────────────────────────────────────────
// Resuelve el org_id desde la sesión de Clerk (userId → orgs.clerk_user_id). La
// org se CREA en el primer login (lazy, upsert idempotente). Si no hay sesión
// (contextos sin auth: cron, o llamadas previas a la migración), cae a la org
// demo para no romper. Las rutas /app y las APIs internas SIEMPRE traen sesión
// (protegidas en el middleware).
export const DEMO_CLERK_USER_ID = 'demo-user';

async function demoOrgId(): Promise<string> {
    const rows = await sql`select id from orgs where clerk_user_id = ${DEMO_CLERK_USER_ID} limit 1`;
    if (!rows.length) throw new Error('[db] org demo no encontrada — ¿corriste la migración (npm run db:migrate)?');
    return rows[0].id as string;
}

// Siembra (idempotente) la membresía 'owner' del dueño de una org. Try/catch:
// nunca debe romper la resolución si la tabla aún no existe (pre-migración).
async function ensureOwnerMember(orgId: string, userId: string): Promise<void> {
    try {
        await sql`
            insert into org_members (org_id, clerk_user_id, rol, estado, joined_at)
            values (${orgId}, ${userId}, 'owner', 'activo', now())
            on conflict (org_id, clerk_user_id) where clerk_user_id is not null do nothing`;
    } catch { /* tabla aún no migrada → no-op */ }
}

export async function getActiveOrgId(): Promise<string> {
    // 0) Carril máquina-a-máquina: si la request entró por API key, el middleware
    //    de la ruta /api/v1 ya resolvió y guardó el org_id. Es la verdad absoluta.
    const orgOverride = currentOrgIdOverride();
    if (orgOverride) return orgOverride;

    const userId = currentUserId();
    if (!userId) return demoOrgId(); // sin sesión (cron, etc.) → org demo

    // 1) ¿Es miembro ACTIVO de alguna org? (incluye al owner, sembrado como miembro).
    //    Orden: membresía más reciente primero — un invitado que se une después
    //    cae en la org a la que lo invitaron. Resiliente si la tabla no existe.
    try {
        const mem = await sql`
            select org_id from org_members
            where clerk_user_id = ${userId} and estado = 'activo'
            order by joined_at desc nulls last, created_at desc
            limit 1`;
        if (mem.length) return mem[0].org_id as string;
    } catch { /* tabla aún no migrada → seguimos con la lógica legacy */ }

    // 2) ¿Tiene una org propia (creada antes de Equipo)? → sembrar su membresía owner.
    const rows = await sql`select id from orgs where clerk_user_id = ${userId} limit 1`;
    if (rows.length) {
        await ensureOwnerMember(rows[0].id as string, userId);
        return rows[0].id as string;
    }

    // 3) Primer login: crear la org. El upsert (do update no-op) hace que `returning`
    //    devuelva la fila aunque dos requests concurrentes intenten crearla a la vez.
    const [created] = await sql`
        insert into orgs (clerk_user_id, nombre)
        values (${userId}, ${'Mi negocio'})
        on conflict (clerk_user_id) do update set clerk_user_id = excluded.clerk_user_id
        returning id`;
    await ensureOwnerMember(created.id as string, userId);
    return created.id as string;
}

// ── Audit log inmutable ──────────────────────────────────────────────────────
// Registra un evento en audit_log. Envuelto en try/catch: la auditoría nunca debe
// romper la operación principal (ni antes de correr la migración).
interface AuditEvent { accion: string; entidad?: string; entidad_id?: string; detalle?: string; ip?: string | null; }
export async function logAudit(orgId: string, e: AuditEvent): Promise<void> {
    try {
        await sql`insert into audit_log (org_id, actor, accion, entidad, entidad_id, detalle, ip)
                  values (${orgId}, ${currentUserId() ?? DEMO_CLERK_USER_ID}, ${e.accion}, ${e.entidad ?? null}, ${e.entidad_id ?? null}, ${e.detalle ?? null}, ${e.ip ?? null})`;
    } catch { /* no-op: no romper la operación por fallo de auditoría */ }
}

// Extrae la IP del request (Vercel/Proxy → x-forwarded-for).
export function reqIp(request: Request): string {
    return (request.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'desconocida';
}

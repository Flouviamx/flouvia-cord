// src/lib/db.ts
// Cliente de Neon (PostgreSQL serverless). Una sola conexión HTTP por request —
// ideal para el modelo serverless de Vercel (sin pool persistente).
//
// El `sql` es un tagged-template: sql`select * from orgs where id = ${id}`
// parametriza automáticamente (a prueba de inyección). Para queries dinámicas
// usar sql.query('... $1 ...', [params]).

import { neon } from '@neondatabase/serverless';
import { currentUserId, currentOrgIdOverride, currentClerkOrgId, memoizedOrgId, memoizeOrgId, isTestModeRequest } from './context';

const url = import.meta.env.DATABASE_URL || process.env.DATABASE_URL;

if (!url) {
    // No tiramos en build (las páginas SSR sólo tocan la DB en runtime), pero
    // dejamos un error claro si alguna query corre sin la variable.
    console.warn('[db] DATABASE_URL no está definida — las queries fallarán en runtime.');
} else if (!/-pooler\./.test(url)) {
    // El driver HTTP abre una conexión por query. Sin el endpoint POOLED de Neon
    // (host con "-pooler"), un pico de concurrencia agota las conexiones directas
    // y la app tira 500s. Es la causa #1 de caídas al pasar de 1 a miles de users.
    console.warn('[db] DATABASE_URL NO usa el endpoint pooled de Neon (host sin "-pooler"). Bajo carga concurrente puede agotar las conexiones directas de Neon. Usa el connection string "Pooled" del dashboard de Neon.');
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
    //    de la ruta /api/v1 ya resolvió y guardó el org_id. Es la verdad absoluta
    //    (las llaves sk_test_ ya llegan aquí con la org sandbox resuelta).
    const orgOverride = currentOrgIdOverride();
    if (orgOverride) return orgOverride;

    // 0.1) Memo por-request: la resolución es idéntica durante todo el request
    //      (misma sesión/org activa). Un render de dashboard llama esto ~8-9 veces;
    //      resolverlo una sola vez ahorra ~8 round-trips a Neon por página.
    const memo = memoizedOrgId();
    if (memo) return memo;

    let resolved = await resolveOrgId();

    // 0.9) ENTORNO DE PRUEBA (cookie cord_test_mode): en vez de la org real se
    //      resuelve su org SANDBOX espejo — datos 100% aislados, tipo Stripe.
    //      Si la resolución del sandbox falla NO caemos a la org real: escribir
    //      datos de prueba en producción sería peor que un error visible.
    if (isTestModeRequest()) {
        resolved = await resolveSandboxOrgId(resolved);
    }

    memoizeOrgId(resolved);
    return resolved;
}

/**
 * Devuelve el id de la org SANDBOX espejo de `parentId` (creándola la primera
 * vez, con un snapshot de la marca/config del padre + datos de ejemplo). Si
 * `parentId` ya ES una sandbox, se devuelve tal cual (no se anidan sandboxes).
 */
export async function resolveSandboxOrgId(parentId: string): Promise<string> {
    let rows: any[];
    try {
        rows = await sql`select id, sandbox_of, (select s.id from orgs s where s.sandbox_of = orgs.id limit 1) as sandbox_id
                         from orgs where id = ${parentId} limit 1`;
    } catch {
        throw new Error('[db] No se pudo resolver el entorno de prueba — ¿corriste la migración (npm run db:migrate)?');
    }
    if (!rows.length) return parentId; // org inexistente: deja que el flujo normal falle
    if (rows[0].sandbox_of) return parentId;          // ya es una sandbox
    if (rows[0].sandbox_id) return rows[0].sandbox_id as string; // ya existe

    // Primera vez: crear la sandbox copiando el snapshot de marca/config del padre.
    // El índice único parcial (sandbox_of) hace el insert idempotente ante carreras.
    const [created] = await sql`
        insert into orgs (sandbox_of, nombre, logo_url, color_marca, quote_prefix, plan,
                          country_code, iva_pct, vigencia_default_dias, terminos_default,
                          pdf_template, pdf_mensaje, pdf_condiciones, portal_bienvenida,
                          email_from_name, iva_incluido_defecto)
        select id, nombre, logo_url, color_marca, quote_prefix, plan,
               country_code, iva_pct, vigencia_default_dias, terminos_default,
               pdf_template, pdf_mensaje, pdf_condiciones, portal_bienvenida,
               email_from_name, iva_incluido_defecto
        from orgs where id = ${parentId}
        on conflict (sandbox_of) where sandbox_of is not null
        do update set sandbox_of = excluded.sandbox_of
        returning id`;
    const sandboxId = created.id as string;

    // Sembrar datos de ejemplo (best-effort): que el modo prueba no arranque vacío.
    try {
        const { seedDemoData } = await import('./onboarding');
        await seedDemoData(sandboxId, currentUserId() ?? 'sandbox');
    } catch { /* la sandbox funciona igual sin seed */ }

    return sandboxId;
}

async function resolveOrgId(): Promise<string> {
    const userId = currentUserId();
    if (!userId) return demoOrgId(); // sin sesión (cron, etc.) → org demo

    // 0.5) Org ACTIVA de Clerk Organizations (modo híbrido): si la sesión tiene una
    //      org seleccionada en el switcher, ESA manda. La mapeamos al UUID interno
    //      por clerk_org_id. Si la fila aún no existe (el webhook organization.created
    //      no ha llegado), la creamos al vuelo y sembramos la membresía del usuario
    //      activo — el webhook reconciliará nombre y rol enseguida.
    const clerkOrgId = currentClerkOrgId();
    if (clerkOrgId) {
        try {
            const found = await sql`select id from orgs where clerk_org_id = ${clerkOrgId} limit 1`;
            if (found.length) return found[0].id as string;
            const [created] = await sql`
                insert into orgs (clerk_org_id, nombre)
                values (${clerkOrgId}, ${'Mi negocio'})
                on conflict (clerk_org_id) do update set clerk_org_id = excluded.clerk_org_id
                returning id`;
            await ensureOwnerMember(created.id as string, userId);
            return created.id as string;
        } catch { /* si algo falla, caemos al carril legacy de abajo */ }
    }

    // 1) ¿Es miembro ACTIVO de alguna org? (incluye al owner, sembrado como miembro).
    //    Orden: membresía más reciente primero — un invitado que se une después
    //    cae en la org a la que lo invitaron. Resiliente si la tabla no existe.
    //    ⚠️ Se EXCLUYEN las orgs sandbox (sandbox_of no nulo): una membresía ahí
    //    jamás debe capturar la sesión normal (solo se entra vía modo de prueba).
    try {
        const mem = await sql`
            select m.org_id from org_members m
            join orgs o on o.id = m.org_id and o.sandbox_of is null
            where m.clerk_user_id = ${userId} and m.estado = 'activo'
            order by m.joined_at desc nulls last, m.created_at desc
            limit 1`;
        if (mem.length) return mem[0].org_id as string;
    } catch { /* tabla/columna aún no migrada → seguimos con la lógica legacy */ }

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
interface AuditEvent { accion: string; entidad?: string; entidad_id?: string; detalle?: string; ip?: string | null; actor?: string }
export async function logAudit(orgId: string, e: AuditEvent): Promise<void> {
    try {
        const actor = e.actor ?? currentUserId() ?? DEMO_CLERK_USER_ID;
        await sql`insert into audit_log (org_id, actor, accion, entidad, entidad_id, detalle, ip)
                  values (${orgId}, ${actor}, ${e.accion}, ${e.entidad ?? null}, ${e.entidad_id ?? null}, ${e.detalle ?? null}, ${e.ip ?? null})`;
    } catch { /* no-op: no romper la operación por fallo de auditoría */ }
}

// Extrae la IP del request (Vercel/Proxy → x-forwarded-for).
export function reqIp(request: Request): string {
    return (request.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'desconocida';
}

// ── RLS batch helpers ────────────────────────────────────────────────────────
// Ejecutan queries en una sola transacción HTTP de Neon con app.org_id seteado.
// Esto satisface las políticas RLS sin modificar cada query individualmente.
//
// Ventaja extra: los N queries de cada función viajan en UNA sola request HTTP
// (en vez de N roundtrips independientes), reduciendo latencia en producción.
//
// Uso:
//   const [rows] = await withOrgTx(orgId, sql`SELECT ...`);
//   const [a, b, c] = await withOrgTx(orgId, sql`...`, sql`...`, sql`...`);
//   const [rows] = await withPublicToken(token, sql`SELECT ... WHERE public_token = ${token}`);
export async function withOrgTx(orgId: string, ...queries: any[]): Promise<any[][]> {
    const results = await (sql as any).transaction([
        sql`select set_config('app.org_id', ${orgId}, true)`,
        ...queries,
    ]);
    return (results as any[][]).slice(1);
}

// Igual que withOrgTx pero setea app.public_token para las páginas /q/[token].
export async function withPublicToken(token: string, ...queries: any[]): Promise<any[][]> {
    const results = await (sql as any).transaction([
        sql`select set_config('app.public_token', ${token}, true)`,
        ...queries,
    ]);
    return (results as any[][]).slice(1);
}

// src/lib/db.ts
// Cliente de Neon (PostgreSQL serverless). Una sola conexión HTTP por request —
// ideal para el modelo serverless de Vercel (sin pool persistente).
//
// El `sql` es un tagged-template: sql`select * from orgs where id = ${id}`
// parametriza automáticamente (a prueba de inyección). Para queries dinámicas
// usar sql.query('... $1 ...', [params]).

import { neon } from '@neondatabase/serverless';
import { currentUserId, currentOrgIdOverride, currentActiveOrgId, memoizedOrgId, memoizeOrgId, isTestModeRequest, isCronScope } from './context';

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
// Resuelve el org_id desde la sesión actual (userId → orgs.owner_id). La
// org se CREA en el primer login (lazy, upsert idempotente). Si no hay sesión
// Contextos sin auth: cron, o llamadas previas a la migración
// Cae a la org demo para no romper. Las rutas /app y las APIs internas SIEMPRE traen sesión
// (protegidas en el middleware).

async function demoOrgId(): Promise<string> {
    const rows = await sql`select id from orgs where rfc = 'FERR010203XYZ' limit 1`;
    if (!rows.length) throw new Error('[db] org demo no encontrada — ¿corriste la migración (npm run db:migrate)?');
    return rows[0].id as string;
}

// Siembra (idempotente) la membresía 'owner' del dueño de una org. Try/catch:
// nunca debe romper la resolución si la tabla aún no existe (pre-migración).
async function ensureOwnerMember(orgId: string, userId: string): Promise<void> {
    try {
        await sql`
            insert into org_members (org_id, user_id, rol, estado, joined_at)
            values (${orgId}, ${userId}, 'owner', 'activo', now())
            on conflict (org_id, user_id) where user_id is not null do nothing`;
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
 * Los dos gates de entrada a /app que el middleware puede necesitar aplicar,
 * resueltos en UNA sola query (antes eran dos selects separados si se
 * hubiera agregado el de onboarding aparte del de 2FA).
 *
 * - `needs2fa`: la org activa exige 2FA (`orgs.require_2fa`, configurable
 *   desde Ajustes › Seguridad desde jul 2026) y el usuario no tiene TOTP
 *   activo. Bloquea a CUALQUIER miembro de la org, no solo al dueño.
 * - `needsOnboarding`: la org todavía no tiene `onboarded_at` (nunca pasó
 *   por el wizard de /onboarding) — y SOLO se exige al dueño
 *   (`orgs.owner_id`). Un miembro invitado a una org ajena sin
 *   `onboarded_at` no debe terminar configurando el negocio de otra
 *   persona; el dueño es quien completa el wizard.
 */
export async function getAppGates(userId: string): Promise<{ needs2fa: boolean; needsOnboarding: boolean }> {
    const NONE = { needs2fa: false, needsOnboarding: false };
    try {
        const orgId = await getActiveOrgId();
        const rows = await sql`
            select o.require_2fa, o.onboarded_at, o.owner_id, u.totp_enabled
            from orgs o cross join users u
            where o.id = ${orgId} and u.id = ${userId}
            limit 1`;
        if (!rows.length) return NONE;
        const r = rows[0] as any;
        return {
            needs2fa: !!r.require_2fa && !r.totp_enabled,
            needsOnboarding: r.owner_id === userId && !r.onboarded_at,
        };
    } catch {
        // Nunca bloquear /app por un fallo de esta verificación best-effort.
        return NONE;
    }
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

    // 0) Org ACTIVA elegida por el usuario (cookie cord_active_org, ver
    //    CustomOrgSwitcher → handleSwitch). SOLO se honra si el usuario es
    //    miembro ACTIVO de esa org — nunca se confía en el valor de la cookie
    //    a secas. Sin esta verificación, poner cualquier UUID de otra org en
    //    la cookie (algo que el propio navegador del usuario permite editar)
    //    resolvería `getActiveOrgId()` a un negocio ajeno → fuga cross-tenant
    //    total. También se excluyen sandboxes (mismo criterio que el resto).
    const activeChoice = currentActiveOrgId();
    if (activeChoice) {
        try {
            const chosen = await sql`
                select m.org_id from org_members m
                join orgs o on o.id = m.org_id and o.sandbox_of is null
                where m.org_id = ${activeChoice} and m.user_id = ${userId} and m.estado = 'activo'
                limit 1`;
            if (chosen.length) return chosen[0].org_id as string;
        } catch { /* tabla/columna aún no migrada → seguimos con la lógica legacy */ }
        // La cookie apunta a una org de la que el usuario NO es miembro activo
        // (ajena, revocada, o un valor manipulado) — se ignora en silencio y
        // se cae al resto de la resolución, nunca se usa tal cual.
    }

    // 1) ¿Es miembro ACTIVO de alguna org?
    //    Orden: membresía más reciente primero — un invitado que se une después
    //    cae en la org a la que lo invitaron. Resiliente si la tabla no existe.
    //    ⚠️ Se EXCLUYEN las orgs sandbox (sandbox_of no nulo): una membresía ahí
    //    jamás debe capturar la sesión normal (solo se entra vía modo de prueba).
    try {
        const mem = await sql`
            select m.org_id from org_members m
            join orgs o on o.id = m.org_id and o.sandbox_of is null
            where m.user_id = ${userId} and m.estado = 'activo'
            order by m.joined_at desc nulls last, m.created_at desc
            limit 1`;
        if (mem.length) return mem[0].org_id as string;
    } catch { /* tabla/columna aún no migrada → seguimos con la lógica legacy */ }

    // 2) ¿Tiene una org propia (creada antes de Equipo)? → sembrar su membresía owner.
    const rows = await sql`select id from orgs where owner_id = ${userId} limit 1`;
    if (rows.length) {
        await ensureOwnerMember(rows[0].id as string, userId);
        return rows[0].id as string;
    }

    // 3) Primer login: crear la org.
    const [created] = await sql`
        insert into orgs (owner_id, nombre)
        values (${userId}, ${'Mi negocio'})
        returning id`;
    await ensureOwnerMember(created.id as string, userId);
    return created.id as string;
}

// ── Audit log inmutable ──────────────────────────────────────────────────────
// Registra un evento en audit_log. Envuelto en try/catch: la auditoría nunca debe
// romper la operación principal (ni antes de correr la migración).
interface AuditEvent { accion: string; entidad?: string; entidad_id?: string; detalle?: string; ip?: string | null; actor?: string; userAgent?: string | null }
export async function logAudit(orgId: string, e: AuditEvent): Promise<void> {
    try {
        // `DEMO_USER_ID` no existe en este archivo — ese identificador nunca se
        // definió/importó, así que la resolución de actor lanzaba un
        // ReferenceError silenciado por el catch: CUALQUIER auditoría sin actor
        // explícito y sin sesión (crons, contextos anónimos) se perdía sin dejar
        // rastro. 'system' es un valor honesto para esos casos.
        const actor = e.actor ?? currentUserId() ?? 'system';
        await sql`insert into audit_log (org_id, actor, accion, entidad, entidad_id, detalle, ip, user_agent)
                  values (${orgId}, ${actor}, ${e.accion}, ${e.entidad ?? null}, ${e.entidad_id ?? null}, ${e.detalle ?? null}, ${e.ip ?? null}, ${e.userAgent ?? null})`;
    } catch { /* no-op: no romper la operación por fallo de auditoría */ }
}

// Extrae la IP del request. Delega a src/lib/ip.ts (x-real-ip/x-vercel-forwarded-for,
// no spoofeables por el cliente — x-forwarded-for solo es el último recurso).
export { trustedIp as reqIp } from './ip';

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

// ── Carril de SISTEMA (crons cross-org) ──────────────────────────────────────
// El sweeper de webhook_events (/api/cron/webhooks) reclama filas de MUCHAS
// orgs en UNA sola sentencia — no hay un org_id único que setear. Este carril
// alterno setea `app.scope='system'`, que SOLO la política RLS de
// `webhook_events` acepta (ver db/schema.sql). El set_config es LOCAL a la
// transacción, igual que withOrgTx: no se filtra a otras queries del proceso.

/** Lanza si el request actual no corre en el carril de cron (ver context.ts). */
export function assertCronContext(): void {
    if (!isCronScope()) {
        throw new Error(
            '[db] withSystemTx requiere contexto de cron (reqContext cronScope=true) — ' +
            'nunca se debe llamar desde una ruta con sesión de usuario.'
        );
    }
}

/**
 * Igual que withOrgTx pero para el trabajo cross-org del sweeper. Exige que el
 * cron ya haya marcado su reqContext con cronScope:true (assertCronContext) —
 * así una ruta de usuario normal jamás puede tocar el carril de sistema por
 * accidente, aunque alguien importe withSystemTx sin querer.
 */
export async function withSystemTx(...queries: any[]): Promise<any[][]> {
    assertCronContext();
    const results = await (sql as any).transaction([
        sql`select set_config('app.scope', 'system', true)`,
        ...queries,
    ]);
    return (results as any[][]).slice(1);
}

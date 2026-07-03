// src/lib/context.ts
// Contexto por-request (AsyncLocalStorage). El middleware de Clerk resuelve el
// userId de la sesión y lo guarda aquí, de modo que cualquier query (db.ts) pueda
// leerlo SIN tener que recibir el request explícitamente en cada función.
//
// Es seguro en el modelo serverless de Vercel (Node/Fluid): AsyncLocalStorage
// aísla el store por cadena async, incluso con instancias reutilizadas entre
// requests concurrentes.

import { AsyncLocalStorage } from 'node:async_hooks';

interface ReqCtx {
    userId: string | null;
    // Override de tenancy: cuando una request entra autenticada por API KEY
    // (máquina-a-máquina, sin sesión Clerk), guardamos aquí el org_id resuelto
    // desde la llave para que getActiveOrgId() lo use directamente.
    orgId?: string | null;
    // Org ACTIVA de Clerk Organizations (org_xxx). El middleware la toma de
    // auth().orgId; getActiveOrgId() la mapea al UUID interno (orgs.clerk_org_id).
    clerkOrgId?: string | null;
    // Memo por-request del org_id ya resuelto por getActiveOrgId(). Se llena la
    // PRIMERA vez que se resuelve y se reutiliza el resto del request para evitar
    // ~8-9 round-trips redundantes a Neon en un solo render de página. Es mutable
    // a propósito: el store de AsyncLocalStorage está aislado por request.
    resolvedOrgId?: string;
}

export const reqContext = new AsyncLocalStorage<ReqCtx>();

/** userId de Clerk de la sesión actual, o null si no hay sesión. */
export function currentUserId(): string | null {
    return reqContext.getStore()?.userId ?? null;
}

/** org_id inyectado por auth de API key (carril máquina-a-máquina), o null. */
export function currentOrgIdOverride(): string | null {
    return reqContext.getStore()?.orgId ?? null;
}

/** Org activa de Clerk Organizations (org_xxx) de la sesión, o null. */
export function currentClerkOrgId(): string | null {
    return reqContext.getStore()?.clerkOrgId ?? null;
}

/** org_id ya resuelto y memoizado para este request, o null si aún no. */
export function memoizedOrgId(): string | null {
    return reqContext.getStore()?.resolvedOrgId ?? null;
}

/** Guarda el org_id resuelto en el store del request para reutilizarlo. */
export function memoizeOrgId(orgId: string): void {
    const store = reqContext.getStore();
    if (store) store.resolvedOrgId = orgId;
}

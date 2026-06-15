// src/lib/apikey.ts
// Carril de auth MÁQUINA-A-MÁQUINA (API pública). A diferencia del resto de la
// app —que se autentica por la sesión de Clerk en el middleware— las rutas
// públicas (/api/v1/*) se autentican con una API key en el header:
//
//     Authorization: Bearer sk_live_xxxxxxxx...
//
// La key en claro NO vive en DB (solo su sha-256). Aquí la hasheamos, buscamos
// la fila viva (no revocada), validamos el scope y resolvemos su org_id. Ese
// org_id se inyecta en reqContext para que TODAS las queries existentes
// (getCotizaciones, getCobranza, …) operen sobre la org correcta sin cambios.

import { createHash } from 'node:crypto';
import type { APIRoute } from 'astro';
import { sql } from './db';
import { reqContext } from './context';
import { planTieneApi } from './permissions';
import { reportUsage } from './billing';

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

export type ApiScope = 'read' | 'write';

export type ApiMode = 'live' | 'test';

export interface ApiAuth {
    orgId: string;
    scope: ApiScope;
    mode: ApiMode;
    keyId: string;
}

function jsonError(error: string, code: string, status: number): Response {
    return new Response(JSON.stringify({ error, code }), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });
}

// Extrae el token del header Authorization: "Bearer sk_live_...".
function bearerToken(request: Request): string | null {
    const h = request.headers.get('authorization') || '';
    const m = /^Bearer\s+(.+)$/i.exec(h.trim());
    return m ? m[1].trim() : null;
}

/**
 * Autentica una request por API key. Devuelve ApiAuth si es válida, o un
 * Response de error (401/403) listo para retornar desde la ruta.
 *
 * `need` = scope requerido por el endpoint ('read' para GET, 'write' para
 * crear/editar). Una key 'write' también puede leer; una 'read' no puede escribir.
 */
export async function authApiKey(request: Request, need: ApiScope = 'read'): Promise<ApiAuth | Response> {
    const token = bearerToken(request);
    if (!token) {
        return jsonError('Falta la API key. Envíala en el header Authorization: Bearer <key>.', 'missing_key', 401);
    }

    const hash = sha256(token);

    let row: any;
    try {
        [row] = await sql`
            select k.id, k.org_id, k.scope, k.mode, k.revoked_at, coalesce(o.plan, 'free') as plan
            from api_keys k
            join orgs o on o.id = k.org_id
            where k.hash = ${hash}
            limit 1`;
    } catch {
        return jsonError('No se pudo validar la llave.', 'server_error', 500);
    }

    if (!row || row.revoked_at) {
        return jsonError('API key inválida o revocada.', 'invalid_key', 401);
    }

    const mode: ApiMode = row.mode === 'test' ? 'test' : 'live';

    // Gating por plan: SOLO las llaves en VIVO requieren plan Negocio. Las de
    // prueba (sk_test_) operan libres para que cualquiera integre antes de pagar.
    if (mode === 'live' && !planTieneApi(row.plan as string)) {
        return jsonError('Las llaves en vivo requieren el plan Negocio. Usa una llave de prueba o actualiza tu plan.', 'plan_required', 403);
    }

    const scope: ApiScope = row.scope === 'write' ? 'write' : 'read';
    if (need === 'write' && scope !== 'write') {
        return jsonError('Esta API key es de solo lectura.', 'insufficient_scope', 403);
    }

    // Marca de uso (best-effort: nunca debe romper la request).
    sql`update api_keys set last_used_at = now() where id = ${row.id}`.catch(() => {});

    return { orgId: row.org_id as string, scope, mode, keyId: row.id as string };
}

/**
 * Envuelve un handler de ruta pública para autenticarlo por API key y correrlo
 * con el org_id resuelto en el contexto (vía reqContext, sin sesión Clerk). El
 * handler recibe el contexto de Astro + el `auth` ya validado.
 *
 *   export const GET = withApiAuth('read', async (ctx, auth) => { ... });
 */
export function withApiAuth(
    need: ApiScope,
    handler: (ctx: Parameters<APIRoute>[0], auth: ApiAuth) => Response | Promise<Response>,
): APIRoute {
    return async (ctx) => {
        const auth = await authApiKey(ctx.request, need);
        if (auth instanceof Response) return auth;
        // Mide la llamada a la API pública (solo llaves en vivo se facturan).
        // Fire-and-forget: reportUsage nunca lanza y no debe frenar la respuesta.
        if (auth.mode === 'live') void reportUsage(auth.orgId, 'api', 1);
        // userId null → el carril Clerk queda inactivo; orgId manda la tenancy.
        const t0 = Date.now();
        const res = await reqContext.run({ userId: null, orgId: auth.orgId }, () => handler(ctx, auth));
        // Bitácora del request (best-effort: nunca frena ni rompe la respuesta).
        void logApiRequest(auth, ctx.request, res.status, Date.now() - t0);
        return res;
    };
}

// Registra la llamada en api_requests para el "Log de actividad" de Developers.
// Silencioso ante cualquier error (tabla no migrada, fallo de red a Neon, …).
async function logApiRequest(auth: ApiAuth, request: Request, status: number, ms: number): Promise<void> {
    try {
        const url = new URL(request.url);
        const ruta = url.pathname.replace(/^\/api/, '') || '/';
        const ip = request.headers.get('x-forwarded-for')?.split(',')[0].trim() || null;
        await sql`
            insert into api_requests (org_id, key_id, metodo, ruta, status, duracion_ms, mode, ip)
            values (${auth.orgId}, ${auth.keyId}, ${request.method}, ${ruta}, ${status}, ${ms}, ${auth.mode}, ${ip})`;
    } catch { /* no-op */ }
}

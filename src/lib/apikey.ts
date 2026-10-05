// src/lib/apikey.ts
// Carril de auth MÁQUINA-A-MÁQUINA (API pública). A diferencia del resto de la
// app —que se autentica por la sesión web en el middleware— las rutas
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
import { sql, resolveSandboxOrgId, logAudit } from './db';
import { trustedIp } from './ip';
import { restrictedKeyAllows, ipAllowed, type KeyPermissions } from './api-key-policy';
import { reqContext } from './context';
import { flushUsageReservation, reserveUsage } from './billing';
import { rateLimit, tooMany } from './ratelimit';
import { apiKeyLimit } from './permissions';
import { runIdempotent } from './api-idempotency';
import { isFirstPartyClient } from './oauth-core';
import { decorateApiResponse, newRequestId, publishableKeyAllows } from './api-cors';
import { resolveApiVersion, needsDowngrade, downgradeResponse } from './api-versions';

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

export type ApiScope = 'read' | 'write';

export type ApiMode = 'live' | 'test';
export type ApiKeyType = 'secret' | 'publishable';

export interface ApiAuth {
    orgId: string;
    scope: ApiScope;
    mode: ApiMode;
    type: ApiKeyType;
    keyId: string;
    /** Slug del cliente OAuth cuando la llave es un token de una app conectada. */
    oauthClient?: string | null;
    /** Versión de la API fijada al crear la llave; null = la versión base. */
    apiVersion?: string | null;
    /** Llave restringida (rk_): sus permisos por recurso ya se verificaron en authApiKey. */
    restricted?: boolean;
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

export { publishableKeyAllows };

export interface OriginDenied { error: string; code: string }

// Una pk_ vive en el código fuente de una página: el Origin es lo único que la
// ata al negocio. En vivo, sin allowlist no hay a qué atarla y se rechaza; en
// prueba solo toca la sandbox y se acepta desde cualquier origen.
export function publishableOriginCheck(mode: ApiMode, embedDomains: string | null | undefined, origin: string | null): OriginDenied | null {
    if (!origin) return { error: 'Origin no detectado. Las Publishable Keys requieren enviar el header Origin o Referer.', code: 'missing_origin' };
    const dominios = (embedDomains || '').split(/[\s,]+/).map((d) => d.trim()).filter(Boolean);
    if (dominios.length === 0) {
        if (mode === 'test') return null;
        return { error: 'Configura los dominios permitidos de Cord Elements antes de usar una Publishable Key en vivo.', code: 'origin_allowlist_required' };
    }
    try {
        const originHost = new URL(origin).hostname;
        const matched = dominios.some((d) => d === originHost || originHost.endsWith('.' + d.replace(/^\*\./, '')));
        return matched ? null : { error: 'Origin no autorizado para usar esta Publishable Key.', code: 'unauthorized_origin' };
    } catch {
        return { error: 'Origin inválido.', code: 'invalid_origin' };
    }
}

// Un navegador siempre manda Sec-Fetch-Site en un fetch; un servidor no. Una
// secret key que llega desde un navegador ya está expuesta en el cliente.
export function isBrowserRequest(request: Request): boolean {
    const site = request.headers.get('sec-fetch-site');
    return !!site && site !== 'none';
}

/**
 * Autentica una request por API key. Devuelve ApiAuth si es válida, o un
 * Response de error (401/403) listo para retornar desde la ruta.
 *
 * `need` = scope requerido por el endpoint ('read' para GET, 'write' para
 * crear/editar). Una key 'write' también puede leer; una 'read' no puede escribir.
 */
export async function authApiKey(request: Request, need: ApiScope = 'read'): Promise<ApiAuth | Response> {
    // Corta floods de tokens basura por IP ANTES de tocar Neon (cada intento hacía
    // un lookup de api_keys). Límite generoso: un cliente legítimo no lo alcanza.
    const ip = trustedIp(request);
    const ipRl = await rateLimit(`apiauth:${ip}`, 120, 60);
    if (!ipRl.ok) return tooMany(ipRl.retryAfter);

    const token = bearerToken(request);
    if (!token) {
        return jsonError('Falta la API key. Envíala en el header Authorization: Bearer <key>.', 'missing_key', 401);
    }

    const hash = sha256(token);

    let row: any;
    try {
        [row] = await sql`
            with ranked as (
                select k.*,
                       case when not counted then 0
                            else row_number() over (partition by k.org_id, counted order by k.created_at asc, k.id asc)::int
                       end as active_rank
                  from (select k.*, (k.oauth_client_id is null and k.replaced_by is null
                                     and (k.expires_at is null or k.expires_at > now())) as counted
                          from api_keys k
                         where k.revoked_at is null
                           and k.org_id = (select org_id from api_keys where hash = ${hash} limit 1)) k
            )
            select k.id, k.org_id, k.nombre, k.scope, k.mode, k.type, k.revoked_at, k.expires_at, k.api_version,
                   k.permissions, k.allowed_ips, k.oauth_client_id, k.replaced_by,
                   cord_effective_plan(o.id) as effective_plan,
                   k.active_rank, o.sandbox_of, o.embed_domains, c.slug as oauth_slug
              from ranked k
              join orgs o on o.id = k.org_id
              left join oauth_clients c on c.client_id = k.oauth_client_id
             where k.hash = ${hash}
             limit 1`;
    } catch {
        return jsonError('No se pudo validar la llave.', 'server_error', 500);
    }

    if (!row || row.revoked_at) {
        return jsonError('API key inválida o revocada.', 'invalid_key', 401);
    }
    if (row.expires_at && new Date(row.expires_at as string).getTime() <= Date.now()) {
        if (row.oauth_client_id) return jsonError('El token de acceso venció. Renuévalo con el refresh token.', 'token_expired', 401);
        return jsonError(row.replaced_by
            ? 'Esta llave se rotó y su periodo de gracia terminó. Usa la llave nueva.'
            : 'Esta llave venció. Genera una nueva en Ajustes › Developers.', 'key_expired', 401);
    }
    if (row.allowed_ips?.length && !ipAllowed(row.allowed_ips as string[], ip)) {
        void auditIpDenied(row, ip);
        return jsonError(`Esta llave no acepta peticiones desde la IP ${ip}. Agrégala a sus IPs permitidas en Ajustes › Developers.`, 'ip_not_allowed', 403);
    }
    if (Number(row.active_rank) > apiKeyLimit(String(row.effective_plan || 'free'))) {
        return jsonError(
            'Esta llave excede el número incluido en la suscripción actual. Revoca llaves anteriores o sube de plan.',
            'subscription_key_limit',
            402,
        );
    }

    const mode: ApiMode = row.mode === 'test' ? 'test' : 'live';
    const type: ApiKeyType = row.type === 'publishable' ? 'publishable' : 'secret';

    if (type === 'publishable') {
        if (!publishableKeyAllows(request.method, new URL(request.url).pathname)) {
            return jsonError('Publishable Key no tiene permisos para esta acción. Usa una Secret Key desde tu backend.', 'insufficient_scope', 403);
        }

        const origin = request.headers.get('origin') || request.headers.get('referer');
        const denied = publishableOriginCheck(mode, row.embed_domains, origin);
        if (denied) return jsonError(denied.error, denied.code, 403);
    }

    // La API está disponible en TODOS los planes (incluido free, limitado). El
    // consumo de las llaves en vivo se mide/factura por uso (Stripe Billing).

    const scope: ApiScope = row.scope === 'write' ? 'write' : 'read';
    const restricted = !!row.permissions;
    if (restricted) {
        const pathname = new URL(request.url).pathname;
        if (!pathname.startsWith('/api/v1/')) {
            return jsonError('Las llaves restringidas solo funcionan con la API REST. Para MCP usa una Secret Key.', 'insufficient_permissions', 403);
        }
        const verdict = restrictedKeyAllows(row.permissions as Partial<KeyPermissions>, pathname, need);
        if (!verdict.ok) {
            return jsonError(verdict.resource
                ? `Esta llave restringida no tiene permiso de ${need === 'write' ? 'escritura' : 'lectura'} en ${verdict.resource}.`
                : 'Esta llave restringida no tiene permiso para esta ruta.', 'insufficient_permissions', 403);
        }
    } else if (need === 'write' && scope !== 'write') {
        return jsonError('Esta API key es de solo lectura.', 'insufficient_scope', 403);
    }

    // ENTORNO DE PRUEBA (tipo Stripe): las llaves sk_test_ operan sobre la org
    // SANDBOX espejo — nunca tocan datos reales. Si la llave ya pertenece a la
    // sandbox (creada desde la UI en modo prueba), se usa tal cual. Una llave
    // live que viva en una sandbox es un estado inválido: se rechaza.
    let orgId = row.org_id as string;
    if (mode === 'test' && !row.sandbox_of) {
        try {
            orgId = await resolveSandboxOrgId(orgId);
        } catch {
            return jsonError('No se pudo resolver el entorno de prueba de esta llave.', 'server_error', 500);
        }
    } else if (mode === 'live' && row.sandbox_of) {
        return jsonError('Esta llave pertenece al entorno de prueba. Genera una llave en vivo fuera del modo de prueba.', 'invalid_key', 401);
    }

    // Marca de uso (best-effort: nunca debe romper la request).
    sql`update api_keys set last_used_at = now() where id = ${row.id}`.catch(() => {});

    return { orgId, scope, mode, type, keyId: row.id as string, oauthClient: (row.oauth_slug as string | null) ?? null, apiVersion: (row.api_version as string | null) ?? null, restricted };
}

// Una llave usada desde una IP no permitida suele ser una llave filtrada: queda
// en la bitácora, una vez por hora por llave e IP para que un abuso no la inunde.
async function auditIpDenied(row: { id: string; org_id: string; nombre: string }, ip: string): Promise<void> {
    const rl = await rateLimit(`apikey-ipdeny:${row.id}:${ip}`, 1, 3600);
    if (!rl.ok) return;
    await logAudit(row.org_id, {
        accion: 'apikey.ip_rechazada', entidad: 'api_key', entidad_id: row.id, actor: 'system',
        detalle: `La llave "${row.nombre}" se usó desde una IP no permitida`, ip,
    });
}

/**
 * Envuelve un handler de ruta pública para autenticarlo por API key y correrlo
 * con el org_id resuelto en el contexto (vía reqContext, sin sesión web). El
 * handler recibe el contexto de Astro + el `auth` ya validado.
 *
 *   export const GET = withApiAuth('read', async (ctx, auth) => { ... });
 *
 * Compone los 3 helpers exportados abajo (rate-limit por llave, medición de
 * uso, bitácora) — son la MISMA lógica que usa directamente MCP (`/api/mcp`,
 * `/api/mcp/sse`, `/api/mcp/message`), que no puede usar este wrapper porque
 * necesita procesar JSON-RPC/sesiones antes de decidir si hubo trabajo
 * facturable. Un solo lugar para las 3 piezas evita que MCP y /api/v1
 * diverjan en cómo miden/limitan/auditan.
 */
export function withApiAuth(
    need: ApiScope,
    handler: (ctx: Parameters<APIRoute>[0], auth: ApiAuth) => Response | Promise<Response>,
): APIRoute {
    return async (ctx) => {
        const requestId = newRequestId();
        const { res, version } = await runApiRoute(ctx, need, handler);
        const shaped = version ? await applyApiVersion(ctx.request, res, version) : res;
        return decorateApiResponse(ctx.request, shaped, requestId, version);
    };
}

// Los handlers producen la forma más nueva; aquí se convierte a la versión pedida.
async function applyApiVersion(request: Request, res: Response, version: string): Promise<Response> {
    if (!needsDowngrade(version) || res.status >= 400) return res;
    if (!(res.headers.get('content-type') || '').includes('application/json')) return res;
    const route = new URL(request.url).pathname.replace(/^\/api\/v1/, '') || '/';
    const body = downgradeResponse(route, await res.json(), version);
    const headers = new Headers(res.headers);
    headers.delete('content-length');
    return new Response(JSON.stringify(body), { status: res.status, headers });
}

async function runApiRoute(
    ctx: Parameters<APIRoute>[0],
    need: ApiScope,
    handler: (ctx: Parameters<APIRoute>[0], auth: ApiAuth) => Response | Promise<Response>,
): Promise<{ res: Response; version: string | null }> {
    const auth = await authApiKey(ctx.request, need);
    if (auth instanceof Response) return { res: auth, version: null };
    if (auth.type === 'secret' && !auth.oauthClient && isBrowserRequest(ctx.request)) {
        return { res: jsonError('Una Secret Key no se usa desde un navegador. Llámala desde tu servidor y revoca esta llave: ya quedó expuesta.', 'secret_key_in_browser', 403), version: null };
    }
    const resolved = resolveApiVersion(ctx.request.headers.get('cord-version'), auth.apiVersion);
    if (!resolved.ok) return { res: jsonError(resolved.error, 'invalid_api_version', 400), version: null };
    const version = resolved.version;
    const limited = await checkApiKeyRateLimit(auth);
    if (limited) return { res: limited, version };
    const t0 = Date.now();
    const res = await runIdempotent(auth, ctx.request, async () => {
        const meteringError = await meterApiUsage(auth);
        if (meteringError) return meteringError;
        // userId null → el carril de usuario queda inactivo; orgId manda la tenancy.
        return reqContext.run({ userId: null, orgId: auth.orgId, actor: `api:${auth.keyId}` }, () => handler(ctx, auth));
    });
    // Bitácora del request (best-effort: nunca frena ni rompe la respuesta).
    void logApiRequest(auth, ctx.request, res.status, Date.now() - t0);
    return { res, version };
}

// Rate limit por LLAVE: las pk_ (frontend) son más restringidas para evitar
// abusos. Devuelve un 429 listo para retornar, o null si puede seguir.
export async function checkApiKeyRateLimit(auth: ApiAuth): Promise<Response | null> {
    const maxReqs = auth.type === 'publishable' ? 120 : 600; // pk_ 120/min vs sk_ 600/min
    const keyRl = await rateLimit(`apikey:${auth.keyId}`, maxReqs, 60);
    if (!keyRl.ok) return tooMany(keyRl.retryAfter);
    return null;
}

// Reserva el uso ANTES de ejecutar trabajo de negocio. La reserva y el outbox
// quedan en Neon de forma atómica; entregar el evento a Stripe sí es asíncrono.
// Las llaves de prueba no consumen ni generan cargos reales.
export async function meterApiUsage(auth: ApiAuth): Promise<Response | null> {
    if (auth.mode !== 'live' || isFirstPartyClient(auth.oauthClient)) return null;
    const reservation = await reserveUsage(auth.orgId, 'api', 1);
    if (!reservation.ok || !reservation.id) {
        const unavailable = /verificar|registrar/i.test(reservation.reason || '');
        return jsonError(
            reservation.reason || 'Límite mensual de API alcanzado.',
            unavailable ? 'subscription_verification_unavailable' : 'api_quota_exceeded',
            unavailable ? 503 : 429,
        );
    }
    void flushUsageReservation(auth.orgId, reservation.id);
    return null;
}

// Registra la llamada en api_requests para el "Log de actividad" de Developers.
// Silencioso ante cualquier error (tabla no migrada, fallo de red a Neon, …).
// `routeOverride` deja que un caller que no vive en /api/v1 (MCP: 3 rutas
// físicas distintas pero N métodos JSON-RPC posibles) reporte una ruta
// LEGIBLE en el log en vez del pathname físico repetido siempre igual — ej.
// `/mcp/tools/call:listar_productos` en vez de solo `/mcp`.
export async function logApiRequest(auth: ApiAuth, request: Request, status: number, ms: number, routeOverride?: string): Promise<void> {
    try {
        const url = new URL(request.url);
        const ruta = routeOverride || (url.pathname.replace(/^\/api/, '') || '/');
        const ip = trustedIp(request);
        await sql`
            insert into api_requests (org_id, key_id, metodo, ruta, status, duracion_ms, mode, ip)
            values (${auth.orgId}, ${auth.keyId}, ${request.method}, ${ruta}, ${status}, ${ms}, ${auth.mode}, ${ip})`;
    } catch { /* no-op */ }
}

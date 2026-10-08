// "Ver como" de Cord Ops: la app de un negocio, tal como la ve su dueño, en
// SOLO LECTURA.
//
// Ops vive en ops.cordhq.app y la app en cordhq.app; sus cookies son host-only
// y no se comparten (regla 26). Ops emite un token de un solo uso
// (`ops_view_sessions.handoff_hash`, 90 s) y el apex lo canjea en
// /ops-vista/entrar por una cookie PROPIA de vista. Nunca es una sesión normal:
//   · el operador no se vuelve miembro de la organización ni toma la sesión de
//     nadie; la vista no tiene usuario de la app;
//   · toda petición que no sea GET/HEAD responde 403 en el middleware, y las
//     rutas GET con efectos (salir, OAuth, exportar, descargar) también;
//   · dura 30 min desde el canje y Ops la puede terminar antes;
//   · iniciarla exige admin con autenticación reciente y un motivo, y queda en
//     la bitácora de Ops.
// La base solo guarda sha256: ni el token del enlace ni el de la cookie.
import { createHash, randomBytes } from 'node:crypto';
import { sql } from './db';

export const OPS_VIEW_TTL_MINUTES = 30;
export const OPS_VIEW_HANDOFF_SECONDS = 90;
export const OPS_VIEW_ENTER_PATH = '/ops-vista/entrar';
export const OPS_VIEW_EXIT_PATH = '/ops-vista/salir';

export const OPS_VIEW_COOKIE = import.meta.env.PROD ? '__Host-cord_ops_view' : 'cord_ops_view';

const TOKEN_RE = /^[a-f0-9]{64}$/;

export const newOpsViewToken = () => randomBytes(32).toString('hex');
export const opsViewHash = (token: string) => createHash('sha256').update(token).digest('hex');
export const isOpsViewToken = (value: unknown): value is string => typeof value === 'string' && TOKEN_RE.test(value);

/** Origen de la app (apex), adonde Ops manda al operador. */
export const opsViewAppOrigin = () => import.meta.env.PROD ? 'https://cordhq.app' : 'http://localhost:4321';

/** Borrar una cookie `__Host-` exige Secure en el mismo Set-Cookie. */
export const opsViewCookieDeleteOptions = () => ({ path: '/', secure: import.meta.env.PROD, httpOnly: true, sameSite: 'strict' as const });

export function opsViewCookieOptions(expires: Date) {
    return {
        httpOnly: true,
        secure: import.meta.env.PROD,
        sameSite: 'strict' as const,
        path: '/',
        expires,
    };
}

/**
 * ¿Puede pasar esta petición en una vista de solo lectura? Solo GET/HEAD, y ni
 * siquiera todos: los de abajo escriben al responder (sincronizan con un
 * proveedor, registran presencia, emiten un token), abren un flujo OAuth,
 * exportan datos en bloque o tocan la cuenta PERSONAL de quien navega.
 */
const BLOCKED_GET: RegExp[] = [
    /^\/api\/(auth|account|cli|oauth|test-mode|keys|mcp|sso|onboarding|setup|dev)(\/|$|\.)/,
    /^\/api\/billing\/(handoff|portal|subscribe|pagar|cancelar|methods|mercadopago)(\/|$|\.)/,
    /^\/api\/billing\/connect\/(status|capture|onboarding|link)(\/|$)/,
    /^\/api\/integraciones\//,
    /^\/api\/cobros\/[^/]+\/reembolso$/,
    /^\/api\/cotizaciones\/[^/]+\/stream$/,
    /\/(export|exportar|descargar|download)(\/|$|\.)/,
    /^\/app\/salir(\/|$)/,
];
export function opsViewAllows(method: string, pathname: string): boolean {
    const m = method.toUpperCase();
    if (m !== 'GET' && m !== 'HEAD') return false;
    return !BLOCKED_GET.some((re) => re.test(pathname));
}

export interface ResolvedOpsView { id: string; orgId: string; operatorId: string; operatorEmail: string; expiresAt: Date }

/**
 * Resuelve la cookie de vista. La función es security definer y estrecha: solo
 * recibe el sha256 y solo devuelve una vista canjeada, vigente y de un
 * operador que sigue dado de alta.
 */
export async function resolveOpsView(token: string): Promise<ResolvedOpsView | null> {
    if (!isOpsViewToken(token)) return null;
    const rows = await sql`select id, org_id, operator_id, operator_email, expires_at from cord_ops_view_resolve(${opsViewHash(token)})`;
    const row: any = rows[0];
    if (!row?.org_id || !row?.operator_id) return null;
    return { id: String(row.id), orgId: String(row.org_id), operatorId: String(row.operator_id), operatorEmail: String(row.operator_email), expiresAt: new Date(row.expires_at) };
}

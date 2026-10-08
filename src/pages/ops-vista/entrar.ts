// GET /ops-vista/entrar?t=… — canje del enlace de "ver como" que emite Cord Ops
// (POST /api/ops/organizations/[id]/view) por una cookie de VISTA de este host.
//
// No abre una sesión de la app ni toca `cord_session` ni `cord_active_org`: la
// vista es una cookie aparte que el middleware resuelve en cada request y que
// solo permite leer (src/lib/ops-view.ts). Un token inválido, vencido o ya
// usado no explica cuál de los tres fue: se pide otro enlace desde Ops.
export const prerender = false;

import type { APIRoute } from 'astro';
import { sql } from '../../lib/db';
import { log } from '../../lib/log';
import {
    OPS_VIEW_COOKIE, OPS_VIEW_TTL_MINUTES, isOpsViewToken, newOpsViewToken, opsViewCookieOptions, opsViewHash,
} from '../../lib/ops-view';

const noStore = { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'X-Robots-Tag': 'noindex' };
const fail = () => new Response('Este enlace ya no es válido. Pide otro desde Cord Ops.', {
    status: 410, headers: { 'Content-Type': 'text/plain; charset=utf-8', ...noStore },
});

export const GET: APIRoute = async ({ url, cookies }) => {
    // Solo el apex sirve la app: en otro host la cookie no serviría de nada.
    if (import.meta.env.PROD && url.hostname !== 'cordhq.app') return new Response('Not found', { status: 404 });
    const raw = url.searchParams.get('t') || '';
    if (!isOpsViewToken(raw)) return fail();

    // Un solo uso: el marcado va en el mismo UPDATE que la lectura, y la
    // cookie lleva un token NUEVO (el del enlace ya pasó por el historial).
    const sessionToken = newOpsViewToken();
    let row: any;
    try {
        [row] = await sql`select id, org_id, operator_email, expires_at
            from cord_ops_view_redeem(${opsViewHash(raw)}, ${opsViewHash(sessionToken)}, ${OPS_VIEW_TTL_MINUTES})`;
    } catch (error) {
        log.error('no se pudo canjear una vista de Ops', { route: 'ops-vista/entrar', err: error });
        return fail();
    }
    if (!row?.org_id) return fail();

    cookies.set(OPS_VIEW_COOKIE, sessionToken, opsViewCookieOptions(new Date(row.expires_at)));
    return new Response(null, { status: 302, headers: { Location: '/app', ...noStore } });
};

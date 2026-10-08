// POST /ops-vista/salir — termina la vista de "ver como" desde la propia app
// (el botón del aviso superior) y regresa a la ficha de la organización en Ops.
// Es la única escritura que admite una vista: la de cerrarse.
export const prerender = false;

import type { APIRoute } from 'astro';
import { sql } from '../../lib/db';
import { log } from '../../lib/log';
import { OPS_VIEW_COOKIE, isOpsViewToken, opsViewCookieDeleteOptions, opsViewHash, resolveOpsView } from '../../lib/ops-view';

export const POST: APIRoute = async ({ cookies }) => {
    const token = cookies.get(OPS_VIEW_COOKIE)?.value || '';
    let orgId: string | null = null;
    if (isOpsViewToken(token)) {
        try {
            orgId = (await resolveOpsView(token))?.orgId ?? null;
            await sql`select cord_ops_view_end(${opsViewHash(token)})`;
        } catch (error) {
            log.error('no se pudo terminar una vista de Ops', { route: 'ops-vista/salir', err: error });
        }
    }
    cookies.delete(OPS_VIEW_COOKIE, opsViewCookieDeleteOptions());
    const ops = import.meta.env.PROD ? 'https://ops.cordhq.app' : '';
    const back = orgId ? `${ops}/ops/organizations/${orgId}` : `${ops}/ops/organizations`;
    return new Response(null, { status: 303, headers: { Location: back, 'Cache-Control': 'no-store' } });
};

// POST /api/cli/login/decide { codigo, aprobar } — la persona autoriza (o no) a
// la terminal desde su sesión. Crear la llave exige el mismo permiso que Ajustes.
export const prerender = false;

import type { APIRoute } from 'astro';
import { getActiveOrgId } from '../../../../lib/db';
import { currentUserId } from '../../../../lib/context';
import { requirePerm } from '../../../../lib/queries';
import { decideLogin, findLogin, normalizeUserCode } from '../../../../lib/cli-login';

export const POST: APIRoute = async ({ request }) => {
    const denied = await requirePerm('ajustes');
    if (denied) return denied;
    let body: any;
    try { body = await request.json(); } catch { return json({ error: 'JSON inválido' }, 400); }
    const codigo = normalizeUserCode(body?.codigo);
    if (!codigo) return json({ error: 'Código inválido' }, 400);
    const login = await findLogin(codigo);
    if (!login || login.estado !== 'pendiente' || !login.vigente) return json({ error: 'El código venció o ya se usó. Vuelve a correr cord login.' }, 409);
    const r = await decideLogin(codigo, body?.aprobar === true, {
        orgId: await getActiveOrgId(), userId: currentUserId()!, host: login.host, request, proyecto: body?.proyecto === true,
    });
    return r.ok ? json({ ok: true, ...(r.aviso ? { aviso: r.aviso } : {}) }) : json({ error: r.error }, r.status);
};

function json(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

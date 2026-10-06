// GET  /api/setup/plans/[id]                         → la propuesta y su estado
// POST /api/setup/plans/[id] { action: 'apply', propuesta? } → aplica lo revisado
// POST /api/setup/plans/[id] { action: 'discard' }   → la descarta
// Aplicar exige una sesión con permiso de ajustes: es el único punto donde un
// plan (venga del onboarding, del CLI o de un agente) cambia la cuenta.
export const prerender = false;

import type { APIRoute } from 'astro';
import { getActiveOrgId } from '../../../../lib/db';
import { requirePerm } from '../../../../lib/queries';
import { isUuid } from '../../../../lib/actions/outcome';
import { applySetup, discardSetup, getSetupPlan } from '../../../../lib/setup/apply';

export const GET: APIRoute = async ({ params }) => {
    const denied = await requirePerm('ajustes');
    if (denied) return denied;
    const id = String(params.id ?? '');
    if (!isUuid(id)) return json({ error: 'Propuesta no encontrada' }, 404);
    const plan = await getSetupPlan(await getActiveOrgId(), id);
    return plan ? json(plan) : json({ error: 'Propuesta no encontrada' }, 404);
};

export const POST: APIRoute = async ({ params, request }) => {
    const denied = await requirePerm('ajustes');
    if (denied) return denied;
    const id = String(params.id ?? '');
    if (!isUuid(id)) return json({ error: 'Propuesta no encontrada' }, 404);
    let body: any;
    try { body = await request.json(); } catch { return json({ error: 'JSON inválido' }, 400); }
    const orgId = await getActiveOrgId();

    if (body?.action === 'discard') {
        return (await discardSetup(orgId, id)) ? json({ ok: true }) : json({ error: 'Esta propuesta ya no está pendiente.' }, 409);
    }
    if (body?.action !== 'apply') return json({ error: 'Acción no reconocida' }, 400);
    const r = await applySetup(orgId, id, body.propuesta, request);
    return r.ok ? json(r) : json({ error: r.error }, r.status);
};

function json(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

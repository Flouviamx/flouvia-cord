// /api/informes/guardados/:id
//   PATCH { nombre?, config?, frecuencia? } → { guardado }
//   DELETE                                 → { ok }
export const prerender = false;

import type { APIRoute } from 'astro';
import { requirePerm } from '../../../../lib/queries';
import { deleteGuardado, updateGuardado } from '../../../../lib/informes-guardados';
import { actor, fail, json } from '../../../../lib/informes-guardados-http';

export const PATCH: APIRoute = async ({ params, request }) => {
    const denied = await requirePerm('analitica'); if (denied) return denied;
    let body: any;
    try { body = await request.json(); } catch { return json({ error: 'JSON inválido' }, 400); }
    const result = await updateGuardado(await actor(), String(params.id), body ?? {});
    return result.ok ? json({ guardado: result.value }) : fail(result.status, result.error);
};

export const DELETE: APIRoute = async ({ params }) => {
    const denied = await requirePerm('analitica'); if (denied) return denied;
    const result = await deleteGuardado(await actor(), String(params.id));
    return result.ok ? json({ ok: true }) : fail(result.status, result.error);
};

// /api/informes/guardados — informes personalizados guardados de la organización.
//   GET                                  → { guardados: [...] }
//   POST { nombre, config, frecuencia? }  → { guardado }
export const prerender = false;

import type { APIRoute } from 'astro';
import { requirePerm } from '../../../../lib/queries';
import { createGuardado, listGuardados } from '../../../../lib/informes-guardados';
import { actor, fail, json } from '../../../../lib/informes-guardados-http';

export const GET: APIRoute = async () => {
    const denied = await requirePerm('analitica'); if (denied) return denied;
    return json({ guardados: await listGuardados(await actor()) });
};

export const POST: APIRoute = async ({ request }) => {
    const denied = await requirePerm('analitica'); if (denied) return denied;
    let body: any;
    try { body = await request.json(); } catch { return json({ error: 'JSON inválido' }, 400); }
    const result = await createGuardado(await actor(), body ?? {});
    return result.ok ? json({ guardado: result.value }, 201) : fail(result.status, result.error);
};

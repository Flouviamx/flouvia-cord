// /api/workflows/[id]/probar — corre el BORRADOR contra el último evento real
// del disparador y devuelve qué habría pasado, sin ejecutar ninguna acción.
//   POST { definicion } → { ok, evento, pasos }
//
// La definición viaja en el cuerpo, no se lee de la base: el editor prueba lo
// que hay en pantalla, que es justo lo que todavía no se ha guardado.
export const prerender = false;

import type { APIRoute } from 'astro';
import { requirePerm } from '../../../../lib/queries';
import { currentLocale } from '../../../../lib/context';
import { strictRateLimit, strictLimitResponse } from '../../../../lib/ratelimit';
import { sessionContext } from '../../../../lib/actions/http';
import { getWorkflow } from '../../../../lib/workflows/service';
import { simulateWorkflow } from '../../../../lib/workflows/simulate';
import { intlLocale } from '../../../../lib/fmt-server';

export const POST: APIRoute = async ({ params, request }) => {
    const denied = await requirePerm('ajustes'); if (denied) return denied;
    let body: any;
    try { body = await request.json(); } catch { body = {}; }

    const ctx = await sessionContext(request);
    // La prueba consulta la base varias veces por corrida: su propio límite,
    // más estrecho que el de guardar, para que el botón no sea un cañón.
    const limitado = strictLimitResponse(await strictRateLimit(`workflows-probar:${ctx.orgId}`, 30, 60));
    if (limitado) return limitado;

    const wf = await getWorkflow(ctx.orgId, String(params.id ?? ''));
    if (!wf) return json({ error: 'Workflow no encontrado' }, 404);

    const resultado = await simulateWorkflow(ctx.orgId, body?.definicion ?? wf.definicion, currentLocale(), intlLocale());
    return json(resultado);
};

function json(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

// /api/v1/tareas — POST { titulo, due_date?, cotizacion_id?, factura_id? } → { data: { id } } (scope: write)
// Los dos vínculos se verifican contra la organización de la llave (404 si no son suyos).
export const prerender = false;

import { withApiAuth } from '../../../lib/apikey';
import { apiContext, fromOutcome, readJsonBody } from '../../../lib/apiv1';
import { createTask } from '../../../lib/actions/tasks';

export const POST = withApiAuth('write', async ({ request }, auth) => {
    const body = await readJsonBody(request);
    if (body instanceof Response) return body;
    return fromOutcome(await createTask(apiContext(request, auth), {
        titulo: body.titulo,
        due_date: body.due_date,
        cotizacion_id: body.cotizacion_id,
        documento_id: body.factura_id,
    }));
});

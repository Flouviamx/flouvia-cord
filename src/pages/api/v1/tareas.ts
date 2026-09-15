// /api/v1/tareas — POST { titulo, due_date?, cotizacion_id? } → { data: { id } } (scope: write)
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
    }));
});

// POST /api/v1/test_helpers/cotizaciones/{id} { accion } (solo sk_test_)
//   vista  → el cliente abre el link (quote.viewed), mismo camino que el heartbeat.
//   vencer → la cotización vence (quote.expired), mismo camino que el cron.
// Aprobar, rechazar y marcar pagada ya existen en POST /api/v1/cotizaciones/{id}.
export const prerender = false;

import { withApiAuth } from '../../../../../lib/apikey';
import { fail, ok, readJsonBody } from '../../../../../lib/apiv1';
import { expireQuoteForTest, viewQuoteForTest } from '../../../../../lib/sandbox-sim';
import { testModeOnly, simulationError } from '../../../../../lib/test-helpers-api';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const POST = withApiAuth('write', async ({ request, params }, auth) => {
    const denied = testModeOnly(auth);
    if (denied) return denied;
    const id = String(params.id ?? '');
    if (!UUID_RE.test(id)) return fail('id de cotización inválido.', 'missing_id', 400);
    const body = await readJsonBody(request);
    if (body instanceof Response) return body;
    const accion = String((body as any)?.accion ?? '');
    try {
        if (accion === 'vista') {
            await viewQuoteForTest(auth.orgId, id);
            return ok({ object: 'test_helper', accion, cotizacion_id: id });
        }
        if (accion === 'vencer') {
            const vencida = await expireQuoteForTest(auth.orgId, id);
            if (!vencida) return fail('Solo vence una cotización enviada o vista de la sandbox.', 'invalid_state', 409);
            return ok({ object: 'test_helper', accion, cotizacion_id: id });
        }
    } catch (e) {
        return simulationError(e);
    }
    return fail('accion debe ser vista o vencer.', 'invalid_request', 400);
});

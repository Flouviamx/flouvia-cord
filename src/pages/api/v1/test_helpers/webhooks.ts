// POST /api/v1/test_helpers/webhooks { evento, objeto_id? } (solo sk_test_)
// Dispara cualquiera de los 41 eventos a los endpoints de la sandbox por el
// outbox real (firma, reintentos, historial). Con objeto_id de una cotización o
// factura de la sandbox usa sus datos reales; sin él, datos de ejemplo.
export const prerender = false;

import { withApiAuth } from '../../../../lib/apikey';
import { fail, ok, readJsonBody } from '../../../../lib/apiv1';
import { triggerTestEvent } from '../../../../lib/sandbox-sim';
import { testModeOnly, simulationError } from '../../../../lib/test-helpers-api';
import { isWebhookEventType } from '../../../../../packages/elements/src/contract/webhook-events';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const POST = withApiAuth('write', async ({ request }, auth) => {
    const denied = testModeOnly(auth);
    if (denied) return denied;
    const body = await readJsonBody(request);
    if (body instanceof Response) return body;
    const evento = String((body as any)?.evento ?? '');
    const objetoId = (body as any)?.objeto_id ? String((body as any).objeto_id) : undefined;
    if (!isWebhookEventType(evento)) return fail('evento no está en el catálogo de webhooks.', 'invalid_request', 400);
    if (objetoId && !UUID_RE.test(objetoId)) return fail('objeto_id inválido.', 'invalid_request', 400);
    try {
        const datos = await triggerTestEvent(auth.orgId, evento, objetoId);
        return ok({ object: 'test_helper', evento, datos });
    } catch (e) {
        return simulationError(e);
    }
});

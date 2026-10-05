// GET    /api/v1/test_helpers/listen/{id} → eventos pendientes de la sesión, con
//        el cuerpo y los headers de firma exactos de una entrega real.
// DELETE /api/v1/test_helpers/listen/{id} → cierra la sesión.
export const prerender = false;

import { withApiAuth } from '../../../../../lib/apikey';
import { fail, ok } from '../../../../../lib/apiv1';
import { claimCliDeliveries } from '../../../../../lib/webhook-delivery';
import { closeCliSession, ownsCliSession } from '../../../../../lib/cli-listen';
import { testModeOnly } from '../../../../../lib/test-helpers-api';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NOT_FOUND = () => fail('La sesión no existe o ya venció. Vuelve a correr `cord listen`.', 'not_found', 404);

export const GET = withApiAuth('write', async ({ params }, auth) => {
    const denied = testModeOnly(auth);
    if (denied) return denied;
    const id = String(params.id ?? '');
    if (!UUID_RE.test(id) || !(await ownsCliSession(auth.orgId, auth.keyId, id))) return NOT_FOUND();
    const deliveries = await claimCliDeliveries(auth.orgId, id);
    if (!deliveries) return NOT_FOUND();
    return ok(deliveries);
});

export const DELETE = withApiAuth('write', async ({ params }, auth) => {
    const denied = testModeOnly(auth);
    if (denied) return denied;
    const id = String(params.id ?? '');
    if (!UUID_RE.test(id) || !(await closeCliSession(auth.orgId, auth.keyId, id))) return NOT_FOUND();
    return ok({ object: 'cli_session', id, cerrada: true });
});

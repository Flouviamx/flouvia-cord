// /api/v1/webhooks/[id] — borra una suscripción creada por esta misma llave.
//   DELETE → { data: { ok: true } }   (scope: write)
export const prerender = false;

import { withApiAuth } from '../../../../lib/apikey';
import { apiContext, fromOutcome } from '../../../../lib/apiv1';
import { deleteWebhookEndpoint } from '../../../../lib/actions/webhooks';

export const DELETE = withApiAuth('write', async ({ params, request }, auth) => {
    return fromOutcome(await deleteWebhookEndpoint(apiContext(request, auth), String(params.id ?? ''), auth.keyId));
});

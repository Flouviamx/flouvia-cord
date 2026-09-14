// /api/v1/webhooks — suscripciones creadas por esta llave (REST hooks de Zapier/Make).
//   GET                              → { data: [...] }                         (scope: read)
//   POST { url, eventos? }           → { data: { id, url, eventos, secret } }  (scope: write)
// Una llave solo ve y borra los endpoints que ella creó.
export const prerender = false;

import { withApiAuth } from '../../../lib/apikey';
import { rateLimit, tooMany } from '../../../lib/ratelimit';
import { apiContext, fromOutcome, ok, readJsonBody } from '../../../lib/apiv1';
import { createWebhookEndpoint, listApiWebhooks } from '../../../lib/actions/webhooks';

export const GET = withApiAuth('read', async ({ request }, auth) => {
    return ok(await listApiWebhooks(apiContext(request, auth), auth.keyId));
});

export const POST = withApiAuth('write', async ({ request }, auth) => {
    const rl = await rateLimit(`v1-webhooks:${auth.keyId}`, 20, 60);
    if (!rl.ok) return tooMany(rl.retryAfter);
    const body = await readJsonBody(request);
    if (body instanceof Response) return body;
    return fromOutcome(await createWebhookEndpoint(apiContext(request, auth), body, auth.keyId));
});

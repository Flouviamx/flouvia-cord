// POST /api/v1/test_helpers/listen { eventos? } → { id, secret, eventos, expira } (solo sk_test_)
// Abre una sesión de `cord listen`. El secreto se devuelve una sola vez.
export const prerender = false;

import { withApiAuth } from '../../../../lib/apikey';
import { fail, ok, readJsonBody } from '../../../../lib/apiv1';
import { openCliSession, MAX_CLI_SESSIONS_PER_KEY } from '../../../../lib/cli-listen';
import { testModeOnly, simulationError } from '../../../../lib/test-helpers-api';

export const POST = withApiAuth('write', async ({ request }, auth) => {
    const denied = testModeOnly(auth);
    if (denied) return denied;
    const body = await readJsonBody(request);
    if (body instanceof Response) return body;
    try {
        const session = await openCliSession(auth.orgId, auth.keyId, (body as any)?.eventos);
        if (!session) return fail(`Ya hay ${MAX_CLI_SESSIONS_PER_KEY} sesiones de escucha abiertas con esta llave. Cierra alguna con Ctrl+C.`, 'invalid_state', 409);
        return ok({ object: 'cli_session', ...session });
    } catch (e) {
        return simulationError(e);
    }
});

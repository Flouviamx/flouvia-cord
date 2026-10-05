// POST /api/v1/test_helpers/fiscal { siguiente_resultado } (solo sk_test_)
// Fuerza el resultado de la PRÓXIMA emisión fiscal de la sandbox: exito,
// pac_caido, receptor_invalido, certificado_vencido o timbre_duplicado. Se
// consume al emitir; sin uno pendiente, la emisión simulada tiene éxito.
export const prerender = false;

import { withApiAuth } from '../../../../lib/apikey';
import { fail, ok, readJsonBody } from '../../../../lib/apiv1';
import { RESULTADOS_FISCALES, setNextFiscalOutcome, type ResultadoFiscal } from '../../../../lib/sandbox-sim';
import { testModeOnly, simulationError } from '../../../../lib/test-helpers-api';

export const POST = withApiAuth('write', async ({ request }, auth) => {
    const denied = testModeOnly(auth);
    if (denied) return denied;
    const body = await readJsonBody(request);
    if (body instanceof Response) return body;
    const resultado = String((body as any)?.siguiente_resultado ?? '');
    if (!(RESULTADOS_FISCALES as readonly string[]).includes(resultado)) {
        return fail(`siguiente_resultado debe ser uno de: ${RESULTADOS_FISCALES.join(', ')}.`, 'invalid_request', 400);
    }
    try {
        await setNextFiscalOutcome(auth.orgId, resultado as ResultadoFiscal);
    } catch (e) {
        return simulationError(e);
    }
    return ok({ object: 'test_helper', tipo: 'fiscal_emision', siguiente_resultado: resultado });
});

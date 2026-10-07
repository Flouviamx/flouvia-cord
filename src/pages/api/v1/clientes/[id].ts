// /api/v1/clientes/[id] — GET detalle y PATCH de datos de contacto (solo cambia los campos enviados).
// Un `rfc` (o `country_code`) nuevo que no es válido para el país responde 422 con code 'invalid_tax_id'.
export const prerender = false;

import { withApiAuth } from '../../../../lib/apikey';
import { getClienteBasico } from '../../../../lib/queries';
import { apiContext, fail, fromOutcome, ok, readJsonBody } from '../../../../lib/apiv1';
import { isUuid } from '../../../../lib/actions/outcome';
import { INVALID_TAX_ID, patchClientContact } from '../../../../lib/actions/clients';

const NOT_FOUND = () => fail('Cliente no encontrado', 'not_found', 404);

export const GET = withApiAuth('read', async ({ params }) => {
    const id = String(params.id ?? '');
    if (!isUuid(id)) return NOT_FOUND();
    const cliente = await getClienteBasico(id);
    return cliente ? ok(cliente) : NOT_FOUND();
});

export const PATCH = withApiAuth('write', async ({ params, request }, auth) => {
    const body = await readJsonBody(request);
    if (body instanceof Response) return body;
    const out = await patchClientContact(apiContext(request, auth), String(params.id ?? ''), body);
    return fromOutcome(out.body.code === INVALID_TAX_ID ? { ...out, status: 422 } : out);
});

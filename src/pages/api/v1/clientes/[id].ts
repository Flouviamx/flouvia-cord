// /api/v1/clientes/[id] — GET detalle y PATCH de datos de contacto (solo cambia los campos enviados).
export const prerender = false;

import { withApiAuth } from '../../../../lib/apikey';
import { getClienteBasico } from '../../../../lib/queries';
import { apiContext, fail, fromOutcome, ok, readJsonBody } from '../../../../lib/apiv1';
import { isUuid } from '../../../../lib/actions/outcome';
import { patchClientContact } from '../../../../lib/actions/clients';

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
    return fromOutcome(await patchClientContact(apiContext(request, auth), String(params.id ?? ''), body));
});

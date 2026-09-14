// /api/v1/clientes — API PÚBLICA del directorio de clientes.
//   GET  ?limit=&offset=   → { data: [...], meta }
//   POST { empresa, contacto?, email?, telefono?, rfc?, terminos?, limite?, nivel?, descuento_pct? }
//        → { data: { id } }   (scope: write)
export const prerender = false;

import { withApiAuth } from '../../../lib/apikey';
import { getClientes } from '../../../lib/queries';
import { apiContext, fromOutcome, ok, pageParams, readJsonBody } from '../../../lib/apiv1';
import { createClient } from '../../../lib/actions/clients';

export const GET = withApiAuth('read', async ({ url }) => {
    const all = await getClientes();
    const { limit, offset } = pageParams(url);
    return ok(all.slice(offset, offset + limit), { limit, offset, total: all.length });
});

export const POST = withApiAuth('write', async ({ request }, auth) => {
    const body = await readJsonBody(request);
    if (body instanceof Response) return body;
    return fromOutcome(await createClient(apiContext(request, auth), body));
});

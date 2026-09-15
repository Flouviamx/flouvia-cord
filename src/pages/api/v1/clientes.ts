// /api/v1/clientes — API PÚBLICA del directorio de clientes.
//   GET  ?q=&email=&limit=&offset=   → { data: [...], meta }
//   POST { empresa, contacto?, email?, telefono?, rfc?, terminos?, limite?, nivel?, descuento_pct? }
//        → { data: { id } }   (scope: write)
export const prerender = false;

import { withApiAuth } from '../../../lib/apikey';
import { getClientesPage } from '../../../lib/queries';
import { apiContext, fromOutcome, ok, pageParams, readJsonBody } from '../../../lib/apiv1';
import { createClient } from '../../../lib/actions/clients';

export const GET = withApiAuth('read', async ({ url }) => {
    const { limit, offset } = pageParams(url);
    const page = await getClientesPage({ limit, offset, q: url.searchParams.get('q'), email: url.searchParams.get('email') });
    return ok(page.items, { limit, offset, total: page.total });
});

export const POST = withApiAuth('write', async ({ request }, auth) => {
    const body = await readJsonBody(request);
    if (body instanceof Response) return body;
    return fromOutcome(await createClient(apiContext(request, auth), body));
});

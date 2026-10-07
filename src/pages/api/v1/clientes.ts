// /api/v1/clientes — API PÚBLICA del directorio de clientes.
//   GET  ?q=&email=&limit=&offset=|cursor=   → { data: [...], meta: { limit, offset, total, next_cursor } }
//   POST { empresa, contacto?, email?, telefono?, rfc?, terminos?, limite?, nivel?, descuento_pct? }
//        → { data: { id } }   (scope: write)
export const prerender = false;

import { withApiAuth } from '../../../lib/apikey';
import { getClientesPage } from '../../../lib/queries';
import { apiContext, fromOutcome, ok, pageParams, readJsonBody, listCursor, listMeta, encodeListCursor } from '../../../lib/apiv1';
import { createClient } from '../../../lib/actions/clients';

export const GET = withApiAuth('read', async ({ url }) => {
    const { limit, offset } = pageParams(url);
    const after = listCursor(url, 2);
    if (after instanceof Response) return after;
    const page = await getClientesPage({ limit, offset, q: url.searchParams.get('q'), email: url.searchParams.get('email'), after });
    return ok(page.items, listMeta(limit, offset, page.total, after, page.nextKeys ? encodeListCursor(page.nextKeys) : null));
});

export const POST = withApiAuth('write', async ({ request }, auth) => {
    const body = await readJsonBody(request);
    if (body instanceof Response) return body;
    return fromOutcome(await createClient(apiContext(request, auth), body));
});

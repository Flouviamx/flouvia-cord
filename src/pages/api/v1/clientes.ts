// /api/v1/clientes — API PÚBLICA del directorio de clientes.
//   GET  ?q=&email=&limit=&offset=|cursor=   → { data: [...], meta: { limit, offset, total, next_cursor } }
//   POST { empresa, contacto?, email?, telefono?, rfc?, terminos?, limite?, nivel?, descuento_pct? }
//        → { data: { id } }   (scope: write)
//        → 422 { error, code: 'invalid_tax_id' } si el identificador fiscal no es válido para el país
//          del cliente (o el de la organización): el motivo nombra el dato local (RFC, NIF, CNPJ…).
export const prerender = false;

import { withApiAuth } from '../../../lib/apikey';
import { getClientesPage } from '../../../lib/queries';
import { apiContext, fromOutcome, ok, pageParams, readJsonBody, listCursor, listMeta, encodeListCursor } from '../../../lib/apiv1';
import { createClient, INVALID_TAX_ID } from '../../../lib/actions/clients';

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
    const out = await createClient(apiContext(request, auth), body);
    // La petición está bien formada; lo que no se puede procesar es el dato.
    return fromOutcome(out.body.code === INVALID_TAX_ID ? { ...out, status: 422 } : out);
});

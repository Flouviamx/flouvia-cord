// /api/v1/productos — API PÚBLICA del catálogo.
//   GET  ?limit=&offset=   → { data: [...], meta }
//   POST { sku?, nombre, unidad?, precio, activo? }   → { data: { id } }  (scope: write)
export const prerender = false;

import { withApiAuth } from '../../../lib/apikey';
import { getProductosPage } from '../../../lib/queries';
import { apiContext, fromOutcome, ok, pageParams, readJsonBody } from '../../../lib/apiv1';
import { createProduct } from '../../../lib/actions/products';

export const GET = withApiAuth('read', async ({ url }, auth) => {
    const { limit, offset } = pageParams(url);
    const page = await getProductosPage({ limit, offset });
    // Una llave publicable vive en el navegador: nunca expone el costo.
    const data = auth.type === 'publishable'
        ? page.items.map(({ costo, ...rest }) => rest)
        : page.items;
    return ok(data, { limit, offset, total: page.total });
});

export const POST = withApiAuth('write', async ({ request }, auth) => {
    const body = await readJsonBody(request);
    if (body instanceof Response) return body;
    return fromOutcome(await createProduct(apiContext(request, auth), body));
});

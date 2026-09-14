// /api/v1/productos — API PÚBLICA del catálogo.
//   GET  ?limit=&offset=   → { data: [...], meta }
//   POST { sku?, nombre, unidad?, precio, activo? }   → { data: { id } }  (scope: write)
export const prerender = false;

import { withApiAuth } from '../../../lib/apikey';
import { getProductos } from '../../../lib/queries';
import { apiContext, fromOutcome, ok, pageParams, readJsonBody } from '../../../lib/apiv1';
import { createProduct } from '../../../lib/actions/products';

export const GET = withApiAuth('read', async ({ url }, auth) => {
    const all = await getProductos();
    const { limit, offset } = pageParams(url);
    const page = all.slice(offset, offset + limit);
    // Una llave publicable vive en el navegador: nunca expone el costo.
    const data = auth.type === 'publishable'
        ? page.map(({ costo, ...rest }) => rest)
        : page;
    return ok(data, { limit, offset, total: all.length });
});

export const POST = withApiAuth('write', async ({ request }, auth) => {
    const body = await readJsonBody(request);
    if (body instanceof Response) return body;
    return fromOutcome(await createProduct(apiContext(request, auth), body));
});

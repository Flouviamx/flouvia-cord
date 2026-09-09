// /api/v1/cotizaciones/[id] — detalle de una cotización (con items + eventos).
//   GET → { data: { ...detalle } }   (scope: read)
export const prerender = false;

import { withApiAuth } from '../../../../lib/apikey';
import { getCotizacion } from '../../../../lib/queries';
import { getActiveOrgId } from '../../../../lib/db';
import { ok, fail, quoteDetail } from '../../../../lib/apiv1';

export const GET = withApiAuth('read', async ({ params }) => {
    const id = params.id;
    if (!id) return fail('Falta el id de la cotización', 'missing_id', 400);
    const q = await getCotizacion(id);
    if (!q) return fail('Cotización no encontrada', 'not_found', 404);
    return ok(await quoteDetail(q, await getActiveOrgId()));
});

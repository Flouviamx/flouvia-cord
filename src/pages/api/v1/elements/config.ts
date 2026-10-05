// GET /api/v1/elements/config → configuración que dibuja Cord Elements (pk_ o sk_).
// Divisas ofrecidas, impuestos por línea, retenciones, términos y vocabulario de
// la organización. Con ETag: el Builder la pide al montar y casi siempre es 304.
export const prerender = false;

import { createHash } from 'node:crypto';
import { withApiAuth } from '../../../../lib/apikey';
import { fail, ok } from '../../../../lib/apiv1';
import { buildElementsConfig } from '../../../../lib/elements-config';
import { TaxCatalogUnavailableError } from '../../../../lib/impuestos-db';

export const GET = withApiAuth('read', async ({ request }, auth) => {
    let config;
    try {
        config = await buildElementsConfig(auth.orgId);
    } catch (e) {
        if (e instanceof TaxCatalogUnavailableError) {
            return fail('No se pudo leer la configuración de impuestos. Intenta de nuevo en unos segundos.', 'tax_catalog_unavailable', 503);
        }
        throw e;
    }
    const res = ok(config);
    const etag = `"${createHash('sha256').update(await res.clone().text()).digest('base64url').slice(0, 27)}"`;
    const headers = { ETag: etag, 'Cache-Control': 'private, max-age=60', Vary: 'Authorization' };
    if (request.headers.get('if-none-match') === etag) return new Response(null, { status: 304, headers });
    return new Response(res.body, { status: 200, headers: { ...Object.fromEntries(res.headers), ...headers } });
});

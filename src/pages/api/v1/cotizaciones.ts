// /api/v1/cotizaciones — API PÚBLICA de cotizaciones.
//   GET  ?status=&folio=&limit=&offset=   → { data: [...], meta: { limit, offset, total } }
//   POST { cliente_id?, terminos?, vigencia_dias?, notas?, send?, items[] }
//        → { data: { id, folio, link_publico, ... } }   (scope: write)
export const prerender = false;

import { withApiAuth } from '../../../lib/apikey';
import { getActiveOrgId, reqIp } from '../../../lib/db';
import { getCotizacionesPage } from '../../../lib/queries';
import { createCotizacion, QuoteError } from '../../../lib/cotizaciones';
import { ok, fail, pageParams, quoteListItem, readJsonBody } from '../../../lib/apiv1';
import { publicDocumentUrl } from '../../../lib/public-links';

export const GET = withApiAuth('read', async ({ url }) => {
    const orgId = await getActiveOrgId();
    const { limit, offset } = pageParams(url);
    const status = url.searchParams.get('status') || null;
    const page = await getCotizacionesPage({ limit, offset, status, folio: url.searchParams.get('folio') });
    return ok(await Promise.all(page.items.map((q) => quoteListItem(q, orgId))), { limit, offset, total: page.total });
});

export const POST = withApiAuth('write', async ({ request }, auth) => {
    const body = await readJsonBody(request);
    if (body instanceof Response) return body;

    const orgId = await getActiveOrgId();
    try {
        const origin = new URL(request.url).origin;
        const r = await createCotizacion(orgId, body, {
            origin,
            ip: reqIp(request),
            actor: `api:${auth.keyId}`,
        });
        return ok({
            id: r.id,
            // El token siempre estuvo disponible en `r` — no devolverlo obligaba
            // a los consumidores (ver El Zarco) a parsearlo a mano de
            // `link_publico.split('/q/')[1]`.
            token: r.token,
            folio: r.folio,
            // Absoluto: relativo obligaba al mismo parseo manual para construir
            // un link que enviar por correo/WhatsApp.
            link_publico: await publicDocumentUrl(orgId, 'q', r.token),
            needs_approval: r.needsApproval,
            motivo: r.motivo,
            email: r.email,
        });
    } catch (e) {
        if (e instanceof QuoteError) return fail(e.message, 'invalid_request', e.status);
        throw e;
    }
});

// /api/v1/cotizaciones — API PÚBLICA de cotizaciones.
//   GET  ?status=&limit=&offset=   → { data: [...], meta: { limit, offset, total } }
//   POST { cliente_id?, terminos?, vigencia_dias?, notas?, send?, items[] }
//        → { data: { id, folio, link_publico, ... } }   (scope: write)
export const prerender = false;

import { withApiAuth } from '../../../lib/apikey';
import { getActiveOrgId, reqIp } from '../../../lib/db';
import { getCotizaciones } from '../../../lib/queries';
import { createCotizacion, QuoteError } from '../../../lib/cotizaciones';
import { ok, fail, pageParams, quoteListItem } from '../../../lib/apiv1';

export const GET = withApiAuth('read', async ({ url }) => {
    const all = await getCotizaciones();
    const status = url.searchParams.get('status');
    const filtered = status ? all.filter((q) => q.status === status) : all;
    const { limit, offset } = pageParams(url);
    const page = filtered.slice(offset, offset + limit);
    return ok(page.map(quoteListItem), { limit, offset, total: filtered.length });
});

export const POST = withApiAuth('write', async ({ request }, auth) => {
    let body: any;
    try { body = await request.json(); } catch { return fail('JSON inválido', 'invalid_json', 400); }

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
            link_publico: `${origin}/q/${r.token}`,
            needs_approval: r.needsApproval,
            motivo: r.motivo,
            email: r.email,
        });
    } catch (e) {
        if (e instanceof QuoteError) return fail(e.message, 'invalid_request', e.status);
        throw e;
    }
});

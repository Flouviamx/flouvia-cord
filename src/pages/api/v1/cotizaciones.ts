// /api/v1/cotizaciones — API PÚBLICA de cotizaciones.
//   GET  ?status=&folio=&cliente_id=&limit=&offset=|cursor=   → { data: [...], meta: { limit, offset, total, next_cursor } }
//   POST { cliente_id?, terminos?, vigencia_dias?, notas?, send?, items[] }
//        → { data: { id, folio, link_publico, ... } }   (scope: write)
export const prerender = false;

import { withApiAuth } from '../../../lib/apikey';
import { getActiveOrgId, reqIp } from '../../../lib/db';
import { getCotizacionesPage } from '../../../lib/queries';
import { createCotizacion, QuoteError } from '../../../lib/cotizaciones';
import { ok, fail, pageParams, quoteListItem, readJsonBody, listCursor, listMeta, encodeListCursor } from '../../../lib/apiv1';
import { publicDocumentUrl } from '../../../lib/public-links';

export const GET = withApiAuth('read', async ({ url }) => {
    const orgId = await getActiveOrgId();
    const { limit, offset } = pageParams(url);
    const after = listCursor(url, 2);
    if (after instanceof Response) return after;
    const status = url.searchParams.get('status') || null;
    const clienteId = url.searchParams.get('cliente_id') || null;
    if (clienteId && !/^[0-9a-f-]{36}$/i.test(clienteId)) return fail('cliente_id no es válido.', 'invalid_cliente_id');
    const page = await getCotizacionesPage({ limit, offset, status, folio: url.searchParams.get('folio'), clienteId, after });
    return ok(await Promise.all(page.items.map((q) => quoteListItem(q, orgId))),
        listMeta(limit, offset, page.total, after, page.nextKeys ? encodeListCursor(page.nextKeys) : null));
});

export const POST = withApiAuth('write', async ({ request }, auth) => {
    const body = await readJsonBody(request);
    if (body instanceof Response) return body;

    const orgId = await getActiveOrgId();
    const input = auth.type === 'publishable' ? publishableQuoteInput(body) : body;
    if (input instanceof Response) return input;
    try {
        const origin = new URL(request.url).origin;
        const r = await createCotizacion(orgId, input, {
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
        if (e instanceof QuoteError) {
            if (e.details) return new Response(JSON.stringify({ error: e.message, code: e.code, issues: e.details }), { status: e.status, headers: { 'Content-Type': 'application/json' } });
            return fail(e.message, e.code ?? 'invalid_request', e.status);
        }
        throw e;
    }
});

// Una pk_ vive en una página pública: lo que crea es un borrador que el vendedor
// revisa. No envía correos (sería un relé de spam con el dominio de Cord) ni
// fija costo o precio negociado; el precio de lista sí, porque es lo que se cotiza.
export function publishableQuoteInput(body: any): any | Response {
    if (!body || typeof body !== 'object') return body;
    if (body.send) return fail('Enviar la cotización requiere una Secret Key desde tu servidor.', 'insufficient_scope', 403);
    const items = Array.isArray(body.items)
        ? body.items.map((it: any) => (it && typeof it === 'object'
            ? { producto_id: it.producto_id, descripcion: it.descripcion, cantidad: it.cantidad, precio_unitario: it.precio_unitario, tax_rate: it.tax_rate }
            : it))
        : body.items;
    return {
        cliente: body.cliente,
        terminos: body.terminos,
        vigencia_dias: body.vigencia_dias,
        notas: body.notas,
        base_currency: body.base_currency,
        iva_incluido: body.iva_incluido,
        items,
        send: false,
    };
}

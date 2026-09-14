// /api/cotizaciones/[id] — acciones sobre una cotización existente.
//   PATCH  { action: 'send' | 'resend' | 'update_draft' | 'approve' | 'reject' | 'paid' | 'invoiced' | 'approve_request' | 'reject_request' | 'reply' | 'item_reply' }
//   DELETE → solo borradores
export const prerender = false;

import type { APIRoute } from 'astro';
import { getActiveOrgId, reqIp } from '../../../lib/db';
import { requirePerm } from '../../../lib/queries';
import { log } from '../../../lib/log';
import { merchantError } from '../../../lib/pay-errors';
import { strictRateLimit, strictLimitResponse } from '../../../lib/ratelimit';
import { deleteQuoteDraft, quoteActionPermission, runQuoteAction } from '../../../lib/actions/quotes';

export const PATCH: APIRoute = async ({ params, request }) => {
    const id = params.id ?? '';
    let body: any;
    try { body = await request.json(); } catch { return json({ error: 'JSON inválido' }, 400); }
    try {
        const denied = await requirePerm(quoteActionPermission(String(body.action)));
        if (denied) return denied;
        const orgId = await getActiveOrgId();
        const limitado = strictLimitResponse(await strictRateLimit(`cotizacion-patch:${orgId}`, 120, 60));
        if (limitado) return limitado;
        const r = await runQuoteAction({ orgId, ip: reqIp(request), origin: new URL(request.url).origin }, id, body);
        return json(r.body, r.status);
    } catch (err: any) {
        log.error('error no controlado', { route: 'PATCH cotizacion', err });
        const safe = merchantError(err);
        return json({ error: safe.message, reference: safe.reference }, 500);
    }
};

export const DELETE: APIRoute = async ({ params }) => {
    const id = params.id ?? '';
    const denied = await requirePerm('cotizar');
    if (denied) return denied;
    const orgId = await getActiveOrgId();
    const limitado = strictLimitResponse(await strictRateLimit(`cotizacion-patch:${orgId}`, 120, 60));
    if (limitado) return limitado;
    const r = await deleteQuoteDraft({ orgId, origin: '' }, id);
    return json(r.body, r.status);
};

function json(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

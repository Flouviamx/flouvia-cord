// /api/v1/cotizaciones/[id] — detalle y ciclo de vida de una cotización.
//   GET                                                                   (scope: read)
//   POST   { action: 'send' | 'resend' | 'approve' | 'reject' | 'mark_paid', payment_method? }  (scope: write)
//   DELETE → solo borradores                                              (scope: write)
export const prerender = false;

import { withApiAuth } from '../../../../lib/apikey';
import { getCotizacion } from '../../../../lib/queries';
import { getActiveOrgId } from '../../../../lib/db';
import { strictRateLimit, strictLimitResponse } from '../../../../lib/ratelimit';
import { apiContext, fail, fromOutcome, ok, quoteDetail, readJsonBody } from '../../../../lib/apiv1';
import { deleteQuoteDraft, runQuoteAction } from '../../../../lib/actions/quotes';
import { isUuid } from '../../../../lib/actions/outcome';

const API_ACTIONS: Record<string, string> = {
    send: 'send',
    resend: 'resend',
    approve: 'approve',
    reject: 'reject',
    mark_paid: 'paid',
};

export const GET = withApiAuth('read', async ({ params }) => {
    const id = params.id;
    if (!id) return fail('Falta el id de la cotización', 'missing_id', 400);
    const q = await getCotizacion(id);
    if (!q) return fail('Cotización no encontrada', 'not_found', 404);
    return ok(await quoteDetail(q, await getActiveOrgId()));
});

export const POST = withApiAuth('write', async ({ params, request }, auth) => {
    const id = String(params.id ?? '');
    if (!isUuid(id)) return fail('Cotización no encontrada', 'not_found', 404);
    const body = await readJsonBody(request);
    if (body instanceof Response) return body;
    const action = API_ACTIONS[String(body.action ?? '')];
    if (!action) return fail(`action debe ser una de: ${Object.keys(API_ACTIONS).join(', ')}`, 'invalid_request', 400);
    const limitado = strictLimitResponse(await strictRateLimit(`cotizacion-patch:${auth.orgId}`, 120, 60));
    if (limitado) return limitado;
    const input = action === 'paid'
        ? { action, payment_method: typeof body.payment_method === 'string' ? body.payment_method.slice(0, 40) : undefined }
        : { action };
    return fromOutcome(await runQuoteAction(apiContext(request, auth), id, input));
});

export const DELETE = withApiAuth('write', async ({ params, request }, auth) => {
    const id = String(params.id ?? '');
    if (!isUuid(id)) return fail('Cotización no encontrada', 'not_found', 404);
    const limitado = strictLimitResponse(await strictRateLimit(`cotizacion-patch:${auth.orgId}`, 120, 60));
    if (limitado) return limitado;
    return fromOutcome(await deleteQuoteDraft(apiContext(request, auth), id));
});

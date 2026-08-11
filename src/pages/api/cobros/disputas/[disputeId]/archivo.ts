export const prerender = false;

import type { APIRoute } from 'astro';
import { sql, getActiveOrgId, withOrgTx } from '../../../../../lib/db';
import { requirePermAny } from '../../../../../lib/queries';
import { strictLimitResponse, strictRateLimit } from '../../../../../lib/ratelimit';
import { stripeUpload } from '../../../../../lib/billing';
import { guardUpload } from '../../../../../lib/upload-guard';
import { merchantError } from '../../../../../lib/pay-errors';

export const POST: APIRoute = async ({ request, params }) => {
    const denied = await requirePermAny(['cobranza', 'cobros_config']);
    if (denied) return denied;
    const orgId = await getActiveOrgId();
    const disputeId = params.disputeId || '';
    const limited = strictLimitResponse(await strictRateLimit(`dispute-file:${orgId}`, 15, 3600));
    if (limited) return limited;
    const [[dispute]] = await withOrgTx(orgId, sql`
        select d.id, o.stripe_account_id from cobro_disputas d join orgs o on o.id = d.org_id
         where d.org_id = ${orgId} and d.stripe_dispute_id = ${disputeId} limit 1`);
    if (!dispute) return json({ error: 'Contracargo no encontrado' }, 404);
    if (!dispute.stripe_account_id) return json({ error: 'La cuenta de cobros no está disponible' }, 409);
    const form = await request.formData();
    const file = form.get('file');
    if (!(file instanceof File)) return json({ error: 'Selecciona un archivo' }, 400);
    try {
        const guarded = await guardUpload(file, { maxBytes: 4_500_000, prefix: 'evidence' });
        const uploaded = await stripeUpload(guarded.bytes, guarded.filename, guarded.mime,
            'dispute_evidence', String(dispute.stripe_account_id));
        return json({ ok: true, fileId: uploaded.id });
    } catch (error) {
        const safe = merchantError(error);
        return json({ error: safe.message, reference: safe.reference }, 400);
    }
};

function json(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

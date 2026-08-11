export const prerender = false;

import type { APIRoute } from 'astro';
import { z } from 'zod';
import { sql, getActiveOrgId, logAudit, reqIp, withOrgTx } from '../../../../../lib/db';
import { requirePermAny } from '../../../../../lib/queries';
import { requireFreshAuth } from '../../../../../lib/step-up';
import { strictLimitResponse, strictRateLimit } from '../../../../../lib/ratelimit';
import { parseJsonBody } from '../../../../../lib/validation';
import { stripe } from '../../../../../lib/billing';
import { merchantError } from '../../../../../lib/pay-errors';

const evidenceSchema = z.object({
    customer_name: z.string().trim().max(200).optional(),
    customer_email_address: z.string().email().max(320).optional(),
    customer_purchase_ip: z.union([z.ipv4(), z.ipv6()]).optional(),
    product_description: z.string().trim().max(2_000).optional(),
    customer_communication: z.string().regex(/^file_[A-Za-z0-9]+$/).optional(),
    customer_communication_text: z.string().trim().max(20_000).optional(),
    service_date: z.string().trim().max(200).optional(),
    shipping_documentation: z.string().regex(/^file_[A-Za-z0-9]+$/).optional(),
    receipt: z.string().regex(/^file_[A-Za-z0-9]+$/).optional(),
    refund_policy: z.string().regex(/^file_[A-Za-z0-9]+$/).optional(),
    cancellation_policy_disclosure: z.string().regex(/^file_[A-Za-z0-9]+$/).optional(),
    uncategorized_text: z.string().trim().max(20_000).optional(),
    access_activity_log: z.string().trim().max(20_000).optional(),
}).strict();

const requestSchema = z.object({ evidence: evidenceSchema, submit: z.boolean().optional().default(false) }).strict();

export const POST: APIRoute = async ({ request, params }) => {
    const denied = await requirePermAny(['cobranza', 'cobros_config']);
    if (denied) return denied;
    const orgId = await getActiveOrgId();
    const disputeId = params.disputeId || '';
    const limited = strictLimitResponse(await strictRateLimit(`dispute-evidence:${orgId}`, 20, 3600));
    if (limited) return limited;
    const parsed = await parseJsonBody(request, requestSchema);
    if (!parsed.ok) return json({ error: parsed.error }, parsed.status);

    const [[dispute]] = await withOrgTx(orgId, sql`
        select d.id, d.status, d.evidence_submitted_at, o.stripe_account_id
          from cobro_disputas d join orgs o on o.id = d.org_id
         where d.org_id = ${orgId} and d.stripe_dispute_id = ${disputeId}
         limit 1`);
    if (!dispute) return json({ error: 'Contracargo no encontrado' }, 404);
    if (['won', 'lost', 'warning_closed'].includes(String(dispute.status))) {
        return json({ error: 'Este contracargo ya está cerrado' }, 409);
    }
    if (dispute.evidence_submitted_at) {
        return json({ error: 'La evidencia ya fue enviada y no puede modificarse' }, 409);
    }

    if (!parsed.data.submit) {
        await withOrgTx(orgId, sql`
            update cobro_disputas set evidence_draft = ${JSON.stringify(parsed.data.evidence)}::jsonb, updated_at = now()
             where id = ${dispute.id} and org_id = ${orgId}`);
        await logAudit(orgId, { accion: 'cord_pagos.disputa_borrador_guardado', entidad: 'dispute', entidad_id: disputeId, ip: reqIp(request) });
        return json({ ok: true, status: 'draft' });
    }

    const staleAuth = await requireFreshAuth();
    if (staleAuth) return staleAuth;
    if (!dispute.stripe_account_id) return json({ error: 'La cuenta de cobros no está disponible' }, 409);
    const fields: Record<string, string> = { submit: 'true' };
    for (const [key, value] of Object.entries(parsed.data.evidence)) {
        if (value && key !== 'customer_communication_text') fields[`evidence[${key}]`] = value;
    }
    try {
        const updated = await stripe(`/v1/disputes/${disputeId}`, fields, 'POST', {
            stripeAccount: String(dispute.stripe_account_id),
            idempotencyKey: `dispute-submit-${disputeId}`,
        });
        await withOrgTx(orgId, sql`
            update cobro_disputas set evidence_draft = ${JSON.stringify(parsed.data.evidence)}::jsonb,
                   evidence_submitted_at = now(), status = ${updated.status || dispute.status}, updated_at = now()
             where id = ${dispute.id} and org_id = ${orgId}`);
        await logAudit(orgId, { accion: 'cord_pagos.disputa_evidencia_enviada', entidad: 'dispute', entidad_id: disputeId, ip: reqIp(request) });
        return json({ ok: true, status: updated.status || dispute.status });
    } catch (error) {
        const safe = merchantError(error);
        console.error('[dispute-evidence] proveedor rechazó operación', { orgId, disputeId, reference: safe.reference });
        return json({ error: safe.message, reference: safe.reference }, 502);
    }
};

function json(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

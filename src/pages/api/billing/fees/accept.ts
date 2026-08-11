export const prerender = false;

import type { APIRoute } from 'astro';
import { z } from 'zod';
import { sql, getActiveOrgId, logAudit, reqIp, withOrgTx } from '../../../../lib/db';
import { requirePerm } from '../../../../lib/queries';
import { requireFreshAuth } from '../../../../lib/step-up';
import { strictLimitResponse, strictRateLimit } from '../../../../lib/ratelimit';
import { parseJsonBody } from '../../../../lib/validation';
import { FEE_TERMS_VERSION } from '../../../../lib/fees';

const schema = z.object({ accepted: z.literal(true), version: z.literal(FEE_TERMS_VERSION) });

export const POST: APIRoute = async ({ request }) => {
    const denied = await requirePerm('cobros_config');
    if (denied) return denied;
    const orgId = await getActiveOrgId();
    const limited = strictLimitResponse(await strictRateLimit(`fee-accept:${orgId}`, 5, 300));
    if (limited) return limited;
    const staleAuth = await requireFreshAuth();
    if (staleAuth) return staleAuth;
    const parsed = await parseJsonBody(request, schema);
    if (!parsed.ok) return json({ error: parsed.error }, parsed.status);

    const [updated] = await withOrgTx(orgId, sql`
        update orgs
        set fee_enabled = true, fee_plan = 'standard_mx', checkout_v2 = true,
            fee_terms_version = ${FEE_TERMS_VERSION}, fee_terms_accepted_at = now()
        where id = ${orgId} and sandbox_of is null
        returning id`);
    if (!updated.length) return json({ error: 'No se pudo activar la tarifa en esta organización' }, 409);
    await logAudit(orgId, {
        accion: 'terminos.comision_aceptada', entidad: 'org', entidad_id: orgId,
        detalle: `Versión ${FEE_TERMS_VERSION}`, ip: reqIp(request),
    });
    return json({ ok: true, version: FEE_TERMS_VERSION });
};

function json(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

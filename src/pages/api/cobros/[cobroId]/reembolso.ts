export const prerender = false;

import type { APIRoute } from 'astro';
import { createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';
import { sql, getActiveOrgId, logAudit, reqIp, withOrgTx } from '../../../../lib/db';
import { currentUserId } from '../../../../lib/context';
import { requirePerm } from '../../../../lib/queries';
import { requireFreshAuth } from '../../../../lib/step-up';
import { strictLimitResponse, strictRateLimit } from '../../../../lib/ratelimit';
import { parseJsonBody } from '../../../../lib/validation';
import { stripe } from '../../../../lib/billing';
import { merchantError } from '../../../../lib/pay-errors';

const requestSchema = z.object({
    nonce: z.string().min(24).max(200),
    amountCents: z.number().int().positive(),
    reason: z.string().trim().max(240).optional(),
    manual: z.boolean().optional().default(false),
}).strict();

const hashNonce = (nonce: string) => createHash('sha256').update(nonce).digest('hex');

export const GET: APIRoute = async ({ params }) => {
    const denied = await requirePerm('reembolsar');
    if (denied) return denied;
    const orgId = await getActiveOrgId();
    const cobroId = params.cobroId || '';
    const limited = strictLimitResponse(await strictRateLimit(`refund-nonce:${orgId}`, 20, 3600));
    if (limited) return limited;

    const [[cobro]] = await withOrgTx(orgId, sql`
        select c.id, c.monto, c.payment_method, c.metodo_pago,
               coalesce(sum(r.amount_cents) filter (where r.status in ('pending','succeeded','pending_manual')), 0) as refunded
          from cotizacion_cobros c
          left join cobro_reembolsos r on r.cobro_id = c.id
         where c.id = ${cobroId} and c.org_id = ${orgId} and c.status = 'pagado'
         group by c.id`);
    if (!cobro) return json({ error: 'Cobro pagado no encontrado' }, 404);
    const maxAmountCents = Math.max(0, Math.round(Number(cobro.monto) * 100) - Number(cobro.refunded || 0));
    if (!maxAmountCents) return json({ error: 'Este cobro ya fue reembolsado por completo' }, 409);

    const nonce = randomBytes(32).toString('base64url');
    await withOrgTx(orgId, sql`
        insert into refund_nonces
          (org_id, cobro_id, nonce_hash, max_amount_cents, expires_at, created_by)
        values (${orgId}, ${cobroId}, ${hashNonce(nonce)}, ${maxAmountCents},
                now() + interval '10 minutes', ${currentUserId()})`);
    return json({ nonce, maxAmountCents, method: cobro.metodo_pago || cobro.payment_method || 'tarjeta', expiresIn: 600 });
};

export const POST: APIRoute = async ({ request, params }) => {
    const denied = await requirePerm('reembolsar');
    if (denied) return denied;
    const orgId = await getActiveOrgId();
    const cobroId = params.cobroId || '';
    const limited = strictLimitResponse(await strictRateLimit(`refund:${orgId}`, 10, 86_400));
    if (limited) return limited;
    const staleAuth = await requireFreshAuth();
    if (staleAuth) return staleAuth;
    const parsed = await parseJsonBody(request, requestSchema);
    if (!parsed.ok) return json({ error: parsed.error }, parsed.status);

    const nonceHash = hashNonce(parsed.data.nonce);
    const [[nonce], [cobro]] = await withOrgTx(orgId,
        sql`update refund_nonces set consumed_at = now()
             where org_id = ${orgId} and cobro_id = ${cobroId} and nonce_hash = ${nonceHash}
               and consumed_at is null and expires_at > now()
               and max_amount_cents >= ${parsed.data.amountCents}
            returning id`,
        sql`select c.id, c.cotizacion_id, c.monto, c.payment_method, c.metodo_pago,
                   c.stripe_payment_intent_id, o.stripe_account_id,
                   coalesce((select sum(r.amount_cents) from cobro_reembolsos r
                             where r.cobro_id = c.id and r.status in ('pending','succeeded','pending_manual')), 0) as refunded
              from cotizacion_cobros c join orgs o on o.id = c.org_id
             where c.id = ${cobroId} and c.org_id = ${orgId} and c.status = 'pagado'`);
    if (!nonce) return json({ error: 'La autorización de reembolso venció o ya fue utilizada' }, 409);
    if (!cobro) return json({ error: 'Cobro pagado no encontrado' }, 404);
    const available = Math.max(0, Math.round(Number(cobro.monto) * 100) - Number(cobro.refunded || 0));
    if (parsed.data.amountCents > available) return json({ error: 'El monto supera el saldo reembolsable' }, 409);

    const method = String(cobro.metodo_pago || cobro.payment_method || 'tarjeta');
    const auditDetail = `${(parsed.data.amountCents / 100).toFixed(2)} MXN${parsed.data.reason ? `; ${parsed.data.reason}` : ''}`;
    if (method === 'spei') {
        if (!parsed.data.manual) {
            return json({ error: 'Los reembolsos SPEI requieren una transferencia manual y su registro posterior' }, 422);
        }
        await withOrgTx(orgId,
            sql`insert into cobro_reembolsos
                  (id, org_id, cobro_id, amount_cents, status, reason, manual, requested_by)
                values (${nonce.id}, ${orgId}, ${cobroId}, ${parsed.data.amountCents}, 'pending_manual',
                        ${parsed.data.reason || null}, true, ${currentUserId()})`,
            sql`insert into tareas (org_id, cotizacion_id, titulo)
                values (${orgId}, ${cobro.cotizacion_id}, ${`Transferir reembolso SPEI por ${(parsed.data.amountCents / 100).toFixed(2)} MXN`})`,
        );
        await logAudit(orgId, { accion: 'cord_pagos.reembolso_manual_solicitado', entidad: 'cobro', entidad_id: cobroId, detalle: auditDetail, ip: reqIp(request) });
        return json({ ok: true, status: 'pending_manual' }, 202);
    }

    if (!cobro.stripe_account_id || !cobro.stripe_payment_intent_id) {
        return json({ error: 'Este cobro no tiene una transacción conciliada para reembolsar' }, 409);
    }
    await withOrgTx(orgId, sql`
        insert into cobro_reembolsos
          (id, org_id, cobro_id, amount_cents, status, reason, requested_by)
        values (${nonce.id}, ${orgId}, ${cobroId}, ${parsed.data.amountCents}, 'pending',
                ${parsed.data.reason || null}, ${currentUserId()})`);

    try {
        const refund = await stripe('/v1/refunds', {
            payment_intent: String(cobro.stripe_payment_intent_id),
            amount: String(parsed.data.amountCents),
            reason: 'requested_by_customer',
            refund_application_fee: 'false',
            'metadata[cobro_id]': cobroId,
            'metadata[org_id]': orgId,
        }, 'POST', {
            stripeAccount: String(cobro.stripe_account_id),
            idempotencyKey: `refund-${nonceHash}`,
        });
        await withOrgTx(orgId, sql`
            update cobro_reembolsos set stripe_refund_id = ${refund.id},
                   status = ${refund.status || 'pending'}, updated_at = now()
             where id = ${nonce.id} and org_id = ${orgId}`);
        await logAudit(orgId, { accion: 'cord_pagos.reembolso_solicitado', entidad: 'cobro', entidad_id: cobroId, detalle: auditDetail, ip: reqIp(request) });
        return json({ ok: true, status: refund.status || 'pending', refundId: refund.id }, 202);
    } catch (error) {
        const safe = merchantError(error);
        await withOrgTx(orgId, sql`
            update cobro_reembolsos set status = 'failed', failure_reason = ${safe.reference}, updated_at = now()
             where id = ${nonce.id} and org_id = ${orgId}`);
        console.error('[refund] proveedor rechazó operación', { orgId, cobroId, reference: safe.reference });
        return json({ error: safe.message, reference: safe.reference }, 502);
    }
};

function json(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

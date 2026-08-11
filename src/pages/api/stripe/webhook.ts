// POST /api/stripe/webhook — Stripe avisa de pagos, altas y CAMBIOS DE PLAN.
// Verifica la firma con STRIPE_WEBHOOK_SECRET (HMAC, sin SDK) y sincroniza Neon
// en tiempo real. Configura el endpoint en el dashboard de Stripe apuntando a
// https://cordhq.app/api/stripe/webhook con estos eventos:
//   • checkout.session.completed
//   • customer.subscription.created / .updated / .deleted
//   • invoice.paid / invoice.payment_failed
//   • payment_intent.succeeded / .payment_failed
export const prerender = false;

import type { APIRoute } from 'astro';
import { randomUUID } from 'node:crypto';
import { sql, logAudit, withOrgTx } from '../../../lib/db';
import { dispatchQuoteEvent, dispatchPaymentPartial } from '../../../lib/webhooks';
import { PRICE_TO_PLAN, isPaidPlan, stripe } from '../../../lib/billing';
import { trackPaymentReceived, trackServer } from '../../../lib/posthog-server';
import { after } from '../../../lib/after';
import { verifyStripeSignature } from '../../../lib/stripe-signature';
import { sanitizeStripeRequirements } from '../../../lib/connect-fields';
import { sendOpsAlert } from '../../../lib/ops-alert';
import { sendEmail, siteOrigin } from '../../../lib/email';
import { computeSubscriptionFee } from '../../../lib/fees';

const WH_SECRET = import.meta.env.STRIPE_WEBHOOK_SECRET || process.env.STRIPE_WEBHOOK_SECRET;
const CONNECT_WH_SECRET = import.meta.env.STRIPE_CONNECT_WEBHOOK_SECRET || process.env.STRIPE_CONNECT_WEBHOOK_SECRET;

export const POST: APIRoute = async ({ request }) => {
    const raw = await request.text();
    let signatureSource: 'billing' | 'connect' | null = null;

    if ((!WH_SECRET && !CONNECT_WH_SECRET) && process.env.VERCEL) {
        return new Response('webhook mal configurado (falta secret)', { status: 500 });
    }
    if (WH_SECRET || CONNECT_WH_SECRET) {
        const sig = request.headers.get('stripe-signature') || '';
        let valid = false;
        if (WH_SECRET && verifyStripeSignature(raw, sig, WH_SECRET as string)) {
            valid = true;
            signatureSource = 'billing';
        }
        if (!valid && CONNECT_WH_SECRET && verifyStripeSignature(raw, sig, CONNECT_WH_SECRET as string)) {
            valid = true;
            signatureSource = 'connect';
        }
        if (!valid) {
            return new Response('firma inválida', { status: 400 });
        }
    }

    let event: any;
    try { event = JSON.parse(raw); } catch { return new Response('payload inválido', { status: 400 }); }

    if (typeof event?.id !== 'string' || !event.id.startsWith('evt_') || typeof event?.type !== 'string') {
        return new Response('evento inválido', { status: 400 });
    }

    if (signatureSource) {
        // Heartbeat solo de payloads firmados; best-effort, nunca bloquea Stripe.
        await sql`
            insert into platform_health (key, last_success_at, metadata, updated_at)
            values ('stripe_webhook', now(), ${JSON.stringify({ source: signatureSource })}::jsonb, now())
            on conflict (key) do update
            set last_success_at = now(), metadata = excluded.metadata, updated_at = now()`
            .catch(() => null);
    }

    // Claim/commit: una fila solo se considera consumida al terminar todos sus
    // efectos. Un worker que cae a mitad deja un claim recuperable tras 5 min;
    // un error borra su claim para que el siguiente retry de Stripe sí procese.
    let claim: StripeEventClaim;
    try {
        claim = await claimStripeEvent(event.id, event.type);
    } catch (error) {
        console.error('[stripe-webhook] no se pudo reclamar el evento', error);
        return new Response('idempotencia no disponible', { status: 500 });
    }
    if (claim.state === 'processed') return ok();
    if (claim.state === 'in_flight') {
        return new Response('evento en proceso', { status: 409, headers: { 'Retry-After': '300' } });
    }

    try {
        await handleStripeEvent(event);
        const committed = await sql`
            update stripe_events
               set processed_at = now(), claim_token = null, last_error = null
             where id = ${event.id} and claim_token = ${claim.token} and processed_at is null
            returning id`;
        if (!committed.length) throw new Error(`claim perdido para ${event.id}`);
        return ok();
    } catch (error) {
        console.error(`[stripe-webhook] fallo procesando ${event.id} (${event.type})`, error);
        try {
            await sql`delete from stripe_events
                       where id = ${event.id} and claim_token = ${claim.token} and processed_at is null`;
        } catch (cleanupError) {
            console.error(`[stripe-webhook] no se pudo liberar ${event.id}`, cleanupError);
        }
        return new Response('fallo temporal procesando evento', { status: 500 });
    }
};

type StripeEventClaim =
    | { state: 'claimed'; token: string }
    | { state: 'processed' }
    | { state: 'in_flight' };

async function claimStripeEvent(id: string, type: string): Promise<StripeEventClaim> {
    const token = randomUUID();
    const inserted = await sql`
        insert into stripe_events (id, type, claimed_at, claim_token, attempt_count)
        values (${id}, ${type}, now(), ${token}, 1)
        on conflict (id) do nothing
        returning id`;
    if (inserted.length) return { state: 'claimed', token };

    const reclaimed = await sql`
        update stripe_events
           set type = ${type}, claimed_at = now(), claim_token = ${token},
               attempt_count = attempt_count + 1, last_error = null
         where id = ${id}
           and processed_at is null
           and (claimed_at is null or claimed_at < now() - interval '5 minutes')
        returning id`;
    if (reclaimed.length) return { state: 'claimed', token };

    const [existing] = await sql`select processed_at from stripe_events where id = ${id}`;
    return existing?.processed_at ? { state: 'processed' } : { state: 'in_flight' };
}

async function handleStripeEvent(event: any): Promise<void> {
    const obj = event.data?.object ?? {};

    switch (event.type) {
        // ── Pago de una cotización individual ──────────
        case 'checkout.session.completed':
        case 'checkout.session.async_payment_succeeded': {
            if (obj.mode === 'subscription') {
                await linkSubscription(obj);
            } else {
                await markQuotePaid(obj, event.account, event.type);
            }
            break;
        }
        case 'payment_intent.succeeded': {
            await markQuotePaid(obj, event.account, event.type);
            break;
        }
        case 'payment_intent.payment_failed': {
            await markPaymentFailed(obj, event.account);
            break;
        }
        // ── Alta / cambio de plan / renovación ────────────────────────────────
        // ⚠️ `event.account` presente = evento de una CUENTA CONECTADA (iguala
        // recurrente de una cotización, cobrada directo al vendedor). Sin él es un
        // evento de la PLATAFORMA (la suscripción de plan de la propia org en Cord).
        // Nunca confundir ambos: los IDs viven en cuentas de Stripe distintas.
        case 'customer.subscription.created':
        case 'customer.subscription.updated': {
            if (event.account) await syncQuoteSubscription(obj, event.account);
            else await syncSubscription(obj);
            break;
        }
        case 'customer.subscription.deleted': {
            if (event.account) await cancelQuoteSubscription(obj, event.account);
            else await downgradeToFree(obj);
            break;
        }
        // ── Cobros (incluye el excedente medido del periodo) ──────────────────
        case 'invoice.paid': {
            if (event.account) await recurringInvoicePaid(obj, event.account);
            else await setStatusByCustomer(obj.customer, 'active');
            break;
        }
        case 'invoice.payment_failed': {
            if (event.account) await recurringInvoiceFailed(obj, event.account);
            else await setStatusByCustomer(obj.customer, 'past_due');
            break;
        }
        // ── Actualización de cuenta Connect ───────────────────────────────────
        case 'account.updated': {
            await updateAccountStatus(obj);
            break;
        }
        case 'payout.paid':
        case 'payout.failed': {
            await recordPayoutStatus(obj, event.account, event.type);
            break;
        }
        // Los handlers completos se mantienen detrás de funciones explícitas:
        // nunca se confirma silenciosamente un evento financiero desconocido.
        case 'charge.refunded':
        case 'refund.created':
        case 'refund.updated':
        case 'refund.failed': {
            await recordRefundEvent(obj, event.account, event.type);
            break;
        }
        case 'application_fee.created':
        case 'application_fee.refunded':
        case 'application_fee.refund.updated': {
            await recordApplicationFeeEvent(obj, event.type);
            break;
        }
        case 'charge.dispute.created':
        case 'charge.dispute.updated':
        case 'charge.dispute.closed':
        case 'charge.dispute.funds_withdrawn':
        case 'charge.dispute.funds_reinstated': {
            await recordDisputeEvent(obj, event.account, event.type);
            break;
        }
    }
}

async function orgForConnectedAccount(account: string | undefined): Promise<string | null> {
    if (!account) return null;
    const [row] = await sql`select cord_resolve_org_for_connected_account(${account}) as id`;
    return (row?.id as string | undefined) ?? null;
}

async function orgForQuote(quoteId: string, account?: string): Promise<string | null> {
    const [row] = await sql`select cord_resolve_org_for_quote(${quoteId}::uuid, ${account || null}) as id`;
    return (row?.id as string | undefined) ?? null;
}

async function orgForBilling(subscription: string | undefined, customer: string | undefined): Promise<string | null> {
    const [row] = await sql`select cord_resolve_org_for_billing(${subscription || null}, ${customer || null}) as id`;
    return (row?.id as string | undefined) ?? null;
}

async function markPaymentFailed(intent: any, account?: string): Promise<void> {
    const cid = intent?.metadata?.cotizacion_id;
    if (!cid) return;
    const orgId = await orgForQuote(cid, account);
    if (!orgId) return;
    const code = String(intent?.last_payment_error?.code || intent?.last_payment_error?.decline_code || 'payment_failed');
    const cobroId = intent?.metadata?.cobro_id;
    if (cobroId) {
        const [updated] = await withOrgTx(orgId, sql`update cotizacion_cobros
            set payment_failed_at = now(), payment_error_code = ${code}
            where id = ${cobroId} and cotizacion_id = ${cid} and org_id = ${orgId}
            returning id`);
        if (!updated.length) {
            after(sendOpsAlert('Pago fallido sin fila conciliable', `Organización ${orgId}; cotización ${cid}; cobro ${cobroId}`));
        }
    }
    await withOrgTx(orgId, sql`insert into eventos (org_id, cotizacion_id, tipo, detalle)
        values (${orgId}, ${cid}, 'comment', ${`El intento de pago no se completó (ref: ${code})`})`);
    await logAudit(orgId, {
        accion: 'cotizacion.pago_fallido',
        entidad: 'cotizacion',
        entidad_id: cid,
        detalle: `PaymentIntent ${String(intent?.id || '')} (${code})`,
    });
    after(dispatchQuoteEvent(orgId, cid, 'payment.failed'));
}

async function recordPayoutStatus(payout: any, account: string | undefined, eventType: string): Promise<void> {
    const orgId = await orgForConnectedAccount(account);
    if (!orgId) return;
    const amount = Number(payout?.amount ?? 0) / 100;
    const currency = String(payout?.currency || 'mxn').toUpperCase();
    const failed = eventType === 'payout.failed';
    await logAudit(orgId, {
        accion: failed ? 'cord_pagos.deposito_fallido' : 'cord_pagos.deposito_pagado',
        entidad: 'payout',
        entidad_id: String(payout?.id || ''),
        detalle: `${amount.toFixed(2)} ${currency}${failed ? `; ${String(payout?.failure_code || 'sin código')}` : ''}`,
    });
}

async function recordRefundEvent(refundOrCharge: any, account: string | undefined, eventType: string): Promise<void> {
    const orgId = await orgForConnectedAccount(account);
    if (!orgId) return;

    if (eventType === 'charge.refunded') {
        for (const refund of refundOrCharge?.refunds?.data ?? []) {
            await recordRefundEvent(refund, account, 'refund.updated');
        }
        return;
    }

    const refundId = String(refundOrCharge?.id || '');
    if (!refundId.startsWith('re_')) return;
    const chargeId = typeof refundOrCharge?.charge === 'string'
        ? refundOrCharge.charge
        : String(refundOrCharge?.charge?.id || '');
    const paymentIntentId = typeof refundOrCharge?.payment_intent === 'string'
        ? refundOrCharge.payment_intent
        : String(refundOrCharge?.payment_intent?.id || '');
    const [[cobro]] = await withOrgTx(orgId, sql`
        select id from cotizacion_cobros
         where org_id = ${orgId}
           and (stripe_charge_id = ${chargeId} or stripe_payment_intent_id = ${paymentIntentId})
         limit 1`);
    if (!cobro) return;

    const status = eventType === 'refund.failed' ? 'failed' : String(refundOrCharge?.status || 'pending');
    const amount = Math.max(0, Number(refundOrCharge?.amount || 0));
    const currency = String(refundOrCharge?.currency || 'mxn').toUpperCase();
    await withOrgTx(orgId,
        sql`insert into cobro_reembolsos
              (org_id, cobro_id, stripe_refund_id, amount_cents, currency, status, reason, failure_reason, updated_at)
            values (${orgId}, ${cobro.id}, ${refundId}, ${amount}, ${currency}, ${status},
                    ${refundOrCharge?.reason || null}, ${refundOrCharge?.failure_reason || null}, now())
            on conflict (stripe_refund_id) do update set
              status = excluded.status, failure_reason = excluded.failure_reason, updated_at = now()`,
        sql`update cotizacion_cobros c set
              reembolsado_cents = coalesce((select sum(r.amount_cents) from cobro_reembolsos r
                                            where r.cobro_id = c.id and r.status in ('succeeded','pending')), 0),
              reembolso_status = ${status},
              refunded_at = case when ${status} = 'succeeded' then now() else refunded_at end
            where c.id = ${cobro.id} and c.org_id = ${orgId}`,
    );
    await logAudit(orgId, {
        accion: status === 'failed' ? 'cord_pagos.reembolso_fallido' : 'cord_pagos.reembolso_actualizado',
        entidad: 'refund', entidad_id: refundId,
        detalle: `${(amount / 100).toFixed(2)} ${currency}; ${status}`,
    });
}

async function recordDisputeEvent(dispute: any, account: string | undefined, eventType: string): Promise<void> {
    const orgId = await orgForConnectedAccount(account);
    if (!orgId) return;
    const disputeId = String(dispute?.id || '');
    if (!disputeId.startsWith('dp_')) return;
    const chargeId = typeof dispute?.charge === 'string' ? dispute.charge : String(dispute?.charge?.id || '');
    const [[cobro]] = await withOrgTx(orgId, sql`
        select id from cotizacion_cobros
         where org_id = ${orgId} and stripe_charge_id = ${chargeId}
         limit 1`);
    const amount = Math.max(0, Number(dispute?.amount || 0));
    const currency = String(dispute?.currency || 'mxn').toUpperCase();
    const dueAt = dispute?.evidence_details?.due_by
        ? new Date(Number(dispute.evidence_details.due_by) * 1000).toISOString()
        : null;
    const status = String(dispute?.status || eventType.replace('charge.dispute.', ''));
    await withOrgTx(orgId,
        sql`insert into cobro_disputas
              (org_id, cobro_id, stripe_dispute_id, stripe_charge_id, amount_cents, currency,
               reason, status, evidence_due_at, updated_at)
            values (${orgId}, ${cobro?.id || null}, ${disputeId}, ${chargeId || null}, ${amount},
                    ${currency}, ${dispute?.reason || null}, ${status}, ${dueAt}, now())
            on conflict (stripe_dispute_id) do update set
              cobro_id = coalesce(cobro_disputas.cobro_id, excluded.cobro_id),
              status = excluded.status, reason = excluded.reason,
              evidence_due_at = excluded.evidence_due_at, updated_at = now()`,
        ...(eventType === 'charge.dispute.created'
            ? [sql`insert into tareas (org_id, titulo, due_date)
                    values (${orgId}, ${`Responder contracargo ${(amount / 100).toFixed(2)} ${currency}`},
                            ${dueAt ? dueAt.slice(0, 10) : null})`]
            : []),
    );
    await logAudit(orgId, {
        accion: eventType === 'charge.dispute.created' ? 'cord_pagos.disputa_creada' : 'cord_pagos.disputa_actualizada',
        entidad: 'dispute',
        entidad_id: disputeId,
        detalle: `${(amount / 100).toFixed(2)} ${currency}; ${status}`,
    });
    if (eventType === 'charge.dispute.created') {
        const amountText = `${(amount / 100).toFixed(2)} ${currency}`;
        after(sendOpsAlert('Contracargo nuevo', `${amountText}; organización ${orgId}; referencia ${disputeId}`));
        const [[owner]] = await withOrgTx(orgId, sql`
            select u.email, o.nombre from orgs o join users u on u.id = o.owner_id
             where o.id = ${orgId} limit 1`);
        if (owner?.email) {
            after(sendEmail({
                to: owner.email as string,
                subject: `Acción requerida: contracargo por ${amountText}`,
                html: `<p>Recibiste un contracargo por <strong>${amountText}</strong>.</p><p>Prepara y revisa la evidencia antes de la fecha límite.</p><p><a href="${siteOrigin()}/app/cobros">Abrir Cord Pagos</a></p>`,
                orgId, operation: 'dispute_created', fromName: owner.nombre as string,
            }));
        }
    }
}

async function recordApplicationFeeEvent(fee: any, eventType: string): Promise<void> {
    // application_fee.refund.updated entrega un ApplicationFeeRefund, que no
    // incluye la cuenta conectada. Resolver primero su ApplicationFee padre.
    const parent = eventType === 'application_fee.refund.updated' && fee?.fee
        ? await stripe(`/v1/application_fees/${String(fee.fee)}`, undefined, 'GET')
        : fee;
    const feeId = String(parent?.id || fee?.fee || '');
    if (!feeId) return;
    const accountId = typeof parent?.account === 'string' ? parent.account : String(parent?.account?.id || '');
    const orgId = await orgForConnectedAccount(accountId);
    if (!orgId) return;
    const refunded = Math.max(0, Number(parent?.amount_refunded ?? fee?.amount ?? 0) || 0);
    const [updated] = await withOrgTx(orgId, sql`update comisiones set
        stripe_application_fee_id = coalesce(stripe_application_fee_id, ${feeId}),
        status = ${eventType === 'application_fee.created' ? 'settled' : 'fee_refunded'},
        refunded_cents = case when ${eventType === 'application_fee.created'} then refunded_cents else greatest(refunded_cents, ${refunded}) end,
        updated_at = now()
      where org_id = ${orgId}
        and (stripe_application_fee_id = ${feeId} or stripe_charge_id = ${String(parent?.charge || '')})
      returning id`);
    if (!updated.length) throw new Error(`Comisión no conciliada para ${feeId}`);
}

// Marca la cotización como pagada (flujo de pago en línea por link público o Payment Intent directo).
// `account` = event.account de Stripe (la cuenta CONECTADA del dueño en charges
// directas). Se valida contra la org de la cotización para que un merchant
// conectado no pueda marcar pagada una cotización de OTRA org.
async function markQuotePaid(sessionOrIntent: any, account?: string, eventType?: string) {
    const cid = sessionOrIntent?.metadata?.cotizacion_id;
    if (!cid) return;

    // Diferenciar entre CheckoutSession y PaymentIntent
    if (eventType === 'payment_intent.succeeded') {
        if (sessionOrIntent.status !== 'succeeded') return;
    } else {
        // CheckoutSession: Métodos diferidos (SPEI/customer_balance) llegan con payment_status 'unpaid'
        const ps = sessionOrIntent?.payment_status;
        if (ps && ps !== 'paid' && ps !== 'no_payment_required') return;
    }

    const orgId = await orgForQuote(cid, account);
    if (!orgId) return;
    const [rows] = await withOrgTx(orgId, sql`select c.id, c.org_id, c.status,
        o.stripe_account_id as acct, (o.sandbox_of is not null) as is_sandbox, o.is_demo
        from cotizaciones c join orgs o on o.id = c.org_id
        where c.id = ${cid} and c.org_id = ${orgId}`);
    // La conciliación de cobros parciales corre INCLUSO si la cotización ya está
    // 'paid' (un SPEI en vuelo puede liquidarse después de un pago manual — el
    // dinero llegó y debe quedar registrado); el flip a 'paid' solo aplica desde
    // approved/invoiced (el UPDATE de abajo ya lo garantiza).
    const puedeConciliarCobro = !!(sessionOrIntent?.metadata?.cobro_id) && rows.length && rows[0].status === 'paid';
    if (rows.length && (['approved', 'invoiced'].includes(rows[0].status as string) || puedeConciliarCobro)) {
        let paymentMethod = 'tarjeta';
        if (eventType === 'checkout.session.async_payment_succeeded') {
            paymentMethod = 'spei';
        } else if (eventType === 'payment_intent.succeeded') {
            // En versiones nuevas de la API el PaymentIntent ya NO trae `charges`
            // embebido (solo `latest_charge` como id) — se consulta el charge en la
            // cuenta conectada para saber el método real. Fallback: 'tarjeta'.
            let type = sessionOrIntent?.charges?.data?.[0]?.payment_method_details?.type;
            const latest = sessionOrIntent?.latest_charge;
            if (!type && latest) {
                try {
                    const chargeId = typeof latest === 'string' ? latest : latest?.id;
                    if (chargeId) {
                        const ch = await stripe(`/v1/charges/${chargeId}`, undefined, 'GET',
                            account ? { stripeAccount: account } : undefined);
                        type = ch?.payment_method_details?.type;
                    }
                } catch { /* best-effort: se queda 'tarjeta' */ }
            }
            if (type === 'customer_balance') paymentMethod = 'spei';
        } else if (sessionOrIntent?.payment_method_types?.length === 1 && sessionOrIntent?.payment_method_types?.[0] === 'customer_balance') {
            paymentMethod = 'spei';
        }

        const cobroId = sessionOrIntent?.metadata?.cobro_id as string | undefined;

        if (cobroId && eventType === 'payment_intent.succeeded') {
            await reconcilePaymentIntent(orgId, cobroId, sessionOrIntent, account, paymentMethod);
        }

        if (cobroId) {
            // ── Cobros parciales (anticipo/saldo/cuota/total v2) ──────────────
            // 1) Marcar este cobro como pagado. Acepta también 'cancelado': un PI
            // en vuelo (CLABE SPEI ya emitida) puede liquidarse DESPUÉS de que el
            // cobro se canceló (pago manual del vendedor, plan de cuotas que lo
            // reemplazó) — el dinero llegó de todos modos y hay que registrarlo.
            const [marked] = await withOrgTx(orgId, sql`
                update cotizacion_cobros
                set status = 'pagado', paid_at = now(), payment_method = ${paymentMethod}
                where id = ${cobroId} and org_id = ${orgId} and cotizacion_id = ${cid}
                  and status in ('pendiente', 'cancelado')
                returning tipo, numero_cuota, monto`);

            if (!marked.length) {
                // Cobro inexistente o ya pagado. Si ya está 'pagado' es una
                // redelivery de Stripe (idempotente, nada que hacer). Si la fila
                // no existe, el dinero llegó sin cobro que lo respalde: dejar
                // rastro para conciliación manual, sin flip automático.
                const [existe] = await withOrgTx(orgId, sql`
                    select 1 from cotizacion_cobros where id = ${cobroId} and org_id = ${orgId}`);
                if (!existe.length) {
                    const monto = Number(sessionOrIntent?.amount ?? 0) / 100;
                    await withOrgTx(orgId, sql`insert into eventos (org_id, cotizacion_id, tipo, detalle)
                        values (${orgId}, ${cid}, 'paid', ${`Pago de $${monto.toFixed(2)} recibido para un cobro ya no vigente; revisar conciliación`})`);
                    await logAudit(orgId, { accion: 'cotizacion.pago_no_conciliado', entidad: 'cotizacion', entidad_id: cid, detalle: `PI ${sessionOrIntent?.id ?? ''} sin cobro vigente` });
                    after(sendOpsAlert('Pago sin fila conciliable', `Organización ${orgId}; cotización ${cid}; cobro ${cobroId}`));
                }
                return;
            }

            // 2) Si lo pagado ya cubre el total (p. ej. se liquidó el saldo
            // original después de que un plan de cuotas lo había reemplazado),
            // los cobros pendientes restantes se cancelan — ya no hay nada que deber.
            const [[sums]] = await withOrgTx(orgId, sql`
                select (select coalesce(sum(monto), 0) from cotizacion_cobros
                        where org_id = ${orgId} and cotizacion_id = ${cid} and status = 'pagado') as pagado,
                       total
                from cotizaciones where id = ${cid} and org_id = ${orgId}`);
            if (sums && Number(sums.pagado) >= Number(sums.total) - 0.01) {
                await withOrgTx(orgId, sql`update cotizacion_cobros set status = 'cancelado'
                    where org_id = ${orgId} and cotizacion_id = ${cid} and status = 'pendiente'`);
            }

            // 3) Flip atómico e idempotente: la cotización pasa a 'paid' SOLO si ya
            // no queda ningún cobro pendiente. Se corre en cada pago de cobro; el
            // que caiga al último (por orden de commit) es el que la salda.
            const [flipped] = await withOrgTx(orgId, sql`
                update cotizaciones
                set status = 'paid', paid_at = now(), payment_method = ${paymentMethod}
                where id = ${cid} and org_id = ${orgId} and status in ('approved', 'invoiced')
                  and not exists (
                      select 1 from cotizacion_cobros
                      where org_id = ${orgId} and cotizacion_id = ${cid} and status = 'pendiente')
                returning id`);

            const amountPaid = Number(sessionOrIntent?.amount ?? 0) / 100;
            const currency = (sessionOrIntent?.currency ?? 'MXN').toUpperCase();

            if (flipped.length) {
                await withOrgTx(orgId, sql`insert into eventos (org_id, cotizacion_id, tipo, detalle)
                    values (${orgId}, ${cid}, 'paid', 'Pago recibido con Cord Pagos; cotización saldada')`);
                await logAudit(orgId, { accion: 'cotizacion.paid', entidad: 'cotizacion', entidad_id: cid, detalle: 'Pago en línea con Cord Pagos' });
                await trackPaymentReceived(orgId, amountPaid, currency, paymentMethod, false, cid, !!rows[0].is_sandbox, !!rows[0].is_demo);
                after(dispatchQuoteEvent(orgId, cid, 'quote.paid'));
            } else if (marked.length) {
                // Pago PARCIAL: evento informativo, sin quote.paid (avisar a las
                // integraciones que "se pagó todo" cuando solo cayó el anticipo
                // sería mentirles).
                const co = marked[0];
                const label = co.tipo === 'anticipo' ? 'Anticipo'
                    : co.tipo === 'saldo' ? 'Saldo'
                    : co.tipo === 'cuota' ? `Cuota ${co.numero_cuota}`
                    : 'Pago';
                const monto = Number(co.monto).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
                const sufijo = rows[0].status === 'paid' ? ' (la cotización ya estaba marcada como pagada — verificar)' : ' — saldo pendiente';
                await withOrgTx(orgId, sql`insert into eventos (org_id, cotizacion_id, tipo, detalle)
                    values (${orgId}, ${cid}, 'paid', ${`${label} de ${monto} pagado con Cord Pagos${sufijo}`})`);
                await logAudit(orgId, { accion: 'cotizacion.cobro_pagado', entidad: 'cotizacion', entidad_id: cid, detalle: `${label} pagado en línea con Cord Pagos` });
                await trackPaymentReceived(orgId, amountPaid, currency, paymentMethod, false, cid, !!rows[0].is_sandbox, !!rows[0].is_demo);
                // payment.partial: antes NINGÚN webhook avisaba que cayó un
                // anticipo/saldo/cuota — una integración solo se enteraba hasta
                // que el TOTAL quedaba cubierto (quote.paid). `sums` ya refleja
                // el pago recién marcado (se consultó después del UPDATE de arriba).
                after(dispatchPaymentPartial(orgId, cid, {
                    tipo: co.tipo as string,
                    monto: Number(co.monto),
                    numero_cuota: Number(co.numero_cuota ?? 0),
                    saldo_pendiente: Math.max(0, Number(sums.total) - Number(sums.pagado)),
                    payment_method: paymentMethod,
                }));
            }
        } else {
            // ── Legacy: PaymentIntent/Checkout creado antes de los cobros parciales ──
            const [updated] = await withOrgTx(orgId,
                sql`update cotizaciones set status = 'paid', paid_at = now(), payment_method = ${paymentMethod}
                    where id = ${cid} and org_id = ${orgId} returning id`,
                sql`update cotizacion_cobros set status = 'cancelado'
                    where org_id = ${orgId} and cotizacion_id = ${cid} and status = 'pendiente'`,
                sql`insert into eventos (org_id, cotizacion_id, tipo, detalle)
                    values (${orgId}, ${cid}, 'paid', 'Pago recibido con Cord Pagos')`,
            );
            if (!updated.length) throw new Error(`Cotización ${cid} no se actualizó después del pago`);
            await logAudit(orgId, { accion: 'cotizacion.paid', entidad: 'cotizacion', entidad_id: cid, detalle: 'Pago en línea con Cord Pagos' });
            
            const amountPaid = Number(sessionOrIntent?.amount ?? 0) / 100;
            const currency = (sessionOrIntent?.currency ?? 'MXN').toUpperCase();
            await trackPaymentReceived(orgId, amountPaid, currency, paymentMethod, false, cid, !!rows[0].is_sandbox, !!rows[0].is_demo);

            // No demorar el 200 a Stripe con nuestro webhook saliente, pero SIN perderlo:
            // after()/waitUntil mantiene viva la invocación hasta que termine, a
            // diferencia de un `.catch(()=>{})` suelto que Vercel puede congelar en
            // cuanto el handler responde (el evento de dinero más crítico del sistema
            // no puede depender de que la función siga viva por accidente).
            after(dispatchQuoteEvent(orgId, cid, 'quote.paid'));
        }
    }
}

/**
 * Concilia el snapshot calculado al crear el pago contra el cargo y la
 * balance_transaction definitivos. La comisión nunca se recalcula aquí: se
 * preserva lo aceptado por el comercio y se registran los costos reales.
 */
async function reconcilePaymentIntent(
    orgId: string,
    cobroId: string,
    intent: any,
    account: string | undefined,
    fallbackMethod: string,
): Promise<void> {
    const [[cobro]] = await withOrgTx(orgId, sql`
        select id, application_fee_cents, fee_base_cents, fee_iva_cents, fee_total_cents
          from cotizacion_cobros
         where id = ${cobroId} and org_id = ${orgId}
         limit 1`);
    if (!cobro) return;

    const chargeId = typeof intent?.latest_charge === 'string'
        ? intent.latest_charge
        : String(intent?.latest_charge?.id || intent?.charges?.data?.[0]?.id || '');
    if (!chargeId) throw new Error(`PaymentIntent ${String(intent?.id || '')} sin cargo conciliable`);

    const charge = await stripe(`/v1/charges/${chargeId}`, {
        'expand[0]': 'balance_transaction',
        'expand[1]': 'application_fee',
    }, 'GET', account ? { stripeAccount: account } : undefined);
    const bt = typeof charge?.balance_transaction === 'object' ? charge.balance_transaction : null;
    const applicationFee = charge?.application_fee;
    const applicationFeeId = typeof applicationFee === 'string' ? applicationFee : String(applicationFee?.id || '');
    const applicationFeeCents = Number(applicationFee?.amount ?? cobro.application_fee_cents ?? 0);
    const feeDetails = Array.isArray(bt?.fee_details) ? bt.fee_details : [];
    const processorFromDetails = feeDetails
        .filter((detail: any) => detail?.type === 'stripe_fee')
        .reduce((sum: number, detail: any) => sum + Number(detail?.amount || 0), 0);
    const processorFeeCents = processorFromDetails || Math.max(0, Number(bt?.fee || 0) - applicationFeeCents);
    const methodType = String(charge?.payment_method_details?.type || '');
    const method = methodType === 'customer_balance' ? 'spei' : fallbackMethod;
    const amountCents = Math.max(0, Number(charge?.amount || intent?.amount_received || intent?.amount || 0));
    const currency = String(charge?.currency || intent?.currency || 'mxn').toUpperCase();
    const netCents = bt ? Number(bt.net || 0) : amountCents - processorFeeCents - applicationFeeCents;
    const status = bt ? 'settled' : 'pending';

    await withOrgTx(orgId,
        sql`update cotizacion_cobros set
              metodo_pago = ${method}, payment_method = ${method},
              stripe_charge_id = ${chargeId},
              stripe_balance_transaction_id = ${bt?.id || null},
              stripe_application_fee_id = ${applicationFeeId || null},
              stripe_fee_cents = ${processorFeeCents},
              application_fee_cents = ${applicationFeeCents},
              neto_cents = ${netCents}
            where id = ${cobroId} and org_id = ${orgId}`,
        sql`insert into comisiones
              (org_id, cobro_id, stripe_payment_intent_id, stripe_charge_id,
               stripe_balance_transaction_id, stripe_application_fee_id, metodo_pago,
               moneda, monto_cents, fee_base_cents, fee_iva_cents, fee_total_cents,
               stripe_fee_cents, neto_vendedor_cents, status, updated_at)
            values (${orgId}, ${cobroId}, ${String(intent.id)}, ${chargeId}, ${bt?.id || null},
                    ${applicationFeeId || null}, ${method}, ${currency}, ${amountCents},
                    ${Number(cobro.fee_base_cents || 0)}, ${Number(cobro.fee_iva_cents || 0)},
                    ${applicationFeeCents}, ${processorFeeCents}, ${netCents}, ${status}, now())
            on conflict (org_id, stripe_payment_intent_id) do update set
              stripe_charge_id = excluded.stripe_charge_id,
              stripe_balance_transaction_id = excluded.stripe_balance_transaction_id,
              stripe_application_fee_id = excluded.stripe_application_fee_id,
              metodo_pago = excluded.metodo_pago,
              stripe_fee_cents = excluded.stripe_fee_cents,
              neto_vendedor_cents = excluded.neto_vendedor_cents,
              status = excluded.status,
              updated_at = now()`,
    );
}

// Liga la suscripción recién creada a la org (del metadata del checkout).
async function linkSubscription(session: any) {
    const orgId = session?.metadata?.org_id;
    if (orgId && session.subscription) {
        const [updated] = await withOrgTx(orgId, sql`update orgs set stripe_subscription_id = ${session.subscription},
            stripe_customer_id = coalesce(stripe_customer_id, ${session.customer})
            where id = ${orgId} returning id`);
        if (!updated.length) throw new Error(`No se pudo ligar la suscripción a la organización ${orgId}`);
    }
}

// Resuelve el plan desde los items de la suscripción (o el metadata).
function planOf(sub: any): string {
    const metaPlan = sub?.metadata?.plan;
    if (metaPlan && isPaidPlan(metaPlan)) return metaPlan;
    for (const item of sub?.items?.data ?? []) {
        const p = PRICE_TO_PLAN[item?.price?.id];
        if (p) return p;
    }
    return 'free';
}

// Ranking de planes para distinguir upgrade vs downgrade en PostHog — orden
// real de negocio (ver docs/negocio-billing.md), no alfabético.
const PLAN_RANK: Record<string, number> = { free: 0, starter: 1, pro: 2, scale: 3, developer: 4 };

// Sincroniza plan / estado / fin de ciclo. ESTE es el "cambio de plan en vivo".
async function syncSubscription(sub: any) {
    const plan = planOf(sub);
    const status = (sub.status as string) || 'active';
    const cycle = sub?.metadata?.cycle || (sub?.items?.data?.[0]?.price?.recurring?.interval === 'year' ? 'anual' : 'mensual');
    // En la API "Basil" (2025-06-30+) Stripe MOVIÓ current_period_end del objeto
    // Subscription raíz a cada item — se lee del item como fallback para que la
    // fecha de renovación no quede en null según la versión con que llegue el evento.
    const rawPeriodEnd = sub.current_period_end ?? sub?.items?.data?.[0]?.current_period_end;
    const periodEnd = rawPeriodEnd ? Number(rawPeriodEnd) : null;

    // Localiza la org por subscription_id o por customer_id. De paso trae el
    // plan/flags ACTUALES (antes del UPDATE) para poder distinguir upgrade de
    // downgrade en PostHog sin una segunda query.
    const orgId = await orgForBilling(sub?.id, typeof sub?.customer === 'string' ? sub.customer : sub?.customer?.id);
    if (!orgId) return;
    const [rows] = await withOrgTx(orgId, sql`select id, plan as prev_plan, (sandbox_of is not null) as is_sandbox, is_demo
        from orgs where id = ${orgId} limit 1`);
    if (!rows.length) return;
    const prevPlan = (rows[0].prev_plan as string) || 'free';
    const isSandbox = !!rows[0].is_sandbox;
    const isDemo = !!rows[0].is_demo;

    // El plan SOLO se otorga cuando la suscripción está pagada/vigente. Con el
    // Payment Element la suscripción nace `incomplete` (antes de pagar): en ese
    // estado NO se debe upgradear el plan — se hace al llegar `active` (vía
    // invoice.paid / subscription.updated). El resto de campos sí se sincroniza.
    const grantsPlan = status === 'active' || status === 'trialing' || status === 'past_due';

    if (grantsPlan) {
        const [updated] = await withOrgTx(orgId, sql`update orgs set
                    plan = ${plan},
                    subscription_status = ${status},
                    billing_cycle = ${cycle},
                    stripe_subscription_id = ${sub.id},
                    stripe_customer_id = coalesce(stripe_customer_id, ${sub.customer}),
                    current_period_end = ${periodEnd ? new Date(periodEnd * 1000).toISOString() : null}
                  where id = ${orgId} returning id`);
        if (!updated.length) throw new Error(`Plan no actualizado para organización ${orgId}`);
    } else {
        const [updated] = await withOrgTx(orgId, sql`update orgs set
                    subscription_status = ${status},
                    billing_cycle = ${cycle},
                    stripe_subscription_id = ${sub.id},
                    stripe_customer_id = coalesce(stripe_customer_id, ${sub.customer}),
                    current_period_end = ${periodEnd ? new Date(periodEnd * 1000).toISOString() : null}
                  where id = ${orgId} returning id`);
        if (!updated.length) throw new Error(`Suscripción no actualizada para organización ${orgId}`);
    }
    await logAudit(orgId, { accion: 'billing.plan_sync', entidad: 'org', entidad_id: orgId, detalle: `Plan ${grantsPlan ? plan : '(sin cambio)'} (${status})` });

    // Solo dispara cuando el plan efectivo REALMENTE cambió (no en cada renovación
    // mensual que reconfirma el mismo plan).
    if (grantsPlan && plan !== prevPlan) {
        const upgraded = (PLAN_RANK[plan] ?? 0) > (PLAN_RANK[prevPlan] ?? 0);
        await trackServer(upgraded ? 'subscription_upgraded' : 'subscription_downgraded', orgId, {
            from_plan: prevPlan,
            to_plan: plan,
            cycle,
        }, isSandbox, isDemo);
    }
}

// Cancelación → vuelve a Gratis.
async function downgradeToFree(sub: any) {
    const orgId = await orgForBilling(sub?.id, typeof sub?.customer === 'string' ? sub.customer : sub?.customer?.id);
    if (!orgId) return;
    const [rows] = await withOrgTx(orgId, sql`select id, plan, created_at, (sandbox_of is not null) as is_sandbox, is_demo
        from orgs where id = ${orgId} limit 1`);
    if (!rows.length) return;
    const prevPlan = (rows[0].plan as string) || 'free';
    const [updated] = await withOrgTx(orgId, sql`update orgs set plan = 'free', subscription_status = 'canceled', stripe_subscription_id = null
        where id = ${orgId} returning id`);
    if (!updated.length) throw new Error(`Cancelación no aplicada a organización ${orgId}`);
    await logAudit(orgId, { accion: 'billing.canceled', entidad: 'org', entidad_id: orgId, detalle: 'Suscripción cancelada → Gratis' });
    const tenureDays = rows[0].created_at ? Math.max(0, Math.round((Date.now() - new Date(rows[0].created_at as string).getTime()) / 86400000)) : null;
    await trackServer('subscription_canceled', orgId, {
        plan: prevPlan,
        tenure_days: tenureDays,
    }, !!rows[0].is_sandbox, !!rows[0].is_demo);
}

async function setStatusByCustomer(customer: string | undefined, status: string) {
    if (!customer) return;
    const orgId = await orgForBilling(undefined, customer);
    if (!orgId) return;
    const [rows, updated] = await withOrgTx(orgId,
        sql`select id, (sandbox_of is not null) as is_sandbox, is_demo from orgs where id = ${orgId} limit 1`,
        sql`update orgs set subscription_status = ${status} where id = ${orgId} returning id`);
    if (!updated.length) throw new Error(`Estado de suscripción no actualizado para organización ${orgId}`);
    if (status === 'past_due' && rows.length) {
        await trackServer('payment_failed', rows[0].id as string, { context: 'subscription' }, !!rows[0].is_sandbox, !!rows[0].is_demo);
    }
}

async function updateAccountStatus(account: any) {
    if (!account.id) return;
    const orgId = await orgForConnectedAccount(account.id);
    if (!orgId) return;
    const chargesEnabled = !!account.charges_enabled;
    const payoutsEnabled = !!account.payouts_enabled;
    const detailsSubmitted = !!account.details_submitted;
    const disabledReason = account.requirements?.disabled_reason || null;
    const requirements = JSON.stringify(sanitizeStripeRequirements(account.requirements));
    // Estado ANTES del update — para detectar el flip false→true (primera vez
    // que la org puede cobrar de verdad), no cada re-confirmación del webhook.
    const [before, updated] = await withOrgTx(orgId,
        sql`select id, created_at, stripe_charges_enabled, (sandbox_of is not null) as is_sandbox, is_demo
            from orgs where id = ${orgId} limit 1`,
        sql`update orgs set
            stripe_charges_enabled = ${chargesEnabled},
            stripe_payouts_enabled = ${payoutsEnabled},
            stripe_details_submitted = ${detailsSubmitted},
            stripe_disabled_reason = ${disabledReason},
            stripe_requirements = ${requirements}
            where id = ${orgId} returning id`);
    if (!updated.length) throw new Error(`Cuenta de cobros no actualizada para organización ${orgId}`);

    if (before.length && chargesEnabled && !before[0].stripe_charges_enabled) {
        const orgId = before[0].id as string;
        const timeSinceCreated = before[0].created_at ? Math.max(0, Math.round((Date.now() - new Date(before[0].created_at as string).getTime()) / 86400000)) : null;
        await trackServer('stripe_connect_activated', orgId, {
            time_since_org_created_days: timeSinceCreated,
        }, !!before[0].is_sandbox, !!before[0].is_demo);
    }
}

// ── Igualas recurrentes (Subscriptions sobre cuentas CONECTADAS) ─────────────
// Estos handlers SOLO corren para eventos con `event.account` (cuenta conectada).
// La fila dueña se resuelve por stripe_subscription_id; se valida que el evento
// provenga de la MISMA cuenta conectada (defensa multi-tenant, como markQuotePaid).

const money = (n: number) => Number(n).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });

// El id de la suscripción en una factura: `invoice.subscription` (API clásica) o
// `invoice.parent.subscription_details.subscription` (Basil 2025-06-30+, donde se movió).
function invoiceSubId(invoice: any): string {
    const s = invoice?.subscription ?? invoice?.parent?.subscription_details?.subscription;
    return typeof s === 'string' ? s : (s?.id ?? '');
}

async function findQuoteSub(subId: string, account: string) {
    if (!subId) return null;
    const [resolved] = await sql`select cord_resolve_org_for_quote_subscription(${subId}, ${account}) as id`;
    const orgId = resolved?.id as string | undefined;
    if (!orgId) return null;
    const [rows] = await withOrgTx(orgId, sql`
        select * from cotizacion_suscripciones
        where org_id = ${orgId} and stripe_subscription_id = ${subId} and stripe_account_id = ${account}`);
    if (!rows.length) return null;
    return rows[0];
}

// Factura mensual pagada (primera autorización + cada renovación). Marca la
// suscripción activa, registra el pago en la bitácora y avisa a integraciones.
async function recurringInvoicePaid(invoice: any, account: string) {
    const subId = invoiceSubId(invoice);
    const row = await findQuoteSub(subId, account);
    if (!row) return;
    const periodEnd = invoice?.lines?.data?.[0]?.period?.end;
    const orgId = row.org_id as string;
    const [updated] = await withOrgTx(orgId, sql`update cotizacion_suscripciones set
        estado = 'active', current_period_end = ${periodEnd ? new Date(periodEnd * 1000).toISOString() : null}
        where id = ${row.id} and org_id = ${orgId} returning id`);
    if (!updated.length) throw new Error(`Iguala ${row.id} no se actualizó después del pago`);
    // Basil retiró invoice.payment_intent. La relación vive ahora en
    // payments.data.payment.payment_intent y requiere expansión explícita.
    let pi: any = invoice?.payment_intent || null;
    if (!pi && invoice?.id) {
        const detailed = await stripe(`/v1/invoices/${invoice.id}`, {
            'expand[0]': 'payments.data.payment.payment_intent',
        }, 'GET', { stripeAccount: account });
        const paid = (detailed?.payments?.data || []).find((entry: any) =>
            entry?.status === 'paid' && entry?.payment?.type === 'payment_intent' && entry?.payment?.payment_intent,
        );
        pi = paid?.payment?.payment_intent || null;
    }
    const piId = typeof pi === 'string' ? pi : String(pi?.id || '');
    if (!piId) throw new Error(`Factura recurrente ${String(invoice?.id || '')} sin PaymentIntent conciliable`);

    const montoNum = Number(invoice?.amount_paid ?? pi?.amount_received ?? pi?.amount ?? 0) / 100;
    const monto = money(montoNum);

    // Registra el cobro mensual como fila 'pagado' en cotizacion_cobros para que
    // el dinero SÍ aparezca en el dashboard "Mi dinero" (getCobros). No dispara el
    // flip a 'paid' de la cotización (eso solo ocurre vía markQuotePaid, que aquí
    // no corre) y se OCULTA del link público (getCotizacionByToken lo excluye para
    // igualas). Idempotente: dedup por el PaymentIntent de la factura.
    if (piId && montoNum > 0) {
        try {
            const amountCents = Math.round(montoNum * 100);
            const fee = computeSubscriptionFee(amountCents, row.application_fee_percent != null);
            const [created] = await withOrgTx(orgId, sql`
                insert into cotizacion_cobros
                    (org_id, cotizacion_id, tipo, numero_cuota, monto, status, payment_method,
                     paid_at, stripe_payment_intent_id, vence, metodo_pago,
                     application_fee_cents, fee_base_cents, fee_iva_cents, fee_total_cents)
                select ${row.org_id}, ${row.cotizacion_id}, 'cuota',
                       coalesce((select max(numero_cuota) from cotizacion_cobros where org_id = ${orgId} and cotizacion_id = ${row.cotizacion_id} and tipo = 'cuota'), 0) + 1,
                       ${montoNum}, 'pagado', 'tarjeta', now(), ${piId}, current_date, 'tarjeta',
                       ${fee.applicationFeeCents}, ${fee.feeBaseCents}, ${fee.feeIvaCents}, ${fee.applicationFeeCents}
                on conflict (org_id, stripe_payment_intent_id) where stripe_payment_intent_id is not null do nothing
                returning id`);
            if (created.length) {
                const intent = typeof pi === 'object' && pi?.latest_charge
                    ? pi
                    : await stripe(`/v1/payment_intents/${piId}`, { 'expand[0]': 'latest_charge' }, 'GET', { stripeAccount: account });
                await reconcilePaymentIntent(orgId, created[0].id as string, intent, account, 'tarjeta');
            }
        } catch (error) {
            after(sendOpsAlert('Iguala cobrada sin conciliación completa', `Organización ${orgId}; PaymentIntent ${piId}; ${error instanceof Error ? error.message : 'error desconocido'}`));
            throw error;
        }
    }

    await withOrgTx(orgId, sql`insert into eventos (org_id, cotizacion_id, tipo, detalle)
        values (${orgId}, ${row.cotizacion_id}, 'paid', ${`Cobro mensual de ${monto} recibido (iguala)`})`);
    await logAudit(orgId, { accion: 'cotizacion.iguala_cobrada', entidad: 'cotizacion', entidad_id: row.cotizacion_id as string, detalle: `Cobro recurrente ${monto} con Cord Pagos` });
    
    const currency = (invoice?.currency ?? 'MXN').toUpperCase();
    const [[orgFlags]] = await withOrgTx(orgId, sql`select (sandbox_of is not null) as is_sandbox, is_demo from orgs where id = ${orgId}`);
    await trackPaymentReceived(orgId, montoNum, currency, 'tarjeta', true, row.cotizacion_id as string, !!orgFlags?.is_sandbox, !!orgFlags?.is_demo);
    
    // Cada cobro mensual exitoso es un "Pago recibido" real para las integraciones.
    // after()/waitUntil — no perderlo si Vercel congela la invocación tras el 200.
    after(dispatchQuoteEvent(row.org_id as string, row.cotizacion_id as string, 'quote.paid'));
}

async function recurringInvoiceFailed(invoice: any, account: string) {
    const subId = invoiceSubId(invoice);
    const row = await findQuoteSub(subId, account);
    if (!row) return;
    const orgId = row.org_id as string;
    const [updated] = await withOrgTx(orgId,
        sql`update cotizacion_suscripciones set estado = 'past_due' where id = ${row.id} and org_id = ${orgId} returning id`,
        sql`insert into eventos (org_id, cotizacion_id, tipo, detalle)
            values (${orgId}, ${row.cotizacion_id}, 'comment', 'El cobro mensual de la iguala falló; la red de pagos volverá a intentarlo')`);
    if (!updated.length) throw new Error(`Iguala ${row.id} no se marcó vencida`);
    // Antes esto no avisaba a NINGUNA integración — un ERP conectado nunca se
    // enteraba de que la iguala dejó de cobrarse hasta que alguien lo notara a mano.
    after(dispatchQuoteEvent(row.org_id as string, row.cotizacion_id as string, 'payment.failed'));
    const [[orgFlags]] = await withOrgTx(orgId, sql`select (sandbox_of is not null) as is_sandbox, is_demo from orgs where id = ${orgId}`);
    await trackServer('payment_failed', orgId, { context: 'iguala', cotizacion_id: row.cotizacion_id }, !!orgFlags?.is_sandbox, !!orgFlags?.is_demo);
}

// customer.subscription.updated/created → sincroniza estado y fin de ciclo.
async function syncQuoteSubscription(sub: any, account: string) {
    const row = await findQuoteSub(sub?.id, account);
    if (!row) return;
    const periodEnd = sub?.current_period_end ?? sub?.items?.data?.[0]?.current_period_end;
    const orgId = row.org_id as string;
    const [updated] = await withOrgTx(orgId, sql`update cotizacion_suscripciones set
                estado = ${sub.status || 'active'},
                cancel_at_period_end = ${!!sub.cancel_at_period_end},
                current_period_end = ${periodEnd ? new Date(Number(periodEnd) * 1000).toISOString() : null}
              where id = ${row.id} and org_id = ${orgId} returning id`);
    if (!updated.length) throw new Error(`Iguala ${row.id} no sincronizada`);
}

// customer.subscription.deleted → la iguala terminó.
async function cancelQuoteSubscription(sub: any, account: string) {
    const row = await findQuoteSub(sub?.id, account);
    if (!row) return;
    const orgId = row.org_id as string;
    const [updated] = await withOrgTx(orgId,
        sql`update cotizacion_suscripciones set estado = 'canceled', cancel_at_period_end = false
            where id = ${row.id} and org_id = ${orgId} returning id`,
        sql`insert into eventos (org_id, cotizacion_id, tipo, detalle)
            values (${orgId}, ${row.cotizacion_id}, 'comment', 'La iguala recurrente se canceló; no habrá más cobros mensuales')`);
    if (!updated.length) throw new Error(`Iguala ${row.id} no cancelada`);
    await logAudit(orgId, { accion: 'cotizacion.iguala_cancelada', entidad: 'cotizacion', entidad_id: row.cotizacion_id as string, detalle: 'Suscripción recurrente cancelada' });
}

function ok() {
    return new Response(JSON.stringify({ received: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

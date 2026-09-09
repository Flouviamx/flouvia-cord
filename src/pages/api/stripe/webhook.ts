// POST /api/stripe/webhook — Stripe avisa de pagos, altas y CAMBIOS DE PLAN.
// Verifica la firma con STRIPE_WEBHOOK_SECRET (HMAC, sin SDK) y sincroniza Neon
// en tiempo real. Configura el endpoint en el dashboard de Stripe apuntando a
// https://cordhq.app/api/stripe/webhook con estos eventos:
//   • checkout.session.completed
//   • customer.subscription.created / .updated / .deleted
//   • invoice.paid / invoice.payment_failed / invoice.payment_action_required
//   • invoice.marked_uncollectible / invoice.voided
//   • payment_intent.succeeded / .payment_failed
export const prerender = false;

import type { APIRoute } from 'astro';
import { randomUUID } from 'node:crypto';
import { sql, logAudit, withOrgTx } from '../../../lib/db';
import { cerrarVeredictoKyc } from '../../../lib/kyc-evidencia';
import { dispatchQuoteEvent, dispatchPaymentPartial, dispatchInvoiceEvent } from '../../../lib/webhooks';
import { notifyQuoteEvent } from '../../../lib/notify';
import { METER_PRICES, PRICE_TO_PLAN, retrieveAccount, stripe } from '../../../lib/billing';
import { trackPaymentReceived, trackServer } from '../../../lib/posthog-server';
import { after } from '../../../lib/after';
import { verifyStripeSignature } from '../../../lib/stripe-signature';
import { sanitizeStripeRequirements } from '../../../lib/connect-fields';
import { sendOpsAlert } from '../../../lib/ops-alert';
import { sendEmail, siteOrigin } from '../../../lib/email';
import { computeSubscriptionFee } from '../../../lib/fees';
import { applyPayment } from '../../../lib/fiscal/payments';
import { recordInvoiceRefund } from '../../../lib/fiscal/reconciliation';
import { reconcileInvoiceCommission } from '../../../lib/invoice-payment-fees';
import { invalidateMoneyCaches } from '../../../lib/queries';
import { fromMinorUnits, normalizeCurrency, toMinorUnits } from '../../../lib/currency';
import { log } from '../../../lib/log';

const WH_SECRET = import.meta.env.STRIPE_WEBHOOK_SECRET || process.env.STRIPE_WEBHOOK_SECRET;
const CONNECT_WH_SECRET = import.meta.env.STRIPE_CONNECT_WEBHOOK_SECRET || process.env.STRIPE_CONNECT_WEBHOOK_SECRET;

export const POST: APIRoute = async ({ request }) => {
    const raw = await request.text();
    let signatureSource: 'billing' | 'connect' | null = null;

    // Sin secreto NO se procesa nada, corra donde corra.
    //
    // Antes el 500 por configuración faltante estaba condicionado a
    // `process.env.VERCEL`, y el bloque de verificación completo a que existiera
    // al menos un secreto. La combinación dejaba una puerta: sin ningún secreto
    // y fuera de Vercel (un contenedor, un preview self-hosted, un runner de
    // pruebas con la base de producción), el handler aceptaba eventos SIN FIRMA
    // y los procesaba como reales — marcar cotizaciones pagadas, conciliar
    // comisiones, mover el ledger. Un webhook de dinero falla cerrado siempre;
    // dónde está desplegado no es parte del contrato de seguridad.
    if (!WH_SECRET && !CONNECT_WH_SECRET) {
        return new Response('webhook mal configurado (falta secret)', { status: 500 });
    }
    {
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

    // ── Cada secreto abre su propio carril, y sólo el suyo ──────────────────
    //
    // Todo el dispatch de abajo decide con `event.account`: presente = cuenta
    // conectada (el dinero del vendedor), ausente = plataforma (la suscripción
    // que la org le paga a Cord). `signatureSource` se calculaba y no se usaba
    // para nada, así que un evento firmado con el secreto de CONNECT y sin
    // `account` entraba directo a los handlers de facturación de la plataforma
    // —`retrieveAndSyncSubscription`, `downgradeToFree`— que conceden y quitan
    // planes.
    //
    // Un endpoint de Connect sólo recibe eventos de cuentas conectadas, y ésos
    // SIEMPRE traen `account`. Exigirlo no rechaza nada legítimo y convierte la
    // separación de secretos en una separación real de privilegios.
    if (signatureSource === 'connect' && !event.account) {
        log.warn('evento firmado con el secreto de Connect sin cuenta asociada', {
            route: 'stripe-webhook', eventId: event.id, tipo: event.type,
        });
        return new Response('evento fuera de carril', { status: 400 });
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
        log.error('no se pudo reclamar el evento', { route: 'stripe-webhook', err: error });
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
        log.error('fallo procesando el evento', { route: 'stripe-webhook', eventId: event.id, eventType: event.type, err: error });
        try {
            await sql`delete from stripe_events
                       where id = ${event.id} and claim_token = ${claim.token} and processed_at is null`;
        } catch (cleanupError) {
            log.error('no se pudo liberar el claim del evento', { route: 'stripe-webhook', eventId: event.id, err: cleanupError });
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
            await markBuildPayment(obj);
            await markQuotePaid(obj, event.account, event.type);
            // Y, por separado, el saldo de la FACTURA. Son dos ledgers: el de
            // la cotización (cotizacion_cobros) y el del documento fiscal.
            await settleInvoiceFromIntent(obj, event.account);
            break;
        }
        case 'payment_intent.payment_failed': {
            await markBuildBidFailed(obj);
            await markPaymentFailed(obj, event.account);
            await failInvoiceFromIntent(obj, event.account);
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
            // Los eventos pueden llegar fuera de orden. Recuperar el objeto actual
            // evita que un payload viejo vuelva a conceder un plan cancelado.
            else await retrieveAndSyncSubscription(obj?.id);
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
            else await syncPaidBillingInvoice(obj);
            break;
        }
        case 'invoice.payment_failed': {
            if (event.account) await recurringInvoiceFailed(obj, event.account);
            else await syncFailedBillingInvoice(obj);
            break;
        }
        case 'invoice.payment_action_required':
        case 'invoice.marked_uncollectible':
        case 'invoice.voided': {
            if (!event.account) await syncFailedBillingInvoice(obj);
            break;
        }
        // ── Actualización de cuenta Connect ───────────────────────────────────
        case 'account.updated': {
            await updateAccountStatus(obj);
            break;
        }
        // ── KYC: personas y capacidades ───────────────────────────────────────
        // Sin estos eventos, el estado de la verificación sólo se refrescaba si
        // alguien abría Ajustes › Cobros. Una identificación rechazada por el
        // proveedor podía quedarse días sin que el negocio se enterara — y el
        // motivo del rechazo no se registraba en ningún lado, así que el usuario
        // volvía a subir la misma foto sin saber por qué fallaba.
        //
        // ⚠️ `person.*` sólo llega en el scope "Connected accounts" del endpoint
        // de webhooks. Si no está seleccionado ahí, estos casos nunca corren.
        case 'person.created':
        case 'person.updated':
        case 'person.deleted': {
            await recordPersonEvent(obj, event.account, event.type);
            break;
        }
        case 'capability.updated': {
            await recordCapabilityEvent(obj, event.account);
            break;
        }
        // El ciclo COMPLETO del depósito, no sólo los dos estados finales: sin
        // `created`/`updated` la tabla no sabía de un depósito en camino, que es
        // justo el que el negocio quiere ver ("¿cuándo me cae?").
        case 'payout.created':
        case 'payout.updated':
        case 'payout.paid':
        case 'payout.failed':
        case 'payout.canceled':
        case 'payout.reconciliation_completed': {
            await recordPayoutStatus(obj, event.account, event.type);
            break;
        }
        // Los handlers completos se mantienen detrás de funciones explícitas:
        // nunca se confirma silenciosamente un evento financiero desconocido.
        case 'charge.refunded':
        case 'refund.created':
        case 'refund.updated':
        case 'refund.failed': {
            if (event.type === 'refund.updated') await syncBuildBidRefund(obj);
            await recordRefundEvent(obj, event.account, event.type, Number(event.created || 0));
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

/** Banderas sandbox/demo de una org — para no meter datos ficticios en dashboards. */
async function orgAnalyticsFlags(orgId: string): Promise<{ isSandbox: boolean; isDemo: boolean }> {
    const [[row]] = await withOrgTx(orgId, sql`
        select (sandbox_of is not null) as is_sandbox, is_demo from orgs where id = ${orgId}`);
    return { isSandbox: !!row?.is_sandbox, isDemo: !!row?.is_demo };
}

async function orgForQuote(quoteId: string, account?: string): Promise<string | null> {
    const [row] = await sql`select cord_resolve_org_for_quote(${quoteId}::uuid, ${account || null}) as id`;
    return (row?.id as string | undefined) ?? null;
}

async function orgForBilling(subscription: string | undefined, customer: string | undefined): Promise<string | null> {
    const [row] = await sql`select cord_resolve_org_for_billing(${subscription || null}, ${customer || null}) as id`;
    return (row?.id as string | undefined) ?? null;
}

/**
 * Aplica un pago exitoso al saldo de una factura.
 *
 * Dos orígenes, un solo camino:
 *   • `metadata.documento_id` — el cliente pagó desde la hosted invoice page.
 *   • `metadata.cotizacion_id` — pagó desde el link de la cotización y esa
 *     cotización ya tiene factura abierta; el saldo del documento tiene que
 *     bajar igual, o el aging seguiría cobrando algo que ya se cobró.
 *
 * Idempotente por PaymentIntent (índice único en documento_pagos): Stripe
 * reintenta sus webhooks por diseño, y sin esa garantía un reintento aplicaría
 * el mismo dinero dos veces.
 */
async function settleInvoiceFromIntent(intent: any, account?: string): Promise<void> {
    const docId = intent?.metadata?.documento_id as string | undefined;
    const quoteId = intent?.metadata?.cotizacion_id as string | undefined;
    if (!docId && !quoteId) return;

    const orgId = docId
        ? await orgForConnectedAccount(account)
        : await orgForQuote(quoteId as string, account);
    if (!orgId) return;

    const currency = normalizeCurrency(String(intent?.currency || 'MXN'));
    const monto = fromMinorUnits(Number(intent?.amount_received ?? intent?.amount ?? 0), currency);
    if (!(monto > 0)) return;

    // Sin documento explícito se busca la factura ABIERTA de esa cotización.
    // Si no hay ninguna, no pasa nada: la cotización se cobró sin facturar.
    let targetId = docId || '';
    if (!targetId) {
        const [rows] = await withOrgTx(orgId, sql`
            select id from documentos_fiscales
             where org_id = ${orgId} and cotizacion_id = ${quoteId}
               and lifecycle = 'open' and credit_note_of is null
               and document_type not in ('credit_note', 'cfdi_egreso')
             order by created_at desc limit 1`);
        if (!rows.length) return;
        targetId = String(rows[0].id);
    }

    const result = await applyPayment(orgId, targetId, {
        monto,
        currency,
        metodo: 'stripe',
        stripePaymentIntentId: String(intent?.id || ''),
        referencia: String(intent?.id || ''),
    });
    if (!result.ok) {
        await sendOpsAlert('Pago sin aplicar a factura',
            `Organización ${orgId}; documento ${targetId}; PI ${intent?.id}; ${result.error}`);
        throw new Error('No se pudo conciliar el pago de la factura.');
    }
    // Enqueue the paid transition before fee reconciliation can request a retry;
    // applyPayment is idempotent and will not repeat justPaid on that retry.
    if (result.justPaid) after(dispatchInvoiceEvent(orgId, targetId, 'invoice.paid'));
    // Ingreso real de una factura PURA (pagada desde su hosted page). Solo el
    // camino `metadata.documento_id`: el camino `cotizacion_id` es un pago del
    // link de la cotización que markQuotePaid ya contó como payment_received —
    // emitir aquí otra vez lo duplicaría.
    if (docId) {
        const commissionStatus = await reconcileInvoiceCommission(orgId, targetId, intent, account);
        if (commissionStatus === 'needs_review') {
            after(sendOpsAlert('Comisión de factura pendiente de revisión',
                `Organización ${orgId}; documento ${targetId}; pago ${intent.id}. Revisar desglose o divisa antes de facturar la comisión.`));
        }
        const pm = Array.isArray(intent?.payment_method_types) && intent.payment_method_types.includes('customer_balance')
            ? 'spei' : 'tarjeta';
        const flags = await orgAnalyticsFlags(orgId);
        await trackPaymentReceived(
            orgId, monto, currency, pm, false, undefined,
            flags.isSandbox, flags.isDemo,
            { payment_id: String(intent?.id || ''), invoice_id: targetId, payment_kind: 'invoice' },
        );
    }
}

/** Un intento fallido no toca el saldo, pero sí avisa a quien escucha facturas. */
async function failInvoiceFromIntent(intent: any, account?: string): Promise<void> {
    const docId = intent?.metadata?.documento_id as string | undefined;
    if (!docId) return;
    const orgId = await orgForConnectedAccount(account);
    if (!orgId) return;
    const [rows] = await withOrgTx(orgId, sql`
        select id from documentos_fiscales where id = ${docId} and org_id = ${orgId}`);
    if (!rows.length) return;
    after(dispatchInvoiceEvent(orgId, docId, 'invoice.payment_failed'));
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

/**
 * Persiste un depósito. Antes esto sólo escribía una línea de auditoría, así
 * que el negocio no tenía historial de depósitos ni forma de conciliarlos: el
 * widget "próximo depósito" dependía de una llamada en vivo al proveedor en
 * cada carga de la página.
 *
 * Idempotente por `stripe_payout_id`. Los eventos llegan fuera de orden con
 * frecuencia (`payout.paid` antes que un `payout.updated` viejo), así que un
 * estado terminal no se pisa con uno anterior.
 */
async function recordPayoutStatus(payout: any, account: string | undefined, eventType: string): Promise<void> {
    const orgId = await orgForConnectedAccount(account);
    if (!orgId || !payout?.id || !account) return;

    const currency = String(payout?.currency || 'mxn').toUpperCase();
    const amountCents = Math.round(Number(payout?.amount ?? 0));
    const status = String(payout?.status || 'pending');
    const arrival = Number(payout?.arrival_date);
    const arrivalDate = Number.isFinite(arrival) && arrival > 0
        ? new Date(arrival * 1000).toISOString().slice(0, 10)
        : null;
    const destino = payout?.destination && typeof payout.destination === 'object' ? payout.destination : null;

    await withOrgTx(orgId, sql`
        insert into payouts (
            org_id, stripe_account_id, stripe_payout_id, amount_cents, currency, status,
            arrival_date, metodo, tipo_destino, destino_last4, failure_code, failure_message
        ) values (
            ${orgId}, ${account}, ${payout.id}, ${amountCents}, ${currency}, ${status},
            ${arrivalDate}, ${payout?.method ?? null}, ${payout?.type ?? null},
            ${destino?.last4 ?? null}, ${payout?.failure_code ?? null}, ${payout?.failure_message ?? null}
        )
        on conflict (stripe_payout_id) do update set
            amount_cents    = excluded.amount_cents,
            currency        = excluded.currency,
            arrival_date    = coalesce(excluded.arrival_date, payouts.arrival_date),
            metodo          = coalesce(excluded.metodo, payouts.metodo),
            tipo_destino    = coalesce(excluded.tipo_destino, payouts.tipo_destino),
            destino_last4   = coalesce(excluded.destino_last4, payouts.destino_last4),
            failure_code    = excluded.failure_code,
            failure_message = excluded.failure_message,
            -- Un estado terminal no se degrada con un evento que llegó tarde.
            status = case
                when payouts.status in ('paid', 'failed', 'canceled')
                     and excluded.status not in ('paid', 'failed', 'canceled')
                then payouts.status
                else excluded.status
            end,
            updated_at = now()
    `);

    // La auditoría se conserva sólo para los dos estados que le importan al
    // negocio; el resto vive en la tabla y no tiene por qué llenar el log.
    if (eventType === 'payout.paid' || eventType === 'payout.failed') {
        const failed = eventType === 'payout.failed';
        const amount = fromMinorUnits(amountCents, currency);
        await logAudit(orgId, {
            accion: failed ? 'cord_pagos.deposito_fallido' : 'cord_pagos.deposito_pagado',
            entidad: 'payout',
            entidad_id: String(payout.id),
            detalle: `${amount.toFixed(2)} ${currency}${failed ? `; ${String(payout?.failure_code || 'sin código')}` : ''}`,
        });
        if (!failed) {
            const flags = await orgAnalyticsFlags(orgId);
            await trackServer('payout_paid', orgId, {
                payout_id: String(payout.id),
                amount,
                currency,
                arrival_date: arrivalDate ?? undefined,
                method: payout?.method ?? undefined,
            }, flags.isSandbox, flags.isDemo);
        }
    }
}

async function recordRefundEvent(refundOrCharge: any, account: string | undefined, eventType: string, eventCreated = 0): Promise<void> {
    const orgId = await orgForConnectedAccount(account);
    if (!orgId) return;

    if (eventType === 'charge.refunded') {
        let page = refundOrCharge?.refunds;
        do {
            for (const refund of page?.data ?? []) {
                await recordRefundEvent(refund, account, 'refund.updated', eventCreated);
            }
            if (!page?.has_more) break;
            const last = page.data?.at(-1)?.id;
            if (!last || !refundOrCharge?.id) throw new Error('No se pudo paginar el historial de reembolsos.');
            page = await stripe('/v1/refunds', { charge: String(refundOrCharge.id), starting_after: String(last), limit: '100' }, 'GET', { stripeAccount: account });
            if (!Array.isArray(page?.data) || page.has_more && !page.data.length) throw new Error('Historial de reembolsos incompleto.');
        } while (true);
        return;
    }

    const refundId = String(refundOrCharge?.id || '');
    if (!refundId.startsWith('re_')) return;
    // El evento puede llegar tarde: se lee el estado vigente en la misma cuenta.
    const currentRefund = await stripe(`/v1/refunds/${encodeURIComponent(refundId)}`, undefined, 'GET', { stripeAccount: account });
    if (!currentRefund || currentRefund.id !== refundId) throw new Error('No se pudo verificar el reembolso recibido.');
    refundOrCharge = currentRefund;
    const chargeId = typeof refundOrCharge?.charge === 'string'
        ? refundOrCharge.charge
        : String(refundOrCharge?.charge?.id || '');
    const paymentIntentId = typeof refundOrCharge?.payment_intent === 'string'
        ? refundOrCharge.payment_intent
        : String(refundOrCharge?.payment_intent?.id || '');
    const status = String(refundOrCharge.status || '');
    const amount = Number(refundOrCharge.amount);
    const currency = String(refundOrCharge.currency || '').toUpperCase();
    if (!Number.isSafeInteger(amount) || amount <= 0 || !/^[A-Z]{3}$/.test(currency)) throw new Error('Importe o divisa del reembolso inválidos.');
    if (paymentIntentId) {
        await recordInvoiceRefund(orgId, { id: refundId, paymentIntentId, amount: fromMinorUnits(amount, currency), currency, status, eventCreated });
        invalidateMoneyCaches(orgId);
    }
    // Reembolso EFECTIVO: monto negativo contra el revenue. Va antes del enlace
    // con cobro para cubrir también los reembolsos de facturas puras. Dedup por
    // refund_id ($insert_id): `refund.updated` puede llegar varias veces.
    if (status === 'succeeded') {
        const refFlags = await orgAnalyticsFlags(orgId);
        await trackServer('refund_issued', orgId, {
            refund_id: refundId,
            amount: fromMinorUnits(amount, currency),
            currency,
            reason: (refundOrCharge?.reason as string) ?? undefined,
        }, refFlags.isSandbox, refFlags.isDemo);
    }
    const [[cobro]] = await withOrgTx(orgId, sql`
        select id from cotizacion_cobros
         where org_id = ${orgId}
           and (stripe_charge_id = ${chargeId} or stripe_payment_intent_id = ${paymentIntentId})
         limit 1`);
    if (!cobro) return;

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
        detalle: `${fromMinorUnits(amount, currency)} ${currency}; ${status}`,
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
                    values (${orgId}, ${`Responder contracargo ${fromMinorUnits(amount, currency)} ${currency}`},
                            ${dueAt ? dueAt.slice(0, 10) : null})`]
            : []),
    );
    await logAudit(orgId, {
        accion: eventType === 'charge.dispute.created' ? 'cord_pagos.disputa_creada' : 'cord_pagos.disputa_actualizada',
        entidad: 'dispute',
        entidad_id: disputeId,
        detalle: `${fromMinorUnits(amount, currency)} ${currency}; ${status}`,
    });
    if (eventType === 'charge.dispute.created') {
        const amountText = `${fromMinorUnits(amount, currency)} ${currency}`;
        const dispFlags = await orgAnalyticsFlags(orgId);
        await trackServer('dispute_created', orgId, {
            dispute_id: disputeId,
            amount: fromMinorUnits(amount, currency),
            currency,
            reason: (dispute?.reason as string) ?? undefined,
        }, dispFlags.isSandbox, dispFlags.isDemo);
        after(sendOpsAlert('Contracargo nuevo', `${amountText}; organización ${orgId}; referencia ${disputeId}`));
        const [[owner]] = await withOrgTx(orgId, sql`
            select u.email, o.nombre from orgs o join users u on u.id = o.owner_id
             where o.id = ${orgId} limit 1`);
        if (owner?.email) {
            after(sendEmail({
                to: owner.email as string,
                subject: `Acción requerida: contracargo por ${amountText}`,
                html: `<p>Recibiste un contracargo por <strong>${amountText}</strong>.</p><p>Prepara y revisa la evidencia antes de la fecha límite.</p><p><a href="${siteOrigin()}/app/cobros">Abrir Cord Payments</a></p>`,
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
        status = case when status = 'needs_review' then status
                      when ${eventType === 'application_fee.created'} then status else 'fee_refunded' end,
        refunded_cents = case when ${eventType === 'application_fee.created'} then refunded_cents else greatest(refunded_cents, ${refunded}) end,
        updated_at = now()
      where org_id = ${orgId}
        and (stripe_application_fee_id = ${feeId} or stripe_charge_id = ${String(parent?.charge || '')})
      returning id`);
    if (!updated.length) throw new Error(`Comisión no conciliada para ${feeId}`);
}

async function markBuildPayment(intent: any): Promise<void> {
    if (intent?.metadata?.flow === 'cord_build_bid') {
        await settleBuildBid(intent);
        return;
    }
    if (intent?.metadata?.flow === 'cord_build_balance') {
        await settleBuildBalance(intent);
        return;
    }
    await markBuildPositionPaid(intent);
}

async function settleBuildBalance(intent: any): Promise<void> {
    if (intent?.status !== 'succeeded') throw new Error('Saldo final Build no está succeeded');
    const bidId = String(intent?.metadata?.bid_id || '');
    if (!/^[0-9a-f-]{36}$/i.test(bidId) || !intent?.id) throw new Error('Saldo final Build sin metadatos completos');
    const [settled] = await sql`
        select cord_settle_build_balance(
          ${bidId}::uuid, ${String(intent.id)}, ${Number(intent.amount)}, ${String(intent.currency || '').toLowerCase()}
        ) as outcome`;
    if (settled?.outcome !== 'accepted') throw new Error(`No se pudo conciliar el saldo ganador Build ${bidId}`);
}

async function settleBuildBid(intent: any): Promise<void> {
    if (intent?.status !== 'succeeded') throw new Error('Depósito Build no está succeeded');
    const bidId = String(intent?.metadata?.bid_id || '');
    if (!/^[0-9a-f-]{36}$/i.test(bidId) || !intent?.id) throw new Error('Depósito Build sin metadatos completos');

    const [settled] = await sql`
        select * from cord_settle_build_bid(
          ${bidId}::uuid, ${String(intent.id)}, ${Number(intent.amount)}, ${String(intent.currency || '').toLowerCase()}
        )`;
    if (!settled) throw new Error(`No se pudo conciliar la oferta Build ${bidId}`);

    // Si el proceso cayó después de mover el liderazgo pero antes del refund,
    // el retry recupera cualquier depósito todavía marcado para reembolso.
    let refundBidId = settled.refund_bid_id as string | null;
    let refundIntentId = settled.refund_payment_intent_id as string | null;
    if (!refundIntentId && settled.outcome === 'accepted') {
        const [pendingRefund] = await sql`
            select id, stripe_payment_intent_id from build_bids
             where position_id = ${String(intent.metadata.position_id || '')}
               and status = 'outbid_refunding'
             order by outbid_at asc limit 1`;
        refundBidId = pendingRefund?.id || null;
        refundIntentId = pendingRefund?.stripe_payment_intent_id || null;
    }
    if (!refundIntentId || !refundBidId) return;

    const refund = await stripe('/v1/refunds', {
        payment_intent: refundIntentId,
        'metadata[flow]': 'cord_build_bid_refund',
        'metadata[bid_id]': refundBidId,
    }, 'POST', { idempotencyKey: `cord-build-bid-refund-${refundBidId}` });
    if (!refund?.id) throw new Error(`Stripe no devolvió refund para Build ${refundBidId}`);

    const [bid] = await sql`select status from build_bids where id = ${refundBidId}::uuid`;
    const terminalStatus = bid?.status === 'stale_refunding' ? 'stale' : bid?.status === 'rejected_refunding' ? 'rejected' : 'outbid';
    await sql`
        update build_bids
           set stripe_refund_id = ${refund.id},
               status = case when ${String(refund.status || '')} = 'succeeded' then ${terminalStatus} else status end,
               refunded_at = case when ${String(refund.status || '')} = 'succeeded' then now() else refunded_at end,
               updated_at = now()
         where id = ${refundBidId}::uuid
           and stripe_payment_intent_id = ${refundIntentId}`;
}

async function markBuildBidFailed(intent: any): Promise<void> {
    if (intent?.metadata?.flow !== 'cord_build_bid' || !intent?.id) return;
    await sql`
        update build_bids set status = 'failed', updated_at = now()
         where stripe_payment_intent_id = ${String(intent.id)} and status = 'pending'`;
}

async function syncBuildBidRefund(refund: any): Promise<void> {
    if (refund?.metadata?.flow !== 'cord_build_bid_refund' || !refund?.id) return;
    const bidId = String(refund.metadata.bid_id || '');
    if (!/^[0-9a-f-]{36}$/i.test(bidId)) throw new Error('Refund Build sin bid_id');
    if (refund.status === 'failed' || refund.failure_reason) {
        throw new Error(`Refund Build falló: ${String(refund.failure_reason || refund.status)}`);
    }
    if (refund.status !== 'succeeded') return;
    await sql`
        update build_bids
           set status = case status when 'stale_refunding' then 'stale' when 'rejected_refunding' then 'rejected' else 'outbid' end,
               stripe_refund_id = ${String(refund.id)}, refunded_at = coalesce(refunded_at, now()), updated_at = now()
         where id = ${bidId}::uuid and status in ('outbid_refunding','stale_refunding','rejected_refunding')`;
}

// The Cord Build: el navegador nunca puede marcar una posición como pagada.
// Sólo llega aquí tras verificar la firma del webhook y reclamar event.id de
// forma idempotente. Se exige coincidencia de posición + request + hold + PI;
// cualquier desajuste hace fallar el evento para revisión/retry, no concede el lugar.
async function markBuildPositionPaid(intent: any): Promise<void> {
    if (intent?.metadata?.flow !== 'cord_build') return;
    if (intent?.status !== 'succeeded') throw new Error('PaymentIntent de Build no está succeeded');
    const positionId = String(intent?.metadata?.position_id || '');
    const requestId = String(intent?.metadata?.request_id || '');
    const holdToken = String(intent?.metadata?.hold_token || '');
    if (!/^([0][1-9]|10)$/.test(positionId) || !requestId || !holdToken || !intent?.id) {
        throw new Error('PaymentIntent de Build sin metadatos completos');
    }
    const [updated] = await sql`
        update build_positions
           set status = 'paid', paid_at = coalesce(paid_at, now()),
               hold_expires_at = null, updated_at = now()
         where position_id = ${positionId}
           and request_id = ${requestId}::uuid
           and hold_token = ${holdToken}::uuid
           and stripe_payment_intent_id = ${intent.id}
           and amount_cents = ${Number(intent.amount)}
           and currency = ${String(intent.currency || '').toLowerCase()}
           and status in ('reserved','paid')
        returning position_id`;
    if (!updated) throw new Error(`No se pudo conciliar la posición Build ${positionId}`);
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
                    const monto = fromMinorUnits(Number(sessionOrIntent?.amount ?? 0), String(sessionOrIntent?.currency || 'MXN'));
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

            const currency = (sessionOrIntent?.currency ?? 'MXN').toUpperCase();
            const amountPaid = fromMinorUnits(Number(sessionOrIntent?.amount ?? 0), currency);

            if (flipped.length) {
                await withOrgTx(orgId, sql`insert into eventos (org_id, cotizacion_id, tipo, detalle)
                    values (${orgId}, ${cid}, 'paid', 'Pago recibido con Cord Payments; cotización saldada')`);
                await logAudit(orgId, { accion: 'cotizacion.paid', entidad: 'cotizacion', entidad_id: cid, detalle: 'Pago en línea con Cord Payments' });
                await trackPaymentReceived(
                    orgId, amountPaid, currency, paymentMethod, false, cid,
                    !!rows[0].is_sandbox, !!rows[0].is_demo,
                    { payment_id: String(sessionOrIntent?.id || ''), cobro_id: cobroId, payment_kind: 'settlement' },
                );
                after(dispatchQuoteEvent(orgId, cid, 'quote.paid'));
                after(notifyQuoteEvent(orgId, cid, 'quote_paid'));
            } else if (marked.length) {
                // Pago PARCIAL: evento informativo, sin quote.paid (avisar a las
                // integraciones que "se pagó todo" cuando solo cayó el anticipo
                // sería mentirles).
                const co = marked[0];
                const label = co.tipo === 'anticipo' ? 'Anticipo'
                    : co.tipo === 'saldo' ? 'Saldo'
                    : co.tipo === 'cuota' ? `Cuota ${co.numero_cuota}`
                    : 'Pago';
                const monto = money(Number(co.monto), String(sessionOrIntent?.currency || 'MXN'));
                const sufijo = rows[0].status === 'paid' ? ' (la cotización ya estaba marcada como pagada — verificar)' : ' — saldo pendiente';
                await withOrgTx(orgId, sql`insert into eventos (org_id, cotizacion_id, tipo, detalle)
                    values (${orgId}, ${cid}, 'paid', ${`${label} de ${monto} pagado con Cord Payments${sufijo}`})`);
                await logAudit(orgId, { accion: 'cotizacion.cobro_pagado', entidad: 'cotizacion', entidad_id: cid, detalle: `${label} pagado en línea con Cord Payments` });
                await trackPaymentReceived(
                    orgId, amountPaid, currency, paymentMethod, false, cid,
                    !!rows[0].is_sandbox, !!rows[0].is_demo,
                    { payment_id: String(sessionOrIntent?.id || ''), cobro_id: cobroId, payment_kind: 'partial' },
                );
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
                    values (${orgId}, ${cid}, 'paid', 'Pago recibido con Cord Payments')`,
            );
            if (!updated.length) throw new Error(`Cotización ${cid} no se actualizó después del pago`);
            await logAudit(orgId, { accion: 'cotizacion.paid', entidad: 'cotizacion', entidad_id: cid, detalle: 'Pago en línea con Cord Payments' });
            
            const currency = (sessionOrIntent?.currency ?? 'MXN').toUpperCase();
            const amountPaid = fromMinorUnits(Number(sessionOrIntent?.amount ?? 0), currency);
            await trackPaymentReceived(
                orgId, amountPaid, currency, paymentMethod, false, cid,
                !!rows[0].is_sandbox, !!rows[0].is_demo,
                { payment_id: String(sessionOrIntent?.id || ''), payment_kind: 'legacy' },
            );

            // No demorar el 200 a Stripe con nuestro webhook saliente, pero SIN perderlo:
            // after()/waitUntil mantiene viva la invocación hasta que termine, a
            // diferencia de un `.catch(()=>{})` suelto que Vercel puede congelar en
            // cuanto el handler responde (el evento de dinero más crítico del sistema
            // no puede depender de que la función siga viva por accidente).
            after(dispatchQuoteEvent(orgId, cid, 'quote.paid'));
            after(notifyQuoteEvent(orgId, cid, 'quote_paid'));
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
        const [updated] = await withOrgTx(orgId,
            sql`update orgs set stripe_subscription_id = ${session.subscription},
                stripe_customer_id = coalesce(stripe_customer_id, ${session.customer})
                where id = ${orgId} returning id`,
            sql`update billing_checkout_attempts
                   set stripe_subscription_id = ${session.subscription}, status = 'incomplete', updated_at = now()
                 where org_id = ${orgId}
                   and (stripe_session_id = ${session.id} or stripe_subscription_id = ${session.subscription})
                   and status in ('creating','incomplete')`);
        if (!updated.length) throw new Error(`No se pudo ligar la suscripción a la organización ${orgId}`);
    }
}

// Resuelve el plan desde los items de la suscripción (o el metadata).
function planOf(sub: any): string {
    // Los items son la autoridad. Metadata no cambia automáticamente cuando el
    // Customer Portal sustituye un Price y puede quedar apuntando al plan viejo.
    for (const item of sub?.items?.data ?? []) {
        const p = PRICE_TO_PLAN[item?.price?.id];
        if (p) return p;
    }
    return 'free';
}

function basePlanItem(sub: any): any | null {
    return (sub?.items?.data ?? []).find((item: any) => {
        const priceId = typeof item?.price === 'string' ? item.price : item?.price?.id;
        return !!priceId && !!PRICE_TO_PLAN[priceId];
    }) ?? null;
}

function hasRequiredMeterItems(sub: any, plan: string): boolean {
    if (plan === 'free' || !(plan in METER_PRICES)) return false;
    const itemPrices = new Set((sub?.items?.data ?? []).map((item: any) =>
        typeof item?.price === 'string' ? item.price : item?.price?.id
    ));
    return Object.values(METER_PRICES[plan as keyof typeof METER_PRICES])
        .filter(Boolean)
        .every((price) => itemPrices.has(price));
}

function invoiceLinePriceId(line: any): string | null {
    const price = line?.price ?? line?.pricing?.price_details?.price;
    if (typeof price === 'string') return price;
    return price?.id ? String(price.id) : null;
}

// Ranking de planes para distinguir upgrade vs downgrade en PostHog — orden
// real de negocio (ver docs/estado/cobros-facturacion.md), no alfabético.
const PLAN_RANK: Record<string, number> = { free: 0, starter: 1, pro: 2, scale: 3, developer: 4 };

async function retrieveAndSyncSubscription(subscriptionId: string | undefined) {
    if (!subscriptionId) return;
    const current = await stripe(`/v1/subscriptions/${subscriptionId}`, {
        'expand[0]': 'items.data.price',
    }, 'GET');
    await syncSubscription(current);
}

// Sincroniza plan / estado / fin de ciclo. ESTE es el "cambio de plan en vivo".
async function syncSubscription(sub: any) {
    const plan = planOf(sub);
    const status = (sub.status as string) || 'active';
    const baseItem = basePlanItem(sub);
    const interval = baseItem?.price?.recurring?.interval;
    const cycle = interval === 'year' ? 'anual' : interval === 'month' ? 'mensual' : (sub?.metadata?.cycle || 'mensual');
    // En la API "Basil" (2025-06-30+) Stripe MOVIÓ current_period_end del objeto
    // Subscription raíz a cada item — se lee del item como fallback para que la
    // fecha de renovación no quede en null según la versión con que llegue el evento.
    const rawPeriodEnd = baseItem?.current_period_end ?? sub.current_period_end;
    const periodEnd = rawPeriodEnd ? Number(rawPeriodEnd) : null;

    // Localiza la org por subscription_id o por customer_id. De paso trae el
    // plan/flags ACTUALES (antes del UPDATE) para poder distinguir upgrade de
    // downgrade en PostHog sin una segunda query.
    const orgId = await orgForBilling(sub?.id, typeof sub?.customer === 'string' ? sub.customer : sub?.customer?.id);
    if (!orgId) return;
    const [rows] = await withOrgTx(orgId, sql`select id, plan as prev_plan, stripe_subscription_id, (sandbox_of is not null) as is_sandbox, is_demo
        from orgs where id = ${orgId} limit 1`);
    if (!rows.length) return;
    if (rows[0].stripe_subscription_id && rows[0].stripe_subscription_id !== sub?.id) {
        await sendOpsAlert('Evento de suscripción obsoleta ignorado', `Organización ${orgId}; actual ${rows[0].stripe_subscription_id}; evento ${String(sub?.id || '')}`);
        return;
    }
    const prevPlan = (rows[0].prev_plan as string) || 'free';
    const isSandbox = !!rows[0].is_sandbox;
    const isDemo = !!rows[0].is_demo;

    // El plan SOLO se otorga cuando la suscripción está pagada/vigente. Con el
    // Payment Element la suscripción nace `incomplete` (antes de pagar): en ese
    // estado NO se debe upgradear el plan — se hace al llegar `active` (vía
    // invoice.paid / subscription.updated). El resto de campos sí se sincroniza.
    const metersComplete = hasRequiredMeterItems(sub, plan);
    const grantsPlan = status === 'active' && plan !== 'free' && metersComplete && !!periodEnd && periodEnd * 1000 > Date.now();
    if (status === 'active' && plan !== 'free' && !metersComplete) {
        await sendOpsAlert('Suscripción sin todos los medidores requeridos', `Organización ${orgId}; suscripción ${String(sub?.id || '')}; plan ${plan}`);
    }

    if (grantsPlan) {
        const [updated] = await withOrgTx(orgId, sql`update orgs set
                    plan = ${plan},
                    subscription_status = ${status},
                    billing_cycle = ${cycle},
                    stripe_subscription_id = ${sub.id},
                    stripe_customer_id = coalesce(stripe_customer_id, ${sub.customer}),
                    current_period_end = ${periodEnd ? new Date(periodEnd * 1000).toISOString() : null},
                    cancel_at_period_end = ${Boolean(sub.cancel_at_period_end)}
                  where id = ${orgId} returning id`);
        if (!updated.length) throw new Error(`Plan no actualizado para organización ${orgId}`);
    } else {
        const [updated] = await withOrgTx(orgId, sql`update orgs set
                    plan = 'free',
                    subscription_status = ${status},
                    billing_cycle = ${cycle},
                    stripe_subscription_id = ${sub.id},
                    stripe_customer_id = coalesce(stripe_customer_id, ${sub.customer}),
                    current_period_end = ${periodEnd ? new Date(periodEnd * 1000).toISOString() : null},
                    cancel_at_period_end = ${Boolean(sub.cancel_at_period_end)}
                  where id = ${orgId} returning id`);
        if (!updated.length) throw new Error(`Suscripción no actualizada para organización ${orgId}`);
    }
    await withOrgTx(orgId, sql`
        update billing_checkout_attempts
           set status = ${grantsPlan ? 'completed' : (['canceled','incomplete_expired'].includes(status) ? 'expired' : 'incomplete')},
               updated_at = now()
         where org_id = ${orgId} and stripe_subscription_id = ${sub.id}
           and status in ('creating','incomplete')`);
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
    const [rows] = await withOrgTx(orgId, sql`select id, plan, created_at, stripe_subscription_id, (sandbox_of is not null) as is_sandbox, is_demo
        from orgs where id = ${orgId} limit 1`);
    if (!rows.length) return;
    // Un `deleted` tardío de una suscripción vieja no puede cancelar la nueva.
    if (rows[0].stripe_subscription_id && rows[0].stripe_subscription_id !== sub?.id) return;
    const prevPlan = (rows[0].plan as string) || 'free';
    const [updated] = await withOrgTx(orgId,
        sql`update orgs set plan = 'free', subscription_status = 'canceled', stripe_subscription_id = null,
            current_period_end = null, billing_paid_through = null, billing_paid_plan = null,
            cancel_at_period_end = false
            where id = ${orgId} returning id`,
        sql`update billing_checkout_attempts set status = 'canceled', updated_at = now()
            where org_id = ${orgId} and stripe_subscription_id = ${sub.id}
              and status in ('creating','incomplete')`);
    if (!updated.length) throw new Error(`Cancelación no aplicada a organización ${orgId}`);
    await logAudit(orgId, { accion: 'billing.canceled', entidad: 'org', entidad_id: orgId, detalle: 'Suscripción cancelada → Gratis' });
    const tenureDays = rows[0].created_at ? Math.max(0, Math.round((Date.now() - new Date(rows[0].created_at as string).getTime()) / 86400000)) : null;
    await trackServer('subscription_canceled', orgId, {
        plan: prevPlan,
        tenure_days: tenureDays,
    }, !!rows[0].is_sandbox, !!rows[0].is_demo);
}

async function syncPaidBillingInvoice(invoice: any) {
    const customer = typeof invoice?.customer === 'string' ? invoice.customer : invoice?.customer?.id;
    const subId = invoiceSubId(invoice);
    const orgId = await orgForBilling(subId || undefined, customer);
    if (!orgId || !subId) return;
    const [[current]] = await withOrgTx(orgId, sql`select stripe_subscription_id from orgs where id = ${orgId} limit 1`);
    if (current?.stripe_subscription_id && current.stripe_subscription_id !== subId) return;

    const amountPaid = Number(invoice?.amount_paid ?? 0);
    const baseLines = (invoice?.lines?.data ?? []).map((line: any) => {
        const priceId = invoiceLinePriceId(line);
        return { line, plan: priceId ? PRICE_TO_PLAN[priceId] : null };
    }).filter((entry: any) => !!entry.plan);
    const paidPlan = baseLines
        .map((entry: any) => String(entry.plan))
        .sort((a: string, b: string) => (PLAN_RANK[b] ?? 0) - (PLAN_RANK[a] ?? 0))[0] || null;
    const paidThroughSeconds = Math.max(0, ...baseLines
        .filter((entry: any) => entry.plan === paidPlan)
        .map((entry: any) => Number(entry.line?.period?.end || 0)));

    // Los medidores mensuales de una suscripción anual generan facturas
    // auxiliares. Una factura auxiliar en cero no puede borrar la evidencia
    // del precio base anual, ni una pagada puede extender esa evidencia.
    if (!baseLines.length && amountPaid <= 0) return;
    if (baseLines.length && (amountPaid <= 0 || !paidThroughSeconds || !paidPlan)) {
        await sendOpsAlert('Factura de plan sin pago cobrable', `Organización ${orgId}; factura ${String(invoice?.id || '')}; amount_paid=${amountPaid}`);
        await retrieveAndSyncSubscription(subId);
        return;
    }

    await withOrgTx(orgId, sql`update orgs set
        billing_last_paid_at = now(),
        billing_paid_through = case
            when ${paidThroughSeconds} > 0 then greatest(
                coalesce(billing_paid_through, '-infinity'::timestamptz),
                ${paidThroughSeconds > 0 ? new Date(paidThroughSeconds * 1000).toISOString() : null}::timestamptz
            )
            else billing_paid_through
        end,
        billing_paid_plan = case when ${paidThroughSeconds} > 0 then ${paidPlan} else billing_paid_plan end,
        billing_last_invoice_id = ${String(invoice.id)},
        billing_last_amount_paid = ${amountPaid},
        billing_currency = ${String(invoice.currency || '').toUpperCase() || null}
        where id = ${orgId}`);
    await retrieveAndSyncSubscription(subId);
}

async function syncFailedBillingInvoice(invoice: any) {
    const customer = typeof invoice?.customer === 'string' ? invoice.customer : invoice?.customer?.id;
    const subId = invoiceSubId(invoice);
    const orgId = await orgForBilling(subId || undefined, customer);
    if (!orgId) return;
    const [[current]] = await withOrgTx(orgId, sql`select stripe_subscription_id from orgs where id = ${orgId} limit 1`);
    if (current?.stripe_subscription_id && current.stripe_subscription_id !== subId) return;
    const [rows] = await withOrgTx(orgId,
        sql`select id, (sandbox_of is not null) as is_sandbox, is_demo from orgs where id = ${orgId} limit 1`);
    // Para un upgrade con `pending_if_incomplete`, Stripe mantiene los items y
    // el status del plan anterior si falla el prorrateo. Releer la suscripción
    // conserva ese derecho; una renovación realmente fallida ya vendrá
    // `past_due`/`unpaid` y syncSubscription la revoca.
    if (subId) await retrieveAndSyncSubscription(subId);
    if (rows.length) {
        await trackServer('payment_failed', rows[0].id as string, { context: 'subscription' }, !!rows[0].is_sandbox, !!rows[0].is_demo);
    }
}

/**
 * Refresca los requisitos de la cuenta tras un cambio en una de sus personas y
 * deja rastro cuando el proveedor RECHAZA una verificación.
 *
 * No se confía en el payload del evento para el estado de la cuenta: los
 * eventos llegan fuera de orden, así que se relee la cuenta y se guarda lo que
 * diga en ese momento. El payload sí se usa para el motivo del rechazo, que es
 * información del evento y no del agregado.
 */
async function recordPersonEvent(person: any, account: string | undefined, tipo: string) {
    if (!account) return;
    const orgId = await orgForConnectedAccount(account);
    if (!orgId) return;

    const verificacion = person?.verification || {};
    const rechazo = verificacion.details_code || verificacion.document?.details_code || null;
    const nombre = [person?.first_name, person?.last_name].filter(Boolean).join(' ').trim();

    // Cierra la evidencia de KYC con lo que el proveedor decidió. Es la mitad que
    // faltaba del par "lo que Cord midió / lo que el proveedor dictaminó": sin
    // esto, la tabla guarda métricas sin desenlace y no sirve para calibrar nada.
    if (typeof person?.id === 'string') {
        await cerrarVeredictoKyc(person.id, {
            estado: rechazo ? 'rechazado' : (verificacion.status === 'verified' ? 'verificado' : 'pendiente'),
            codigo: rechazo,
            detalle: verificacion.details ?? null,
        });
    }

    await logAudit(orgId, {
        accion: rechazo ? 'cord_pagos.persona_verificacion_rechazada' : `cord_pagos.${tipo.replace('.', '_')}`,
        entidad: 'connect_person',
        // El id de la persona, nunca su documento ni su identificación.
        entidad_id: typeof person?.id === 'string' ? person.id : null,
        detalle: [
            nombre && `persona: ${nombre}`,
            verificacion.status && `estado: ${verificacion.status}`,
            rechazo && `motivo: ${rechazo}`,
        ].filter(Boolean).join(' · ') || tipo,
    });

    // Los requisitos de la cuenta cambian con cada persona: se releen de la
    // fuente en vez de derivarlos del evento.
    try {
        const fresh = await retrieveAccount(account);
        await updateAccountStatus(fresh);
    } catch {
        // Que el refresco falle no puede tumbar el evento: el rastro de
        // auditoría ya quedó y `account.updated` volverá a sincronizar.
    }
}

/**
 * Una capability (card_payments, transfers, mx_bank_transfer_payments) cambió de
 * estado. Es la señal más temprana de que el proveedor va a suspender los
 * cobros: llega antes que el `account.updated` que apaga `charges_enabled`.
 */
async function recordCapabilityEvent(capability: any, account: string | undefined) {
    if (!account) return;
    const orgId = await orgForConnectedAccount(account);
    if (!orgId) return;

    await logAudit(orgId, {
        accion: 'cord_pagos.capacidad_actualizada',
        entidad: 'connect_capability',
        entidad_id: typeof capability?.id === 'string' ? capability.id : null,
        detalle: `estado: ${capability?.status ?? 'desconocido'}`,
    });

    try {
        const fresh = await retrieveAccount(account);
        await updateAccountStatus(fresh);
    } catch { /* mismo criterio que arriba */ }
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

// El webhook corre sin sesión: la divisa viene SIEMPRE del objeto de Stripe, que
// es la autoridad de en qué se cobró realmente.
const money = (n: number, currency = 'MXN') => {
    const code = normalizeCurrency(currency);
    try {
        return Number(n).toLocaleString('es-MX', { style: 'currency', currency: code });
    } catch {
        return `${Number(n).toLocaleString('es-MX')} ${code}`;
    }
};

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

    const invoiceCurrency = normalizeCurrency(invoice?.currency || pi?.currency || 'MXN');
    // fromMinorUnits respeta las divisas sin decimales: /100 sobre un cobro en
    // JPY registraba una centésima del dinero que de verdad entró.
    const montoNum = fromMinorUnits(
        Number(invoice?.amount_paid ?? pi?.amount_received ?? pi?.amount ?? 0),
        invoiceCurrency,
    );
    const monto = money(montoNum, invoiceCurrency);

    // Registra el cobro mensual como fila 'pagado' en cotizacion_cobros para que
    // el dinero SÍ aparezca en el dashboard "Mi dinero" (getCobros). No dispara el
    // flip a 'paid' de la cotización (eso solo ocurre vía markQuotePaid, que aquí
    // no corre) y se OCULTA del link público (getCotizacionByToken lo excluye para
    // igualas). Idempotente: dedup por el PaymentIntent de la factura.
    if (piId && montoNum > 0) {
        try {
            const amountCents = toMinorUnits(montoNum, invoiceCurrency);
            const fee = computeSubscriptionFee(amountCents, invoiceCurrency, row.application_fee_percent != null);
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
    await logAudit(orgId, { accion: 'cotizacion.iguala_cobrada', entidad: 'cotizacion', entidad_id: row.cotizacion_id as string, detalle: `Cobro recurrente ${monto} con Cord Payments` });
    
    const currency = (invoice?.currency ?? 'MXN').toUpperCase();
    const [[orgFlags]] = await withOrgTx(orgId, sql`select (sandbox_of is not null) as is_sandbox, is_demo from orgs where id = ${orgId}`);
    await trackPaymentReceived(
        orgId, montoNum, currency, 'tarjeta', true, row.cotizacion_id as string,
        !!orgFlags?.is_sandbox, !!orgFlags?.is_demo,
        { payment_id: piId, stripe_invoice_id: String(invoice?.id || ''), payment_kind: 'recurring' },
    );
    
    // Cada cobro mensual exitoso es un "Pago recibido" real para las integraciones.
    // after()/waitUntil — no perderlo si Vercel congela la invocación tras el 200.
    after(dispatchQuoteEvent(row.org_id as string, row.cotizacion_id as string, 'quote.paid'));
    after(notifyQuoteEvent(row.org_id as string, row.cotizacion_id as string, 'quote_paid'));
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

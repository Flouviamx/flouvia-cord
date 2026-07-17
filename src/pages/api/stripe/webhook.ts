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
import crypto from 'node:crypto';
import { sql, logAudit } from '../../../lib/db';
import { dispatchQuoteEvent } from '../../../lib/webhooks';
import { PRICE_TO_PLAN, isPaidPlan, stripe } from '../../../lib/billing';

const WH_SECRET = import.meta.env.STRIPE_WEBHOOK_SECRET || process.env.STRIPE_WEBHOOK_SECRET;
const CONNECT_WH_SECRET = import.meta.env.STRIPE_CONNECT_WEBHOOK_SECRET || process.env.STRIPE_CONNECT_WEBHOOK_SECRET;

function verifySig(raw: string, sig: string, secret: string) {
    if (!secret) return false;
    try {
        const parts = Object.fromEntries(sig.split(',').map((p) => p.split('=')));
        const expected = crypto.createHmac('sha256', secret).update(`${parts.t}.${raw}`).digest('hex');
        const a = Buffer.from(parts.v1 || '', 'hex');
        const b = Buffer.from(expected, 'hex');
        return a.length === b.length && crypto.timingSafeEqual(a, b);
    } catch {
        return false;
    }
}

export const POST: APIRoute = async ({ request }) => {
    const raw = await request.text();

    if ((!WH_SECRET && !CONNECT_WH_SECRET) && process.env.VERCEL) {
        return new Response('webhook mal configurado (falta secret)', { status: 500 });
    }
    if (WH_SECRET || CONNECT_WH_SECRET) {
        const sig = request.headers.get('stripe-signature') || '';
        let valid = false;
        if (WH_SECRET && verifySig(raw, sig, WH_SECRET as string)) valid = true;
        if (!valid && CONNECT_WH_SECRET && verifySig(raw, sig, CONNECT_WH_SECRET as string)) valid = true;
        if (!valid) {
            return new Response('firma inválida', { status: 400 });
        }
    }

    let event: any;
    try { event = JSON.parse(raw); } catch { return new Response('payload inválido', { status: 400 }); }

    // Idempotencia: si ya procesamos este event.id, salimos sin reprocesar.
    try {
        const ins = await sql`insert into stripe_events (id, type) values (${event.id}, ${event.type})
                              on conflict (id) do nothing returning id`;
        if (!ins.length) return ok();
    } catch { /* tabla aún no migrada → seguimos (sin idempotencia) */ }

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
    }

    return ok();
};

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

    const rows = await sql`select id, org_id, status, (select stripe_account_id from orgs where id = c.org_id) as acct from cotizaciones c where c.id = ${cid}`;
    // Defensa en profundidad: el evento debe provenir de la cuenta conectada de la
    // org dueña de la cotización (o de la plataforma, si aún no hay Connect).
    if (rows.length && account && rows[0].acct && rows[0].acct !== account) return;
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

        const orgId = rows[0].org_id as string;
        const cobroId = sessionOrIntent?.metadata?.cobro_id as string | undefined;

        if (cobroId) {
            // ── Cobros parciales (anticipo/saldo/cuota/total v2) ──────────────
            // 1) Marcar este cobro como pagado. Acepta también 'cancelado': un PI
            // en vuelo (CLABE SPEI ya emitida) puede liquidarse DESPUÉS de que el
            // cobro se canceló (pago manual del vendedor, plan de cuotas que lo
            // reemplazó) — el dinero llegó de todos modos y hay que registrarlo.
            const marked = await sql`
                update cotizacion_cobros
                set status = 'pagado', paid_at = now(), payment_method = ${paymentMethod}
                where id = ${cobroId} and cotizacion_id = ${cid} and status in ('pendiente', 'cancelado')
                returning tipo, numero_cuota, monto`;

            if (!marked.length) {
                // Cobro inexistente o ya pagado. Si ya está 'pagado' es una
                // redelivery de Stripe (idempotente, nada que hacer). Si la fila
                // no existe, el dinero llegó sin cobro que lo respalde: dejar
                // rastro para conciliación manual, sin flip automático.
                const existe = await sql`select 1 from cotizacion_cobros where id = ${cobroId}`;
                if (!existe.length) {
                    const monto = Number(sessionOrIntent?.amount ?? 0) / 100;
                    await sql`insert into eventos (org_id, cotizacion_id, tipo, detalle)
                              values (${orgId}, ${cid}, 'paid', ${`Pago de $${monto.toFixed(2)} recibido vía Stripe para un cobro ya no vigente — revisar conciliación`})`;
                    await logAudit(orgId, { accion: 'cotizacion.pago_no_conciliado', entidad: 'cotizacion', entidad_id: cid, detalle: `PI ${sessionOrIntent?.id ?? ''} sin cobro vigente` });
                }
                return;
            }

            // 2) Si lo pagado ya cubre el total (p. ej. se liquidó el saldo
            // original después de que un plan de cuotas lo había reemplazado),
            // los cobros pendientes restantes se cancelan — ya no hay nada que deber.
            const [sums] = await sql`
                select (select coalesce(sum(monto), 0) from cotizacion_cobros
                        where cotizacion_id = ${cid} and status = 'pagado') as pagado,
                       total
                from cotizaciones where id = ${cid}`;
            if (sums && Number(sums.pagado) >= Number(sums.total) - 0.01) {
                await sql`update cotizacion_cobros set status = 'cancelado'
                          where cotizacion_id = ${cid} and status = 'pendiente'`;
            }

            // 3) Flip atómico e idempotente: la cotización pasa a 'paid' SOLO si ya
            // no queda ningún cobro pendiente. Se corre en cada pago de cobro; el
            // que caiga al último (por orden de commit) es el que la salda.
            const flipped = await sql`
                update cotizaciones
                set status = 'paid', paid_at = now(), payment_method = ${paymentMethod}
                where id = ${cid} and status in ('approved', 'invoiced')
                  and not exists (
                      select 1 from cotizacion_cobros
                      where cotizacion_id = ${cid} and status = 'pendiente')
                returning id`;

            if (flipped.length) {
                await sql`insert into eventos (org_id, cotizacion_id, tipo, detalle)
                          values (${orgId}, ${cid}, 'paid', 'Pago recibido vía Stripe — cotización saldada')`;
                await logAudit(orgId, { accion: 'cotizacion.paid', entidad: 'cotizacion', entidad_id: cid, detalle: 'Pago en línea (Stripe)' });
                dispatchQuoteEvent(orgId, cid, 'quote.paid').catch(() => {});
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
                await sql`insert into eventos (org_id, cotizacion_id, tipo, detalle)
                          values (${orgId}, ${cid}, 'paid', ${`${label} de ${monto} pagado vía Stripe${sufijo}`})`;
                await logAudit(orgId, { accion: 'cotizacion.cobro_pagado', entidad: 'cotizacion', entidad_id: cid, detalle: `${label} pagado en línea (Stripe)` });
            }
        } else {
            // ── Legacy: PaymentIntent/Checkout creado antes de los cobros parciales ──
            await sql`update cotizaciones set status = 'paid', paid_at = now(), payment_method = ${paymentMethod} where id = ${cid}`;
            // Higiene: si existieran cobros pendientes (no debería en el flujo legacy),
            // se cancelan para que el desglose no muestre "por pagar" en una pagada.
            await sql`update cotizacion_cobros set status = 'cancelado' where cotizacion_id = ${cid} and status = 'pendiente'`;
            await sql`insert into eventos (org_id, cotizacion_id, tipo, detalle)
                      values (${orgId}, ${cid}, 'paid', 'Pago recibido vía Stripe')`;
            await logAudit(orgId, { accion: 'cotizacion.paid', entidad: 'cotizacion', entidad_id: cid, detalle: 'Pago en línea (Stripe)' });
            // Fire-and-forget: no demorar el 200 a Stripe con nuestro webhook saliente
            // (dispatchQuoteEvent nunca lanza, pero por si acaso se traga el error —
            // antes aquí se llamaba a un `after()` inexistente que tronaba el handler).
            dispatchQuoteEvent(orgId, cid, 'quote.paid').catch(() => {});
        }
    }
}

// Liga la suscripción recién creada a la org (del metadata del checkout).
async function linkSubscription(session: any) {
    const orgId = session?.metadata?.org_id;
    if (orgId && session.subscription) {
        await sql`update orgs set stripe_subscription_id = ${session.subscription},
                  stripe_customer_id = coalesce(stripe_customer_id, ${session.customer})
                  where id = ${orgId}`;
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

    // Localiza la org por subscription_id o por customer_id.
    const rows = await sql`select id from orgs where stripe_subscription_id = ${sub.id} or stripe_customer_id = ${sub.customer} limit 1`;
    if (!rows.length) return;
    const orgId = rows[0].id as string;

    // El plan SOLO se otorga cuando la suscripción está pagada/vigente. Con el
    // Payment Element la suscripción nace `incomplete` (antes de pagar): en ese
    // estado NO se debe upgradear el plan — se hace al llegar `active` (vía
    // invoice.paid / subscription.updated). El resto de campos sí se sincroniza.
    const grantsPlan = status === 'active' || status === 'trialing' || status === 'past_due';

    if (grantsPlan) {
        await sql`update orgs set
                    plan = ${plan},
                    subscription_status = ${status},
                    billing_cycle = ${cycle},
                    stripe_subscription_id = ${sub.id},
                    stripe_customer_id = coalesce(stripe_customer_id, ${sub.customer}),
                    current_period_end = ${periodEnd ? new Date(periodEnd * 1000).toISOString() : null}
                  where id = ${orgId}`;
    } else {
        await sql`update orgs set
                    subscription_status = ${status},
                    billing_cycle = ${cycle},
                    stripe_subscription_id = ${sub.id},
                    stripe_customer_id = coalesce(stripe_customer_id, ${sub.customer}),
                    current_period_end = ${periodEnd ? new Date(periodEnd * 1000).toISOString() : null}
                  where id = ${orgId}`;
    }
    await logAudit(orgId, { accion: 'billing.plan_sync', entidad: 'org', entidad_id: orgId, detalle: `Plan ${grantsPlan ? plan : '(sin cambio)'} (${status})` });
}

// Cancelación → vuelve a Gratis.
async function downgradeToFree(sub: any) {
    const rows = await sql`select id from orgs where stripe_subscription_id = ${sub.id} or stripe_customer_id = ${sub.customer} limit 1`;
    if (!rows.length) return;
    const orgId = rows[0].id as string;
    await sql`update orgs set plan = 'free', subscription_status = 'canceled', stripe_subscription_id = null where id = ${orgId}`;
    await logAudit(orgId, { accion: 'billing.canceled', entidad: 'org', entidad_id: orgId, detalle: 'Suscripción cancelada → Gratis' });
}

async function setStatusByCustomer(customer: string | undefined, status: string) {
    if (!customer) return;
    await sql`update orgs set subscription_status = ${status} where stripe_customer_id = ${customer}`;
}

async function updateAccountStatus(account: any) {
    if (!account.id) return;
    const chargesEnabled = !!account.charges_enabled;
    const payoutsEnabled = !!account.payouts_enabled;
    const detailsSubmitted = !!account.details_submitted;
    const disabledReason = account.requirements?.disabled_reason || null;
    const requirements = JSON.stringify(account.requirements || {});
    await sql`update orgs set 
        stripe_charges_enabled = ${chargesEnabled},
        stripe_payouts_enabled = ${payoutsEnabled},
        stripe_details_submitted = ${detailsSubmitted},
        stripe_disabled_reason = ${disabledReason},
        stripe_requirements = ${requirements}
        where stripe_account_id = ${account.id}`;
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
    const rows = await sql`select * from cotizacion_suscripciones where stripe_subscription_id = ${subId}`;
    if (!rows.length) return null;
    // El evento debe venir de la cuenta conectada dueña de la suscripción.
    if (rows[0].stripe_account_id && account && rows[0].stripe_account_id !== account) return null;
    return rows[0];
}

// Factura mensual pagada (primera autorización + cada renovación). Marca la
// suscripción activa, registra el pago en la bitácora y avisa a integraciones.
async function recurringInvoicePaid(invoice: any, account: string) {
    const subId = invoiceSubId(invoice);
    const row = await findQuoteSub(subId, account);
    if (!row) return;
    const periodEnd = invoice?.lines?.data?.[0]?.period?.end;
    await sql`update cotizacion_suscripciones set
                estado = 'active',
                current_period_end = ${periodEnd ? new Date(periodEnd * 1000).toISOString() : null}
              where id = ${row.id}`;
    const montoNum = Number(invoice?.amount_paid ?? 0) / 100;
    const monto = money(montoNum);

    // Registra el cobro mensual como fila 'pagado' en cotizacion_cobros para que
    // el dinero SÍ aparezca en el dashboard "Mi dinero" (getCobros). No dispara el
    // flip a 'paid' de la cotización (eso solo ocurre vía markQuotePaid, que aquí
    // no corre) y se OCULTA del link público (getCotizacionByToken lo excluye para
    // igualas). Idempotente: dedup por el PaymentIntent de la factura.
    const pi = invoice?.payment_intent;
    const piId = (typeof pi === 'string' ? pi : pi?.id) || (invoice?.id as string) || '';
    if (piId && montoNum > 0) {
        try {
            await sql`
                insert into cotizacion_cobros (org_id, cotizacion_id, tipo, numero_cuota, monto, status, payment_method, paid_at, stripe_payment_intent_id, vence)
                select ${row.org_id}, ${row.cotizacion_id}, 'cuota',
                       coalesce((select max(numero_cuota) from cotizacion_cobros where cotizacion_id = ${row.cotizacion_id} and tipo = 'cuota'), 0) + 1,
                       ${montoNum}, 'pagado', 'tarjeta', now(), ${piId}, current_date
                where not exists (select 1 from cotizacion_cobros where cotizacion_id = ${row.cotizacion_id} and stripe_payment_intent_id = ${piId})`;
        } catch { /* best-effort: la visibilidad del cobro no debe tronar el webhook */ }
    }

    await sql`insert into eventos (org_id, cotizacion_id, tipo, detalle)
              values (${row.org_id}, ${row.cotizacion_id}, 'paid', ${`Cobro mensual de ${monto} recibido (iguala)`})`;
    await logAudit(row.org_id as string, { accion: 'cotizacion.iguala_cobrada', entidad: 'cotizacion', entidad_id: row.cotizacion_id as string, detalle: `Cobro recurrente ${monto} (Stripe)` });
    // Cada cobro mensual exitoso es un "Pago recibido" real para las integraciones.
    dispatchQuoteEvent(row.org_id as string, row.cotizacion_id as string, 'quote.paid').catch(() => {});
}

async function recurringInvoiceFailed(invoice: any, account: string) {
    const subId = invoiceSubId(invoice);
    const row = await findQuoteSub(subId, account);
    if (!row) return;
    await sql`update cotizacion_suscripciones set estado = 'past_due' where id = ${row.id}`;
    await sql`insert into eventos (org_id, cotizacion_id, tipo, detalle)
              values (${row.org_id}, ${row.cotizacion_id}, 'comment', 'El cobro mensual de la iguala falló — Stripe reintentará automáticamente')`;
}

// customer.subscription.updated/created → sincroniza estado y fin de ciclo.
async function syncQuoteSubscription(sub: any, account: string) {
    const row = await findQuoteSub(sub?.id, account);
    if (!row) return;
    const periodEnd = sub?.current_period_end ?? sub?.items?.data?.[0]?.current_period_end;
    await sql`update cotizacion_suscripciones set
                estado = ${sub.status || 'active'},
                cancel_at_period_end = ${!!sub.cancel_at_period_end},
                current_period_end = ${periodEnd ? new Date(Number(periodEnd) * 1000).toISOString() : null}
              where id = ${row.id}`;
}

// customer.subscription.deleted → la iguala terminó.
async function cancelQuoteSubscription(sub: any, account: string) {
    const row = await findQuoteSub(sub?.id, account);
    if (!row) return;
    await sql`update cotizacion_suscripciones set estado = 'canceled', cancel_at_period_end = false where id = ${row.id}`;
    await sql`insert into eventos (org_id, cotizacion_id, tipo, detalle)
              values (${row.org_id}, ${row.cotizacion_id}, 'comment', 'La iguala recurrente se canceló — no habrá más cobros mensuales')`;
    await logAudit(row.org_id as string, { accion: 'cotizacion.iguala_cancelada', entidad: 'cotizacion', entidad_id: row.cotizacion_id as string, detalle: 'Suscripción recurrente cancelada' });
}

function ok() {
    return new Response(JSON.stringify({ received: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

// POST /api/stripe/webhook — Stripe avisa de pagos, altas y CAMBIOS DE PLAN.
// Verifica la firma con STRIPE_WEBHOOK_SECRET (HMAC, sin SDK) y sincroniza Neon
// en tiempo real. Configura el endpoint en el dashboard de Stripe apuntando a
// https://trato.flouvia.com/api/stripe/webhook con estos eventos:
//   • checkout.session.completed
//   • customer.subscription.created / .updated / .deleted
//   • invoice.paid / invoice.payment_failed
export const prerender = false;

import type { APIRoute } from 'astro';
import crypto from 'node:crypto';
import { sql, logAudit } from '../../../lib/db';
import { dispatchQuoteEvent } from '../../../lib/webhooks';
import { PRICE_TO_PLAN, isPaidPlan } from '../../../lib/billing';

const WH_SECRET = import.meta.env.STRIPE_WEBHOOK_SECRET || process.env.STRIPE_WEBHOOK_SECRET;

export const POST: APIRoute = async ({ request }) => {
    const raw = await request.text();

    // Verificación de firma (si hay secreto configurado).
    if (WH_SECRET) {
        try {
            const sig = request.headers.get('stripe-signature') || '';
            const parts = Object.fromEntries(sig.split(',').map((p) => p.split('=')));
            const expected = crypto.createHmac('sha256', WH_SECRET).update(`${parts.t}.${raw}`).digest('hex');
            const a = Buffer.from(parts.v1 || '', 'hex');
            const b = Buffer.from(expected, 'hex');
            if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
                return new Response('firma inválida', { status: 400 });
            }
        } catch {
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
        // ── Pago de una cotización individual (Checkout mode=payment) ──────────
        case 'checkout.session.completed': {
            if (obj.mode === 'subscription') {
                await linkSubscription(obj);
            } else {
                await markQuotePaid(obj);
            }
            break;
        }
        // ── Alta / cambio de plan / renovación ────────────────────────────────
        case 'customer.subscription.created':
        case 'customer.subscription.updated': {
            await syncSubscription(obj);
            break;
        }
        case 'customer.subscription.deleted': {
            await downgradeToFree(obj);
            break;
        }
        // ── Cobros (incluye el excedente medido del periodo) ──────────────────
        case 'invoice.paid': {
            await setStatusByCustomer(obj.customer, 'active');
            break;
        }
        case 'invoice.payment_failed': {
            await setStatusByCustomer(obj.customer, 'past_due');
            break;
        }
    }

    return ok();
};

// Marca la cotización como pagada (flujo de pago en línea por link público).
async function markQuotePaid(session: any) {
    const cid = session?.metadata?.cotizacion_id;
    if (!cid) return;
    const rows = await sql`select id, org_id, status from cotizaciones where id = ${cid}`;
    if (rows.length && ['approved', 'invoiced'].includes(rows[0].status as string)) {
        await sql`update cotizaciones set status = 'paid' where id = ${cid}`;
        await sql`insert into eventos (org_id, cotizacion_id, tipo, detalle)
                  values (${rows[0].org_id}, ${cid}, 'paid', 'Pago recibido vía Stripe')`;
        await logAudit(rows[0].org_id as string, { accion: 'cotizacion.paid', entidad: 'cotizacion', entidad_id: cid, detalle: 'Pago en línea (Stripe)' });
        await dispatchQuoteEvent(rows[0].org_id as string, cid, 'quote.paid');
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
    const periodEnd = sub.current_period_end ? Number(sub.current_period_end) : null;

    // Localiza la org por subscription_id o por customer_id.
    const rows = await sql`select id from orgs where stripe_subscription_id = ${sub.id} or stripe_customer_id = ${sub.customer} limit 1`;
    if (!rows.length) return;
    const orgId = rows[0].id as string;

    await sql`update orgs set
                plan = ${plan},
                subscription_status = ${status},
                billing_cycle = ${cycle},
                stripe_subscription_id = ${sub.id},
                stripe_customer_id = coalesce(stripe_customer_id, ${sub.customer}),
                current_period_end = ${periodEnd ? new Date(periodEnd * 1000).toISOString() : null}
              where id = ${orgId}`;
    await logAudit(orgId, { accion: 'billing.plan_sync', entidad: 'org', entidad_id: orgId, detalle: `Plan ${plan} (${status})` });
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

function ok() {
    return new Response(JSON.stringify({ received: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

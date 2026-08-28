// POST /api/cotizaciones/[id]/subscription — el VENDEDOR gestiona la iguala
// recurrente de una cotización. Acción: { action: 'cancel' } → programa la
// cancelación al final del periodo (cancel_at_period_end) en la Stripe
// Subscription que vive en la cuenta conectada del propio vendedor.
export const prerender = false;

import type { APIRoute } from 'astro';
import { sql, getActiveOrgId, logAudit, reqIp, withOrgTx } from '../../../../lib/db';
import { requirePerm } from '../../../../lib/queries';
import { merchantError } from '../../../../lib/pay-errors';
import { strictRateLimit, strictLimitResponse } from '../../../../lib/ratelimit';
import { requireFreshAuth } from '../../../../lib/step-up';

const STRIPE_KEY = import.meta.env.STRIPE_SECRET_KEY || process.env.STRIPE_SECRET_KEY;

export const POST: APIRoute = async ({ params, request }) => {
    // Cancelar cobros es una acción de cobranza — mismo permiso que el dashboard de dinero.
    const denied = await requirePerm('cobranza');
    if (denied) return denied;

    const id = params.id ?? '';
    const orgId = await getActiveOrgId();

    // Cancelar una iguala corta un flujo de ingresos RECURRENTE del negocio, y
    // no se puede deshacer desde aquí (hay que volver a pedirle autorización al
    // cliente). Iba sin rate limit y sin step-up, mientras que un reembolso —de
    // consecuencia comparable— exige los dos. Se alinean.
    const limited = strictLimitResponse(await strictRateLimit(`iguala-cancel:${orgId}`, 10, 3600));
    if (limited) return limited;
    const stale = await requireFreshAuth();
    if (stale) return stale;

    let body: any = {};
    try { body = await request.json(); } catch { /* sin body */ }
    if (body.action !== 'cancel') return json({ error: 'Acción no válida' }, 400);

    const [subRows] = await withOrgTx(orgId, sql`
        select s.id, s.stripe_subscription_id, s.stripe_account_id, s.estado
        from cotizacion_suscripciones s
        where s.cotizacion_id = ${id} and s.org_id = ${orgId} limit 1`);
    const sub = subRows[0];
    if (!sub) return json({ error: 'Esta cotización no tiene una iguala recurrente' }, 404);
    if (!sub.stripe_subscription_id) return json({ error: 'La iguala aún no ha sido autorizada por el cliente' }, 409);
    if (sub.estado === 'canceled') return json({ ok: true, estado: 'canceled' });

    if (STRIPE_KEY && sub.stripe_account_id) {
        try {
            const form = new URLSearchParams({ cancel_at_period_end: 'true' });
            const res = await fetch(`https://api.stripe.com/v1/subscriptions/${sub.stripe_subscription_id}`, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${STRIPE_KEY}`,
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Stripe-Account': sub.stripe_account_id as string,
                },
                body: form.toString(),
            });
            const data: any = await res.json();
            // Ni el mensaje crudo del proveedor ni su nombre: el dueño del negocio
            // no puede accionar sobre "No such subscription", y "no se pudo
            // conectar con Stripe" le nombra un proveedor que Cord no expone en
            // ninguna otra pantalla (regla 14).
            if (!res.ok) {
                const safe = merchantError(data?.error);
                return json({ error: safe.message, reference: safe.reference }, 502);
            }
        } catch (e) {
            const safe = merchantError(e);
            return json({ error: safe.message, reference: safe.reference }, 502);
        }
    }

    await withOrgTx(orgId,
        sql`update cotizacion_suscripciones set cancel_at_period_end = true where id = ${sub.id}`,
        sql`insert into eventos (org_id, cotizacion_id, tipo, detalle)
              values (${orgId}, ${id}, 'comment', 'La iguala recurrente se cancelará al final del periodo actual — no habrá más cobros')`);
    await logAudit(orgId, { accion: 'cotizacion.iguala_cancelada', entidad: 'cotizacion', entidad_id: id, detalle: 'Cancelación programada al fin de periodo', ip: reqIp(request) });

    return json({ ok: true, estado: 'cancel_at_period_end' });
};

function json(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

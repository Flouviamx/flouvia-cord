// POST /api/cotizaciones/[id]/subscription — el VENDEDOR gestiona la iguala
// recurrente de una cotización. Acción: { action: 'cancel' } → programa la
// cancelación al final del periodo (cancel_at_period_end) en la Stripe
// Subscription que vive en la cuenta conectada del propio vendedor.
export const prerender = false;

import type { APIRoute } from 'astro';
import { sql, getActiveOrgId, logAudit, reqIp } from '../../../../lib/db';
import { requirePerm } from '../../../../lib/queries';

const STRIPE_KEY = import.meta.env.STRIPE_SECRET_KEY || process.env.STRIPE_SECRET_KEY;

export const POST: APIRoute = async ({ params, request }) => {
    // Cancelar cobros es una acción de cobranza — mismo permiso que el dashboard de dinero.
    const denied = await requirePerm('cobranza');
    if (denied) return denied;

    const id = params.id ?? '';
    const orgId = await getActiveOrgId();
    let body: any = {};
    try { body = await request.json(); } catch { /* sin body */ }
    if (body.action !== 'cancel') return json({ error: 'Acción no válida' }, 400);

    const [sub] = await sql`
        select s.id, s.stripe_subscription_id, s.stripe_account_id, s.estado
        from cotizacion_suscripciones s
        where s.cotizacion_id = ${id} and s.org_id = ${orgId} limit 1`;
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
            if (!res.ok) return json({ error: data?.error?.message || 'No se pudo cancelar la suscripción' }, 502);
        } catch {
            return json({ error: 'No se pudo conectar con Stripe' }, 502);
        }
    }

    await sql`update cotizacion_suscripciones set cancel_at_period_end = true where id = ${sub.id}`;
    await sql`insert into eventos (org_id, cotizacion_id, tipo, detalle)
              values (${orgId}, ${id}, 'comment', 'La iguala recurrente se cancelará al final del periodo actual — no habrá más cobros')`;
    await logAudit(orgId, { accion: 'cotizacion.iguala_cancelada', entidad: 'cotizacion', entidad_id: id, detalle: 'Cancelación programada al fin de periodo', ip: reqIp(request) });

    return json({ ok: true, estado: 'cancel_at_period_end' });
};

function json(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

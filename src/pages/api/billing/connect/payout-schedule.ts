export const prerender = false;

// Frecuencia de depósito. El artículo de soporte decía literalmente "Cord no
// expone un selector de frecuencia; escríbenos" — una capacidad que el
// proveedor ofrece de serie y que el negocio resolvía por correo.
//
// Es una decisión de tesorería real: cobrar diario cuesta más comisiones fijas
// de transferencia; cobrar mensual junta el dinero pero lo deja lejos. Quien la
// toma es el dueño del negocio, no soporte.

import type { APIRoute } from 'astro';
import { z } from 'zod';
import { sql, getActiveOrgId, withOrgTx } from '../../../../lib/db';
import { requirePerm } from '../../../../lib/queries';
import { retrieveAccount, updateConnectAccount } from '../../../../lib/billing';
import { translateStripeError } from '../../../../lib/stripe-catalogs';
import { auditConnect } from '../../../../lib/connect-audit';
import { limitConnectMutation, limitConnectRead } from '../../../../lib/connect-security';
import { requireFreshAuth } from '../../../../lib/step-up';

const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

// El día del mes se topa en 28 por la MISMA razón que la recurrencia de
// facturas (regla 25): un "31" se salta febrero en silencio, y un depósito que
// no se emite es dinero que no llega.
const Esquema = z.object({
    interval: z.enum(['daily', 'weekly', 'monthly', 'manual']),
    delay_days: z.union([z.literal('minimum'), z.number().int().min(2).max(30)]).optional(),
    weekly_anchor: z.enum(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']).optional(),
    monthly_anchor: z.number().int().min(1).max(28).optional(),
}).strict();

export const GET: APIRoute = async ({ request }) => {
    const denied = await requirePerm('cobros_config');
    if (denied) return denied;
    const orgId = await getActiveOrgId();
    const limited = await limitConnectRead(request, 'payout-schedule', orgId);
    if (limited) return limited;

    const [rows] = await withOrgTx(orgId, sql`select stripe_account_id from orgs where id = ${orgId}`);
    const accountId = rows[0]?.stripe_account_id as string | undefined;
    if (!accountId) return json({ ok: true, schedule: null });

    try {
        const account = await retrieveAccount(accountId);
        const schedule = account?.settings?.payouts?.schedule ?? {};
        return json({
            ok: true,
            schedule: {
                interval: schedule.interval ?? null,
                delay_days: schedule.delay_days ?? null,
                weekly_anchor: schedule.weekly_anchor ?? null,
                monthly_anchor: schedule.monthly_anchor ?? null,
            },
            // Un depósito pausado no es un error de Cord y el negocio tiene que
            // saberlo: `payouts_enabled` en false suele venir de un requisito de
            // verificación pendiente.
            payoutsEnabled: !!account?.payouts_enabled,
        });
    } catch (e: any) {
        return json({ error: translateStripeError(e) }, 400);
    }
};

export const PATCH: APIRoute = async ({ request }) => {
    const denied = await requirePerm('cobros_config');
    if (denied) return denied;
    const orgId = await getActiveOrgId();
    const limited = await limitConnectMutation(request, 'payout-schedule', orgId, 10);
    if (limited) return limited;
    // Cambiar a dónde y cuándo sale el dinero es de la misma clase que cambiar
    // la cuenta de depósito.
    const stale = await requireFreshAuth();
    if (stale) return stale;

    const parsed = Esquema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return json({ error: 'Configuración de depósito no válida.' }, 400);
    const cfg = parsed.data;

    const [rows] = await withOrgTx(orgId, sql`select stripe_account_id from orgs where id = ${orgId}`);
    const accountId = rows[0]?.stripe_account_id as string | undefined;
    if (!accountId) return json({ error: 'Cuenta no creada' }, 400);

    // Los anclajes sólo existen en su intervalo: mandar `weekly_anchor` con
    // `interval: monthly` es un 400 del proveedor con un texto que no le habla
    // al dueño del negocio (regla 14).
    const fields: Record<string, string> = {
        'settings[payouts][schedule][interval]': cfg.interval,
    };
    if (cfg.interval !== 'manual' && cfg.delay_days !== undefined) {
        fields['settings[payouts][schedule][delay_days]'] = String(cfg.delay_days);
    }
    if (cfg.interval === 'weekly' && cfg.weekly_anchor) {
        fields['settings[payouts][schedule][weekly_anchor]'] = cfg.weekly_anchor;
    }
    if (cfg.interval === 'monthly' && cfg.monthly_anchor) {
        fields['settings[payouts][schedule][monthly_anchor]'] = String(cfg.monthly_anchor);
    }

    try {
        const account = await updateConnectAccount(accountId, fields);
        const schedule = account?.settings?.payouts?.schedule ?? {};
        // Espejo local para pintar la pantalla sin una llamada en vivo. La
        // fuente sigue siendo el proveedor: se guarda lo que ÉL devolvió.
        await withOrgTx(orgId, sql`
            update orgs set
                payout_interval       = ${schedule.interval ?? null},
                payout_delay_days     = ${schedule.delay_days ?? null},
                payout_weekly_anchor  = ${schedule.weekly_anchor ?? null},
                payout_monthly_anchor = ${schedule.monthly_anchor ?? null}
            where id = ${orgId}`);
        await auditConnect(orgId, request, 'frecuencia_deposito_actualizada', {
            entityId: accountId,
            detail: `${schedule.interval ?? cfg.interval}${schedule.delay_days != null ? ` · ${schedule.delay_days}d` : ''}`,
        });
        return json({ ok: true, schedule });
    } catch (e: any) {
        return json({ error: translateStripeError(e) }, 400);
    }
};

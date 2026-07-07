// src/pages/api/billing/connect/disconnect.ts
export const prerender = false;

import type { APIRoute } from 'astro';
import { sql, getActiveOrgId, logAudit } from '../../../../lib/db';
import { requirePerm } from '../../../../lib/queries';
import { stripe } from '../../../../lib/billing';

export const POST: APIRoute = async () => {
    const denied = await requirePerm('ajustes');
    if (denied) return denied;

    const orgId = await getActiveOrgId();
    const [org] = await sql`select sandbox_of, stripe_account_id from orgs where id = ${orgId}`;
    if (org?.sandbox_of) {
        return new Response(JSON.stringify({ error: 'Connect no está disponible en el entorno de prueba' }), { status: 409, headers: { 'Content-Type': 'application/json' } });
    }

    if (org?.stripe_account_id) {
        try {
            await stripe(`/v1/accounts/${org.stripe_account_id}`, undefined, 'DELETE');
        } catch (e) {
            // ignore if it fails
        }
    }

    await sql`update orgs set stripe_account_id = null, stripe_account_type = null, stripe_charges_enabled = false, acepta_tarjeta = false, cobro_spei_auto = false where id = ${orgId}`;
    await logAudit(orgId, { accion: 'billing.disconnect', entidad: 'org', entidad_id: orgId, detalle: 'Stripe Connect desconectado' });

    return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
};

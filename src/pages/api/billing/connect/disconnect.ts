// src/pages/api/billing/connect/disconnect.ts
export const prerender = false;

import type { APIRoute } from 'astro';
import { sql, getActiveOrgId } from '../../../../lib/db';
import { requirePerm } from '../../../../lib/queries';
import { currentLocale } from '../../../../lib/context';
import { t } from '../../../../i18n/app';
import { stripe } from '../../../../lib/billing';
import { limitConnectMutation } from '../../../../lib/connect-security';
import { auditConnect } from '../../../../lib/connect-audit';
import { requireFreshAuth } from '../../../../lib/step-up';

export const POST: APIRoute = async ({ request }) => {
    const denied = await requirePerm('cobros_config');
    if (denied) return denied;

    const orgId = await getActiveOrgId();
    const limited = await limitConnectMutation(request, 'disconnect', orgId, 4);
    if (limited) return limited;
    const staleAuth = await requireFreshAuth();
    if (staleAuth) return staleAuth;
    const [org] = await sql`select sandbox_of, stripe_account_id from orgs where id = ${orgId}`;
    if (org?.sandbox_of) {
        return new Response(JSON.stringify({ error: t(currentLocale(), 'err.test.connect') }), { status: 409, headers: { 'Content-Type': 'application/json' } });
    }

    if (org?.stripe_account_id) {
        try {
            await stripe(`/v1/accounts/${org.stripe_account_id}`, undefined, 'DELETE');
        } catch (e) {
            // ignore if it fails
        }
    }

    await sql`update orgs set stripe_account_id = null, stripe_account_type = null, stripe_charges_enabled = false, acepta_tarjeta = false, cobro_spei_auto = false where id = ${orgId}`;
    await auditConnect(orgId, request, 'cuenta_desconectada');

    return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
};

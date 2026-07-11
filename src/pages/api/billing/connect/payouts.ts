export const prerender = false;

import type { APIRoute } from 'astro';
import { sql, getActiveOrgId } from '../../../../lib/db';
import { requirePerm } from '../../../../lib/queries';
import { getBalance, listPayouts } from '../../../../lib/billing';
import { translateStripeError } from '../../../../lib/stripe-catalogs';

export const GET: APIRoute = async () => {
    const denied = await requirePerm('ajustes');
    if (denied) return denied;

    const orgId = await getActiveOrgId();
    const [org] = await sql`select stripe_account_id from orgs where id = ${orgId}`;
    if (!org?.stripe_account_id) {
        return new Response(JSON.stringify({ error: 'No account' }), { status: 400 });
    }

    try {
        const balance = await getBalance(org.stripe_account_id as string);
        const payouts = await listPayouts(org.stripe_account_id as string);

        return new Response(JSON.stringify({ 
            ok: true, 
            balance,
            payouts: payouts.data
        }), { headers: { 'Content-Type': 'application/json' } });
    } catch (e: any) {
        return new Response(JSON.stringify({ error: translateStripeError(e) }), { status: 400 });
    }
};

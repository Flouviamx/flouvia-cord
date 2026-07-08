export const prerender = false;

import type { APIRoute } from 'astro';
import { sql, getActiveOrgId } from '../../../../lib/db';
import { requirePerm } from '../../../../lib/queries';
import { retrieveAccount } from '../../../../lib/billing';

export const GET: APIRoute = async () => {
    const denied = await requirePerm('ajustes');
    if (denied) return denied;

    const orgId = await getActiveOrgId();
    const [org] = await sql`select stripe_account_id from orgs where id = ${orgId}`;
    if (!org?.stripe_account_id) {
        return new Response(JSON.stringify({ error: 'No account' }), { status: 400 });
    }

    try {
        const account = await retrieveAccount(org.stripe_account_id as string);
        
        // Sync local
        await sql`update orgs set 
            stripe_charges_enabled = ${account.charges_enabled},
            stripe_payouts_enabled = ${account.payouts_enabled},
            stripe_details_submitted = ${account.details_submitted},
            stripe_disabled_reason = ${account.requirements?.disabled_reason || null},
            stripe_requirements = ${JSON.stringify(account.requirements)}
            where id = ${orgId}`;

        return new Response(JSON.stringify({ 
            ok: true, 
            account: {
                id: account.id,
                charges_enabled: account.charges_enabled,
                payouts_enabled: account.payouts_enabled,
                details_submitted: account.details_submitted,
                requirements: account.requirements
            }
        }), { headers: { 'Content-Type': 'application/json' } });
    } catch (e: any) {
        return new Response(JSON.stringify({ error: e.message }), { status: 400 });
    }
};

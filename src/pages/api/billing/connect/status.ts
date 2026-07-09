export const prerender = false;

import type { APIRoute } from 'astro';
import { sql, getActiveOrgId } from '../../../../lib/db';
import { requirePerm } from '../../../../lib/queries';
import { retrieveAccount } from '../../../../lib/billing';

export const GET: APIRoute = async () => {
    const denied = await requirePerm('ajustes');
    if (denied) return denied;

    const orgId = await getActiveOrgId();
    const [org] = await sql`select stripe_account_id, stripe_person_id from orgs where id = ${orgId}`;
    if (!org?.stripe_account_id) {
        // No es un error: simplemente aún no hay cuenta (el wizard arranca en cero).
        return new Response(JSON.stringify({ ok: true, account: null }), { headers: { 'Content-Type': 'application/json' } });
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
                business_type: account.business_type,
                charges_enabled: account.charges_enabled,
                payouts_enabled: account.payouts_enabled,
                details_submitted: account.details_submitted,
                disabled_reason: account.requirements?.disabled_reason || null,
                requirements: account.requirements,
                person_id: (org.stripe_person_id as string) || null,
                external_accounts: (account.external_accounts?.data || []).map((ea: any) => ({
                    bank_name: ea.bank_name, last4: ea.last4
                }))
            }
        }), { headers: { 'Content-Type': 'application/json' } });
    } catch (e: any) {
        return new Response(JSON.stringify({ error: e.message }), { status: 400 });
    }
};

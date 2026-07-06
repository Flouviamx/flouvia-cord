// src/pages/api/billing/connect/status.ts
export const prerender = false;

import type { APIRoute } from 'astro';
import { sql, getActiveOrgId } from '../../../../lib/db';
import { requirePerm } from '../../../../lib/queries';
import { getAccountStatus } from '../../../../lib/billing';

export const GET: APIRoute = async () => {
    const denied = await requirePerm('ajustes');
    if (denied) return denied;

    const orgId = await getActiveOrgId();
    const [org] = await sql`select stripe_account_id from orgs where id = ${orgId}`;
    
    if (org?.stripe_account_id) {
        try {
            const { charges_enabled } = await getAccountStatus(org.stripe_account_id as string);
            await sql`update orgs set stripe_charges_enabled = ${charges_enabled} where id = ${orgId}`;
            return new Response(JSON.stringify({ charges_enabled }), { headers: { 'Content-Type': 'application/json' } });
        } catch (e) {
            return new Response(JSON.stringify({ error: 'Failed to fetch status' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
        }
    }
    return new Response(JSON.stringify({ charges_enabled: false }), { headers: { 'Content-Type': 'application/json' } });
};

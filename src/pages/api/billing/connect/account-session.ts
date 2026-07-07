// src/pages/api/billing/connect/account-session.ts
export const prerender = false;

import type { APIRoute } from 'astro';
import { sql, getActiveOrgId } from '../../../../lib/db';
import { requirePerm } from '../../../../lib/queries';
import { createConnectAccount, stripe } from '../../../../lib/billing';

export const POST: APIRoute = async () => {
    const denied = await requirePerm('ajustes');
    if (denied) return denied;

    const orgId = await getActiveOrgId();

    const [org] = await sql`select sandbox_of, stripe_account_id from orgs where id = ${orgId}`;
    if (org?.sandbox_of) {
        return new Response(JSON.stringify({ error: 'Connect no está disponible en el entorno de prueba' }), { status: 409, headers: { 'Content-Type': 'application/json' } });
    }

    let accountId = org?.stripe_account_id as string;
    
    // Lazy creation
    if (!accountId) {
        accountId = await createConnectAccount(orgId, 'express');
        await sql`update orgs set stripe_account_id = ${accountId}, stripe_account_type = 'express' where id = ${orgId}`;
    }

    try {
        const accountSession = await stripe('/v1/account_sessions', {
            account: accountId,
            'components[account_onboarding][enabled]': 'true',
            'components[account_management][enabled]': 'true',
            'components[payouts][enabled]': 'true',
            'components[notification_banner][enabled]': 'true',
        });
    
        return new Response(JSON.stringify({ client_secret: accountSession.client_secret }), { headers: { 'Content-Type': 'application/json' } });
    } catch (e: any) {
        return new Response(JSON.stringify({ error: e.message || 'Error creando sesión de Connect' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }
};

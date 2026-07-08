export const prerender = false;

import type { APIRoute } from 'astro';
import { sql, getActiveOrgId } from '../../../../lib/db';
import { requirePerm } from '../../../../lib/queries';
import { createConnectAccount, retrieveAccount } from '../../../../lib/billing';

export const POST: APIRoute = async ({ request }) => {
    const denied = await requirePerm('ajustes');
    if (denied) return denied;

    const orgId = await getActiveOrgId();
    const [org] = await sql`select sandbox_of, stripe_account_id from orgs where id = ${orgId}`;
    if (org?.sandbox_of) {
        return new Response(JSON.stringify({ error: 'Connect no está disponible en el entorno de prueba' }), { status: 409 });
    }

    const { business_type } = await request.json();
    if (business_type !== 'company' && business_type !== 'individual') {
        return new Response(JSON.stringify({ error: 'business_type inválido' }), { status: 400 });
    }

    let accountId = org?.stripe_account_id as string;
    
    if (!accountId) {
        accountId = await createConnectAccount(orgId, business_type);
        await sql`update orgs set stripe_account_id = ${accountId}, stripe_account_type = 'custom', stripe_business_type = ${business_type} where id = ${orgId}`;
    }

    const account = await retrieveAccount(accountId);
    
    await sql`update orgs set stripe_requirements = ${JSON.stringify(account.requirements)} where id = ${orgId}`;

    return new Response(JSON.stringify({ ok: true, accountId, requirements: account.requirements }), { headers: { 'Content-Type': 'application/json' } });
};

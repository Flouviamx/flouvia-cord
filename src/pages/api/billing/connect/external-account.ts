export const prerender = false;

import type { APIRoute } from 'astro';
import { sql, getActiveOrgId } from '../../../../lib/db';
import { requirePerm } from '../../../../lib/queries';
import { createExternalAccount, retrieveAccount } from '../../../../lib/billing';
import { translateStripeError } from '../../../../lib/stripe-catalogs';

export const POST: APIRoute = async ({ request }) => {
    const denied = await requirePerm('ajustes');
    if (denied) return denied;

    const orgId = await getActiveOrgId();
    const [org] = await sql`select stripe_account_id, stripe_business_type from orgs where id = ${orgId}`;
    if (!org?.stripe_account_id) return new Response(JSON.stringify({ error: 'No account' }), { status: 400 });

    const data = await request.json();
    const { clabe, account_holder_name } = data;

    if (!clabe || !account_holder_name) {
        return new Response(JSON.stringify({ error: 'Falta CLABE o titular' }), { status: 400 });
    }

    try {
        // En Stripe MX se pasa el CLABE completo (18 díg.) en `account_number`, con
        // la sintaxis PLANA `external_account[...]` que entiende URLSearchParams
        // (un objeto anidado se codificaría como "[object Object]").
        const reqFields = {
            'external_account[object]': 'bank_account',
            'external_account[country]': 'MX',
            'external_account[currency]': 'mxn',
            'external_account[account_holder_name]': account_holder_name,
            'external_account[account_holder_type]': data.account_holder_type || (org.stripe_business_type === 'individual' ? 'individual' : 'company'),
            'external_account[account_number]': String(clabe).replace(/\D/g, ''),
        };

        const result = await createExternalAccount(org.stripe_account_id as string, reqFields);
        
        // Guardamos los defaults en DB por consistencia
        await sql`update orgs set banco_clabe = ${clabe}, banco_beneficiario = ${account_holder_name} where id = ${orgId}`;

        const account = await retrieveAccount(org.stripe_account_id as string);
        await sql`update orgs set stripe_requirements = ${JSON.stringify(account.requirements)} where id = ${orgId}`;

        return new Response(JSON.stringify({ ok: true, external_account: result, requirements: account.requirements }), { headers: { 'Content-Type': 'application/json' } });
    } catch (e: any) {
        return new Response(JSON.stringify({ error: translateStripeError(e) }), { status: 400 });
    }
};

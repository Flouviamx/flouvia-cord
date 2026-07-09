export const prerender = false;

import type { APIRoute } from 'astro';
import { sql, getActiveOrgId } from '../../../../lib/db';
import { requirePerm } from '../../../../lib/queries';
import { createConnectAccount, retrieveAccount, updateConnectAccount } from '../../../../lib/billing';

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
    let account: any = null;

    // Si hay cuenta guardada, verificar que siga existiendo en Stripe (en dev se
    // borran cuentas de prueba y el id queda huérfano → se recrea limpia). SOLO se
    // limpia el id cuando Stripe dice explícitamente que la cuenta ya no existe —
    // un error transitorio (red, key) NO debe desconectar una cuenta válida.
    if (accountId) {
        try {
            account = await retrieveAccount(accountId);
        } catch (e: any) {
            const msg = String(e?.message || '');
            if (/no such account|does not have access|has been deleted|account is invalid/i.test(msg)) {
                accountId = '';
                await sql`update orgs set stripe_account_id = null, stripe_charges_enabled = false where id = ${orgId}`;
            } else {
                return new Response(JSON.stringify({ error: msg || 'No se pudo consultar la cuenta de Stripe' }), { status: 502 });
            }
        }
    }

    if (!accountId) {
        accountId = await createConnectAccount(orgId, business_type);
        await sql`update orgs set stripe_account_id = ${accountId}, stripe_account_type = 'custom', stripe_business_type = ${business_type} where id = ${orgId}`;
        account = await retrieveAccount(accountId);
    } else if (account && account.business_type !== business_type && !account.details_submitted) {
        // El usuario cambió Persona Moral ↔ Física antes de enviar sus datos:
        // Stripe permite corregir business_type mientras la cuenta no esté verificada.
        try {
            account = await updateConnectAccount(accountId, { business_type });
            await sql`update orgs set stripe_business_type = ${business_type} where id = ${orgId}`;
        } catch { /* si Stripe lo rechaza, se continúa con el tipo original */ }
    }

    await sql`update orgs set stripe_requirements = ${JSON.stringify(account.requirements)} where id = ${orgId}`;

    return new Response(JSON.stringify({ ok: true, accountId, requirements: account.requirements, business_type: account.business_type }), { headers: { 'Content-Type': 'application/json' } });
};

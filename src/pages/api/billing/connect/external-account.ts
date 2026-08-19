export const prerender = false;

import type { APIRoute } from 'astro';
import { sql, getActiveOrgId } from '../../../../lib/db';
import { requirePerm } from '../../../../lib/queries';
import { createExternalAccount, retrieveAccount } from '../../../../lib/billing';
import { translateStripeError } from '../../../../lib/stripe-catalogs';
import { encryptRequiredSecret } from '../../../../lib/crypto-secret';
import { auditConnect } from '../../../../lib/connect-audit';
import { limitConnectMutation } from '../../../../lib/connect-security';
import { sanitizeStripeRequirements } from '../../../../lib/connect-fields';
import { requireFreshAuth } from '../../../../lib/step-up';

export const POST: APIRoute = async ({ request }) => {
    const denied = await requirePerm('cobros_config');
    if (denied) return denied;

    const orgId = await getActiveOrgId();
    const limited = await limitConnectMutation(request, 'external-account', orgId, 6);
    if (limited) return limited;
    const staleAuth = await requireFreshAuth();
    if (staleAuth) return staleAuth;
    const [org] = await sql`select stripe_account_id, stripe_business_type, banco_clabe_last4, country_code from orgs where id = ${orgId}`;
    if (!org?.stripe_account_id) return new Response(JSON.stringify({ error: 'No account' }), { status: 400 });

    // Este endpoint captura una CLABE: un formato de cuenta EXCLUSIVO de México.
    // Cada país usa el suyo (IBAN, routing + account, sort code), con validaciones
    // y campos distintos. Mientras solo esté implementado el carril mexicano se
    // dice con claridad, en vez de aceptar 18 dígitos de un banco que no los usa
    // y fallar del lado de Stripe con un error incomprensible.
    if (String(org.country_code || 'MX').toUpperCase() !== 'MX') {
        return new Response(JSON.stringify({
            error: 'Por ahora solo podemos registrar cuentas bancarias de México desde aquí. Escríbenos y damos de alta la tuya.',
            code: 'payout_country_unsupported',
        }), { status: 409, headers: { 'Content-Type': 'application/json' } });
    }

    const data = await request.json().catch(() => ({}));
    const clabe = String(data.clabe || '').replace(/\D/g, '');
    const account_holder_name = String(data.account_holder_name || '').trim().slice(0, 120);

    if (!/^\d{18}$/.test(clabe) || !account_holder_name) {
        return new Response(JSON.stringify({ error: 'Falta CLABE o titular' }), { status: 400 });
    }
    if (data.account_holder_type && !['individual', 'company'].includes(data.account_holder_type)) {
        return new Response(JSON.stringify({ error: 'Tipo de titular inválido' }), { status: 400 });
    }

    try {
        const encryptedClabe = encryptRequiredSecret(clabe);
        // En Stripe MX se pasa el CLABE completo (18 díg.) en `account_number`, con
        // la sintaxis PLANA `external_account[...]` que entiende URLSearchParams
        // (un objeto anidado se codificaría como "[object Object]").
        const reqFields = {
            'external_account[object]': 'bank_account',
            'external_account[country]': 'MX',
            'external_account[currency]': 'mxn',
            'external_account[account_holder_name]': account_holder_name,
            'external_account[account_holder_type]': data.account_holder_type || (org.stripe_business_type === 'individual' ? 'individual' : 'company'),
            'external_account[account_number]': clabe,
        };

        const result = await createExternalAccount(org.stripe_account_id as string, reqFields);
        
        await sql`update orgs
                     set banco_clabe = null, banco_clabe_enc = ${encryptedClabe},
                         banco_clabe_last4 = ${clabe.slice(-4)}, banco_beneficiario = ${account_holder_name}
                   where id = ${orgId}`;

        const account = await retrieveAccount(org.stripe_account_id as string);
        const requirements = sanitizeStripeRequirements(account.requirements);
        await sql`update orgs set stripe_requirements = ${JSON.stringify(requirements)} where id = ${orgId}`;
        await auditConnect(orgId, request, 'cuenta_bancaria_actualizada', {
            entity: 'external_account',
            entityId: result.id,
            detail: `last4 ${String(org.banco_clabe_last4 || 'ninguna')} -> ${clabe.slice(-4)}`,
        });

        return new Response(JSON.stringify({ ok: true, external_account: result, requirements }), { headers: { 'Content-Type': 'application/json' } });
    } catch (e: any) {
        return new Response(JSON.stringify({ error: translateStripeError(e) }), { status: 400 });
    }
};

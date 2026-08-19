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
import { validatePayout, stripeExternalAccountFields } from '../../../../lib/payout-fields';
import { currentLocale } from '../../../../lib/context';

export const POST: APIRoute = async ({ request }) => {
    const denied = await requirePerm('cobros_config');
    if (denied) return denied;

    const orgId = await getActiveOrgId();
    const limited = await limitConnectMutation(request, 'external-account', orgId, 6);
    if (limited) return limited;
    const staleAuth = await requireFreshAuth();
    if (staleAuth) return staleAuth;
    const [org] = await sql`select stripe_account_id, stripe_business_type, banco_clabe_last4, country_code, moneda from orgs where id = ${orgId}`;
    if (!org?.stripe_account_id) return new Response(JSON.stringify({ error: 'No account' }), { status: 400 });

    // Cada país identifica una cuenta bancaria a su manera: CLABE en México,
    // IBAN en la zona SEPA, routing + account en Estados Unidos, sort code en
    // Reino Unido. Este endpoint sabía capturar SOLO la CLABE y respondía 409 a
    // todos los demás, así que un negocio en Madrid terminaba su alta de Connect
    // y no tenía cómo decir a dónde mandarle su dinero.
    const pais = String(org.country_code || 'MX').toUpperCase();
    const L = currentLocale();

    const data = await request.json().catch(() => ({}));
    const account_holder_name = String(data.account_holder_name || '').trim().slice(0, 120);
    if (!account_holder_name) {
        return new Response(JSON.stringify({
            error: L === 'en' ? 'Enter the account holder name.' : 'Captura el titular de la cuenta.',
        }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }
    if (data.account_holder_type && !['individual', 'company'].includes(data.account_holder_type)) {
        return new Response(JSON.stringify({ error: 'Tipo de titular inválido' }), { status: 400 });
    }

    // Los dígitos de control se verifican AQUÍ. Dejarlos para Stripe devolvía un
    // error del proveedor que no le dice nada al vendedor, y con una cuenta mal
    // tecleada el dinero queda en el limbo hasta que alguien lo note (regla 14).
    const validation = validatePayout(pais, data, L);
    if (!validation.ok) {
        return new Response(JSON.stringify({ error: validation.error }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }
    const values = validation.values!;
    const principal = values.iban ?? values.clabe ?? values.account_number ?? '';

    try {
        const encryptedAccount = encryptRequiredSecret(principal);
        const reqFields = stripeExternalAccountFields(
            pais,
            String(org.moneda || 'MXN'),
            account_holder_name,
            (data.account_holder_type as 'individual' | 'company') || (org.stripe_business_type === 'individual' ? 'individual' : 'company'),
            values,
        );

        const result = await createExternalAccount(org.stripe_account_id as string, reqFields);

        // Las columnas se llaman `banco_clabe*` por herencia mexicana; guardan la
        // cuenta de depósito sea cual sea su formato. Renombrarlas es una
        // migración aparte y no cambia lo que hacen.
        await sql`update orgs
                     set banco_clabe = null, banco_clabe_enc = ${encryptedAccount},
                         banco_clabe_last4 = ${validation.last4}, banco_beneficiario = ${account_holder_name}
                   where id = ${orgId}`;

        const account = await retrieveAccount(org.stripe_account_id as string);
        const requirements = sanitizeStripeRequirements(account.requirements);
        await sql`update orgs set stripe_requirements = ${JSON.stringify(requirements)} where id = ${orgId}`;
        await auditConnect(orgId, request, 'cuenta_bancaria_actualizada', {
            entity: 'external_account',
            entityId: result.id,
            detail: `last4 ${String(org.banco_clabe_last4 || 'ninguna')} -> ${validation.last4}`,
        });

        return new Response(JSON.stringify({ ok: true, external_account: result, requirements }), { headers: { 'Content-Type': 'application/json' } });
    } catch (e: any) {
        return new Response(JSON.stringify({ error: translateStripeError(e) }), { status: 400 });
    }
};

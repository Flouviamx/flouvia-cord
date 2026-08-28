export const prerender = false;

import type { APIRoute } from 'astro';
import { sql, getActiveOrgId, withOrgTx } from '../../../../lib/db';
import { requirePerm } from '../../../../lib/queries';
import { retrieveAccount } from '../../../../lib/billing';
import { translateStripeError } from '../../../../lib/stripe-catalogs';
import { limitConnectRead } from '../../../../lib/connect-security';
import { sanitizeStripeRequirements, sanitizeFutureRequirements } from '../../../../lib/connect-fields';

export const GET: APIRoute = async ({ request }) => {
    const denied = await requirePerm('cobros_config');
    if (denied) return denied;

    const orgId = await getActiveOrgId();
    const limited = await limitConnectRead(request, 'status', orgId);
    if (limited) return limited;
    const [orgRows] = await withOrgTx(orgId, sql`select stripe_account_id, stripe_person_id from orgs where id = ${orgId}`);
    const org = orgRows[0];
    if (!org?.stripe_account_id) {
        // No es un error: simplemente aún no hay cuenta (el wizard arranca en cero).
        return new Response(JSON.stringify({ ok: true, account: null }), { headers: { 'Content-Type': 'application/json' } });
    }

    try {
        const account = await retrieveAccount(org.stripe_account_id as string);
        // Se sanea UNA vez y se usa para las dos cosas: lo que se guarda y lo que
        // se devuelve. Antes se guardaba la forma recortada pero se devolvía
        // `account.requirements` CRUDO, así que el navegador recibía campos que
        // Cord nunca previó y las dos vistas del mismo dato podían diferir.
        const requirements = sanitizeStripeRequirements(account.requirements);
        const futureRequirements = sanitizeFutureRequirements(account.future_requirements);

        // Sync local
        await withOrgTx(orgId, sql`update orgs set
            stripe_charges_enabled = ${account.charges_enabled},
            stripe_payouts_enabled = ${account.payouts_enabled},
            stripe_details_submitted = ${account.details_submitted},
            stripe_disabled_reason = ${account.requirements?.disabled_reason || null},
            stripe_requirements = ${JSON.stringify(requirements)}
            where id = ${orgId}`);

        return new Response(JSON.stringify({ 
            ok: true, 
            account: {
                id: account.id,
                business_type: account.business_type,
                charges_enabled: account.charges_enabled,
                payouts_enabled: account.payouts_enabled,
                details_submitted: account.details_submitted,
                disabled_reason: account.requirements?.disabled_reason || null,
                requirements,
                // Aviso anticipado: "a partir de esta fecha voy a necesitar
                // esto". Sin leerlo, una cuenta que va a quedar deshabilitada no
                // da ninguna señal hasta el día que deja de cobrar.
                future_requirements: futureRequirements,
                // Estado de verificación de la persona física, con el MOTIVO de un
                // rechazo. Sin esto el usuario vuelve a subir la misma foto borrosa
                // sin enterarse nunca de por qué se rechazó.
                individual_verification: account.individual?.verification ? {
                    status: account.individual.verification.status ?? null,
                    details: account.individual.verification.details ?? null,
                    details_code: account.individual.verification.details_code ?? null,
                    document_details_code: account.individual.verification.document?.details_code ?? null,
                } : null,
                person_id: (org.stripe_person_id as string) || null,
                external_accounts: (account.external_accounts?.data || []).map((ea: any) => ({
                    bank_name: ea.bank_name, last4: ea.last4
                }))
            }
        }), { headers: { 'Content-Type': 'application/json' } });
    } catch (e: any) {
        return new Response(JSON.stringify({ error: translateStripeError(e) }), { status: 400 });
    }
};

export const prerender = false;

import type { APIRoute } from 'astro';
import { sql, getActiveOrgId, reqIp } from '../../../../lib/db';
import { requirePerm } from '../../../../lib/queries';
import { updateConnectAccount } from '../../../../lib/billing';
import { translateStripeError } from '../../../../lib/stripe-catalogs';
import { ACCOUNT_CONNECT_FIELDS, flattenConnectFields, UnknownConnectFieldError } from '../../../../lib/connect-fields';
import { auditConnect } from '../../../../lib/connect-audit';
import { limitConnectMutation } from '../../../../lib/connect-security';
import { FEE_TERMS_VERSION } from '../../../../lib/fees';

export const PATCH: APIRoute = async ({ request }) => {
    const denied = await requirePerm('cobros_config');
    if (denied) return denied;

    const orgId = await getActiveOrgId();
    const limited = await limitConnectMutation(request, 'account', orgId, 20);
    if (limited) return limited;
    const [org] = await sql`select stripe_account_id, stripe_business_type from orgs where id = ${orgId}`;
    if (!org?.stripe_account_id) {
        return new Response(JSON.stringify({ error: 'Cuenta no creada' }), { status: 400 });
    }

    const data = await request.json().catch(() => null);
    let fields: Record<string, string>;
    try {
        fields = flattenConnectFields(data, ACCOUNT_CONNECT_FIELDS, ['tos_acceptance', 'legal_consents']);
    } catch (error) {
        const field = error instanceof UnknownConnectFieldError ? error.field : 'payload';
        return new Response(JSON.stringify({ error: `Campo no permitido: ${field}` }), { status: 400 });
    }

    if (data.tos_acceptance) {
        if (data?.legal_consents?.payments_terms !== FEE_TERMS_VERSION || data?.legal_consents?.privacy !== true) {
            return new Response(JSON.stringify({ error: 'Debes aceptar los términos de Cord Pagos y el Aviso de Privacidad vigentes' }), { status: 400 });
        }
        fields['tos_acceptance[date]'] = Math.floor(Date.now() / 1000).toString();
        fields['tos_acceptance[ip]'] = reqIp(request) || '127.0.0.1';
        fields['tos_acceptance[service_agreement]'] = 'full'; // En Custom de MX se necesita
    }

    if (Object.keys(fields).length === 0) {
        return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
    }

    try {
        const res = await updateConnectAccount(org.stripe_account_id as string, fields);
        await auditConnect(orgId, request, data?.tos_acceptance ? 'terminos_aceptados' : 'cuenta_actualizada', {
            entityId: org.stripe_account_id as string,
            detail: data?.tos_acceptance
                ? `Acuerdo Stripe, Aviso de Privacidad y términos ${FEE_TERMS_VERSION} aceptados con IP y fecha del servidor`
                : Object.keys(fields).join(', '),
        });
        return new Response(JSON.stringify({ ok: true, requirements: res.requirements }), { headers: { 'Content-Type': 'application/json' } });
    } catch (e: any) {
        return new Response(JSON.stringify({ error: translateStripeError(e) }), { status: 400 });
    }
};

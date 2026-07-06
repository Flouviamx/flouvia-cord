// src/pages/api/billing/connect/callback.ts
export const prerender = false;

import type { APIRoute } from 'astro';
import { sql, getActiveOrgId, logAudit } from '../../../../lib/db';
import { requirePerm } from '../../../../lib/queries';
import { exchangeOAuthCode, getAccountStatus } from '../../../../lib/billing';

export const GET: APIRoute = async ({ url, cookies }) => {
    const denied = await requirePerm('ajustes');
    if (denied) return denied;

    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    const orgId = await getActiveOrgId();

    const [org] = await sql`select sandbox_of, stripe_account_id, stripe_account_type from orgs where id = ${orgId}`;
    if (org?.sandbox_of) {
        return new Response('Entorno de prueba', { status: 409 });
    }

    if (code) {
        // Verifica el nonce anti-CSRF contra la cookie fijada en /connect/start.
        const savedState = cookies.get('cord_connect_state')?.value;
        cookies.delete('cord_connect_state', { path: '/' });
        if (!state || !savedState || state !== savedState) return new Response('Invalid state', { status: 400 });
        try {
            const accountId = await exchangeOAuthCode(code);
            const { charges_enabled } = await getAccountStatus(accountId);
            await sql`update orgs set stripe_account_id = ${accountId}, stripe_account_type = 'standard', stripe_charges_enabled = ${charges_enabled} where id = ${orgId}`;
            await logAudit(orgId, { accion: 'billing.connect', entidad: 'org', entidad_id: orgId, detalle: 'Stripe Connect (Standard) enlazado' });
        } catch (e) {
            console.error(e);
            return new Response('Failed to connect account', { status: 500 });
        }
    } else if (org?.stripe_account_type === 'express' && org?.stripe_account_id) {
        try {
            const { charges_enabled } = await getAccountStatus(org.stripe_account_id as string);
            await sql`update orgs set stripe_charges_enabled = ${charges_enabled} where id = ${orgId}`;
            await logAudit(orgId, { accion: 'billing.connect', entidad: 'org', entidad_id: orgId, detalle: 'Stripe Connect (Express) onboarding completado' });
        } catch (e) {
            console.error(e);
            return new Response('Failed to check account status', { status: 500 });
        }
    }

    return new Response(null, { status: 302, headers: { Location: '/app/ajustes/cobros' } });
};

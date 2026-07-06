// src/pages/api/billing/connect/start.ts
export const prerender = false;

import crypto from 'node:crypto';
import type { APIRoute } from 'astro';
import { sql, getActiveOrgId, logAudit } from '../../../../lib/db';
import { requirePerm } from '../../../../lib/queries';
import { createConnectAccount, createAccountLink, getConnectOAuthUrl } from '../../../../lib/billing';

export const POST: APIRoute = async ({ request, url, cookies }) => {
    const denied = await requirePerm('ajustes');
    if (denied) return denied;

    let body: any;
    try { body = await request.json(); } catch { return new Response('Bad request', { status: 400 }); }

    const type = body.type === 'express' ? 'express' : 'standard';
    const orgId = await getActiveOrgId();

    const [org] = await sql`select sandbox_of, stripe_account_id from orgs where id = ${orgId}`;
    if (org?.sandbox_of) {
        return new Response(JSON.stringify({ error: 'Connect no está disponible en el entorno de prueba' }), { status: 409, headers: { 'Content-Type': 'application/json' } });
    }

    if (type === 'standard') {
        // Nonce anti-CSRF: se guarda en cookie httpOnly y se verifica en el callback.
        const state = crypto.randomBytes(16).toString('hex');
        cookies.set('cord_connect_state', state, {
            httpOnly: true, secure: import.meta.env.PROD, sameSite: 'lax', path: '/', maxAge: 600,
        });
        const redirectUri = new URL('/api/billing/connect/callback', url.origin).toString();
        const oauthUrl = getConnectOAuthUrl(state, redirectUri);
        return new Response(JSON.stringify({ url: oauthUrl }), { headers: { 'Content-Type': 'application/json' } });
    } else {
        let accountId = org?.stripe_account_id as string;
        if (!accountId) {
            accountId = await createConnectAccount(orgId, 'express');
            await sql`update orgs set stripe_account_id = ${accountId}, stripe_account_type = 'express' where id = ${orgId}`;
        }
        const returnUrl = new URL('/api/billing/connect/callback', url.origin).toString();
        const refreshUrl = new URL('/app/ajustes/cobros', url.origin).toString();
        const link = await createAccountLink(accountId, returnUrl, refreshUrl);
        return new Response(JSON.stringify({ url: link }), { headers: { 'Content-Type': 'application/json' } });
    }
};

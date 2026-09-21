// POST /api/oauth/authorize — la decisión del consentimiento. Es un formulario
// de la propia pantalla de Cord, con sesión y CSRF de mismo origen. Nada de lo
// que llega en el cuerpo se toma por bueno: cliente, redirect, scope y espacio
// se validan otra vez contra lo registrado y contra la membresía real.
export const prerender = false;

import type { APIRoute } from 'astro';
import { currentUserId } from '../../../lib/context';
import { rateLimit, tooMany } from '../../../lib/ratelimit';
import { buildRedirect, isValidCodeChallenge, parseScope, redirectAllowed } from '../../../lib/oauth-core';
import { authorizableOrgs, getOAuthClient, issueAuthorizationCode } from '../../../lib/oauth-provider';

const back = (to: string) => new Response(null, { status: 303, headers: { Location: to, 'Cache-Control': 'no-store' } });
const problem = (code: string) => back(`/oauth/authorize?error=${encodeURIComponent(code)}`);

export const POST: APIRoute = async ({ request }) => {
    const userId = currentUserId();
    if (!userId) return new Response(JSON.stringify({ error: 'No autorizado' }), { status: 401, headers: { 'Content-Type': 'application/json' } });

    const rl = await rateLimit(`oauth-authorize:${userId}`, 30, 60);
    if (!rl.ok) return tooMany(rl.retryAfter);

    let form: FormData;
    try { form = await request.formData(); } catch { return problem('invalid_request'); }
    const field = (k: string) => { const v = form.get(k); return typeof v === 'string' ? v : null; };

    const client = await getOAuthClient(field('client_id'));
    const redirectUri = field('redirect_uri');
    if (!client || !redirectAllowed(client.redirectUris, redirectUri)) return problem('unknown_client');
    const redirect = redirectUri as string;
    const state = field('state');

    if (field('decision') !== 'allow') {
        return back(buildRedirect(redirect, { error: 'access_denied', state }));
    }

    const scope = parseScope(field('scope'));
    const challenge = field('code_challenge');
    if (!scope || (challenge && (!isValidCodeChallenge(challenge) || field('code_challenge_method') !== 'S256'))) {
        return back(buildRedirect(redirect, { error: 'invalid_request', state }));
    }

    const orgId = field('org_id');
    const orgs = await authorizableOrgs(userId);
    if (!orgId || !orgs.some((o) => o.id === orgId)) {
        return back(buildRedirect(redirect, { error: 'access_denied', state }));
    }

    const code = await issueAuthorizationCode({ client, userId, orgId, scope, redirectUri: redirect, codeChallenge: challenge });
    return back(buildRedirect(redirect, { code, state }));
};

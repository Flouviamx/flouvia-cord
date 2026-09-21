// POST /api/oauth/revoke — RFC 7009. Responde 200 aunque el token no exista:
// quien revoca no debe poder averiguar qué tokens son válidos.
export const prerender = false;

import type { APIRoute } from 'astro';
import { reqIp } from '../../../lib/db';
import { rateLimit, tooMany } from '../../../lib/ratelimit';
import { clientSecretMatches, readClientCredentials } from '../../../lib/oauth-core';
import { getOAuthClient, revokeToken } from '../../../lib/oauth-provider';

const HEADERS = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };

export const POST: APIRoute = async ({ request }) => {
    const rl = await rateLimit(`oauth-revoke:${reqIp(request) ?? 'anon'}`, 120, 60);
    if (!rl.ok) return tooMany(rl.retryAfter);

    let body: URLSearchParams;
    try { body = new URLSearchParams(await request.text()); } catch { body = new URLSearchParams(); }

    const creds = readClientCredentials(request.headers.get('authorization'), body);
    const client = await getOAuthClient(creds.clientId);
    if (!client || !clientSecretMatches(creds.clientSecret, client.secretHash)) {
        return new Response(JSON.stringify({ error: 'invalid_client' }), { status: 401, headers: HEADERS });
    }
    const token = body.get('token');
    if (token) await revokeToken(client, token);
    return new Response('{}', { status: 200, headers: HEADERS });
};

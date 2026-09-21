// POST /api/oauth/token — canje de código y renovación (RFC 6749). Lo llama el
// SERVIDOR de la app externa, sin sesión ni cookies: la credencial es el
// secreto del cliente más el código o refresh token de un solo uso.
export const prerender = false;

import type { APIRoute } from 'astro';
import { reqIp } from '../../../lib/db';
import { rateLimit, tooMany } from '../../../lib/ratelimit';
import { clientSecretMatches, readClientCredentials } from '../../../lib/oauth-core';
import { exchangeAuthorizationCode, getOAuthClient, refreshTokens, type TokenResult } from '../../../lib/oauth-provider';

const HEADERS = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', Pragma: 'no-cache' };

const fail = (error: string, description: string, status = 400) =>
    new Response(JSON.stringify({ error, error_description: description }), { status, headers: HEADERS });

async function readBody(request: Request): Promise<URLSearchParams | null> {
    const type = request.headers.get('content-type') || '';
    try {
        if (type.includes('application/json')) {
            const data = await request.json();
            const out = new URLSearchParams();
            for (const [k, v] of Object.entries(data ?? {})) if (typeof v === 'string') out.set(k, v);
            return out;
        }
        return new URLSearchParams(await request.text());
    } catch {
        return null;
    }
}

export const POST: APIRoute = async ({ request }) => {
    const ip = reqIp(request);
    const rl = await rateLimit(`oauth-token:${ip ?? 'anon'}`, 300, 60);
    if (!rl.ok) return tooMany(rl.retryAfter);

    const body = await readBody(request);
    if (!body) return fail('invalid_request', 'El cuerpo de la petición no se pudo leer.');

    const creds = readClientCredentials(request.headers.get('authorization'), body);
    const client = await getOAuthClient(creds.clientId);
    if (!client || !clientSecretMatches(creds.clientSecret, client.secretHash)) {
        return fail('invalid_client', 'Las credenciales de la aplicación no son válidas.', 401);
    }

    const grantType = body.get('grant_type');
    let result: TokenResult;
    if (grantType === 'authorization_code') {
        const code = body.get('code');
        const redirectUri = body.get('redirect_uri');
        if (!code || !redirectUri) return fail('invalid_request', 'Faltan code o redirect_uri.');
        result = await exchangeAuthorizationCode({ client, code, redirectUri, codeVerifier: body.get('code_verifier'), ip });
    } else if (grantType === 'refresh_token') {
        const refreshToken = body.get('refresh_token');
        if (!refreshToken) return fail('invalid_request', 'Falta refresh_token.');
        result = await refreshTokens(client, refreshToken);
    } else {
        return fail('unsupported_grant_type', 'Solo se admite authorization_code y refresh_token.');
    }

    if (!result.ok) {
        return result.error === 'too_many_grants'
            ? fail('invalid_request', 'Este espacio ya tiene demasiadas conexiones de esta aplicación. Revoca las que no uses en Ajustes.')
            : fail('invalid_grant', 'El código o el token no es válido, ya se usó o venció.');
    }
    return new Response(JSON.stringify(result.tokens), { status: 200, headers: HEADERS });
};

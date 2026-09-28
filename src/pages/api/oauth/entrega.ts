// POST /api/oauth/entrega — el cliente sin redirect propio (complemento de
// Gmail) recoge su autorización con el `state` que él generó, su secreto y su
// verificador PKCE, y recibe los tokens como en /api/oauth/token.
export const prerender = false;

import type { APIRoute } from 'astro';
import { reqIp } from '../../../lib/db';
import { rateLimit, tooMany } from '../../../lib/ratelimit';
import { clientSecretMatches, isValidEntregaState, readClientCredentials } from '../../../lib/oauth-core';
import { exchangeAuthorizationCode, getOAuthClient, recogerEntrega } from '../../../lib/oauth-provider';

const HEADERS = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', Pragma: 'no-cache' };

const fail = (error: string, description: string, status = 400) =>
    new Response(JSON.stringify({ error, error_description: description }), { status, headers: HEADERS });

export const POST: APIRoute = async ({ request }) => {
    const ip = reqIp(request);
    const rl = await rateLimit(`oauth-entrega:${ip ?? 'anon'}`, 120, 60);
    if (!rl.ok) return tooMany(rl.retryAfter);

    let body: URLSearchParams;
    try { body = new URLSearchParams(await request.text()); } catch { return fail('invalid_request', 'El cuerpo de la petición no se pudo leer.'); }

    const creds = readClientCredentials(request.headers.get('authorization'), body);
    const client = await getOAuthClient(creds.clientId);
    if (!client || !clientSecretMatches(creds.clientSecret, client.secretHash)) {
        return fail('invalid_client', 'Las credenciales de la aplicación no son válidas.', 401);
    }

    const state = body.get('state');
    const verifier = body.get('code_verifier');
    if (!isValidEntregaState(state) || !verifier) return fail('invalid_request', 'Faltan state o code_verifier.');

    const entrega = await recogerEntrega(client, state);
    if (!entrega) return fail('authorization_pending', 'Todavía no hay una autorización para recoger.');

    const result = await exchangeAuthorizationCode({ client, code: entrega.code, redirectUri: entrega.redirectUri, codeVerifier: verifier, ip });
    if (!result.ok) {
        return result.error === 'too_many_grants'
            ? fail('invalid_request', 'Este espacio ya tiene demasiadas conexiones de esta aplicación. Revoca las que no uses en Ajustes.')
            : fail('invalid_grant', 'La autorización no es válida o venció.');
    }
    return new Response(JSON.stringify(result.tokens), { status: 200, headers: HEADERS });
};

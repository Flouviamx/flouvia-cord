export const prerender = false;

import type { APIRoute } from 'astro';
import { generateAuthenticationOptions } from '@simplewebauthn/server';
import { sql } from '../../../lib/db';
import { strictLimitResponse, strictRateLimit } from '../../../lib/ratelimit';
import { trustedIp } from '../../../lib/ip';
import { sha256Hex } from '../../../lib/auth';
import {
    OPS_PASSKEY_CHALLENGE_COOKIE,
    createOpsPasskeyChallenge,
    isAllowedOpsEmail,
    normalizeOpsEmail,
    opsChallengeCookieOptions,
} from '../../../lib/ops-auth';

const rpID = import.meta.env.PROD ? 'cordhq.app' : 'localhost';

export const POST: APIRoute = async ({ request, cookies }) => {
    const ip = trustedIp(request);
    const limit = await strictRateLimit(`ops-passkey-options:${ip}`, 10, 300);
    const limited = strictLimitResponse(limit);
    if (limited) return limited;

    const contentLength = Number(request.headers.get('content-length') || 0);
    if (contentLength > 2_048) {
        return new Response(JSON.stringify({ error: 'invalid_request' }), { status: 400 });
    }

    let email = '';
    try {
        const body = await request.json();
        email = normalizeOpsEmail(body?.email);
    } catch {}
    if (email.length > 254) email = '';
    const accountLimit = await strictRateLimit(`ops-passkey-account:${sha256Hex(email || 'missing')}`, 10, 300);
    const accountLimited = strictLimitResponse(accountLimit);
    if (accountLimited) return accountLimited;

    let credentials: Array<{ id: string; transports?: any }> = [];
    let operatorId: string | null = null;
    if (isAllowedOpsEmail(email)) {
        const rows = await sql`
            select u.id as operator_id, p.id, p.transports
            from users u
            join ops_operators o on o.user_id = u.id and o.active = true
            left join passkeys p on p.user_id = u.id
            where lower(u.email) = ${email} and lower(o.email) = ${email}
              and u.email_verified_at is not null and u.suspended_at is null
        `;
        operatorId = rows.length ? rows[0].operator_id as string : null;
        credentials = rows.filter((row: any) => row.id).map((row: any) => {
            const transports = Array.isArray(row.transports) ? row.transports : [];
            // Ops se usa desde la computadora del operador. Si la credencial
            // declara transporte interno, no anunciamos `hybrid`: Chrome deja
            // de priorizar el QR del teléfono y solicita Touch ID/local.
            const localTransports = transports.includes('internal')
                ? ['internal']
                : transports.filter((transport: string) => transport !== 'hybrid');
            return {
                id: row.id as string,
                transports: localTransports.length > 0 ? localTransports : undefined,
            };
        });
    }

    // Cuenta inexistente/no autorizada recibe una respuesta WebAuthn válida
    // con lista vacía; no revelamos por HTTP si el correo es operador.
    const options = await generateAuthenticationOptions({
        rpID,
        allowCredentials: credentials,
        userVerification: 'required',
        timeout: 60_000,
    });
    await createOpsPasskeyChallenge(options.challenge, operatorId);
    cookies.set(OPS_PASSKEY_CHALLENGE_COOKIE, options.challenge, opsChallengeCookieOptions());
    return new Response(JSON.stringify(options), {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
};

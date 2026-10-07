export const prerender = false;

import type { APIRoute } from 'astro';
import { verifyAuthenticationResponse } from '@simplewebauthn/server';
import { sql } from '../../../lib/db';
import { strictLimitResponse, strictRateLimit } from '../../../lib/ratelimit';
import { trustedIp } from '../../../lib/ip';
import { sendOpsLoginAlertEmail } from '../../../lib/auth-email';
import { log } from '../../../lib/log';
import {
    OPS_ORIGIN,
    OPS_PASSKEY_CHALLENGE_COOKIE,
    OPS_RP_ID,
    OPS_SESSION_COOKIE,
    consumeOpsPasskeyChallenge,
    createOpsSession,
    isAllowedOpsEmail,
    logOpsAudit,
    normalizeOpsEmail,
    opsCookieDeleteOptions,
    opsSessionCookieOptions,
    resetOpsLockout,
} from '../../../lib/ops-auth';

export const POST: APIRoute = async ({ request, cookies }) => {
    const ip = trustedIp(request);
    const userAgent = request.headers.get('user-agent') || 'desconocido';
    const limit = await strictRateLimit(`ops-passkey-verify:${ip}`, 10, 300);
    const limited = strictLimitResponse(limit);
    if (limited) return limited;

    const contentLength = Number(request.headers.get('content-length') || 0);
    if (contentLength > 65_536) {
        return new Response(JSON.stringify({ error: 'invalid_request' }), { status: 400 });
    }

    const expectedChallenge = cookies.get(OPS_PASSKEY_CHALLENGE_COOKIE)?.value;
    cookies.delete(OPS_PASSKEY_CHALLENGE_COOKIE, opsCookieDeleteOptions());
    let challengedOperatorId: string | null = null;
    try {
        challengedOperatorId = await consumeOpsPasskeyChallenge(expectedChallenge);
    } catch (error) {
        log.error('error no controlado', { route: 'ops/auth/passkey-challenge', err: error });
        return new Response(JSON.stringify({ error: 'internal_error' }), { status: 500 });
    }
    if (!expectedChallenge || !challengedOperatorId) {
        return new Response(JSON.stringify({ error: 'challenge_expired' }), { status: 400 });
    }

    let body: any;
    try {
        body = await request.json();
    } catch {
        return new Response(JSON.stringify({ error: 'invalid_request' }), { status: 400 });
    }
    if (!body?.id || typeof body.id !== 'string' || body.id.length > 1_024) {
        return new Response(JSON.stringify({ error: 'invalid_request' }), { status: 400 });
    }

    try {
        const rows = await sql`
            select p.id, p.public_key, p.counter, p.operator_id as user_id, p.transports,
                   u.email, u.email_verified_at, u.suspended_at, o.active,
                   o.email as operator_email
            from ops_passkeys p
            join users u on u.id = p.operator_id
            join ops_operators o on o.user_id = u.id
            where p.id = ${body.id} and p.operator_id = ${challengedOperatorId}
            limit 1
        `;
        if (!rows.length) {
            return new Response(JSON.stringify({ error: 'invalid_credential' }), { status: 401 });
        }
        const passkey = rows[0] as any;
        const email = normalizeOpsEmail(passkey.email);
        if (
            !passkey.active ||
            !passkey.email_verified_at ||
            passkey.suspended_at ||
            !isAllowedOpsEmail(email) ||
            normalizeOpsEmail(passkey.operator_email) !== email
        ) {
            await logOpsAudit({
                action: 'ops.login_passkey',
                result: 'denied',
                metadata: { credential_hash: body.id.slice(0, 12) },
                ip,
                userAgent,
            });
            return new Response(JSON.stringify({ error: 'invalid_credential' }), { status: 401 });
        }

        let verification;
        try {
            verification = await verifyAuthenticationResponse({
                response: body,
                expectedChallenge,
                expectedOrigin: OPS_ORIGIN,
                expectedRPID: OPS_RP_ID,
                requireUserVerification: true,
                credential: {
                    id: passkey.id as string,
                    publicKey: Buffer.from(passkey.public_key as string, 'base64url'),
                    counter: Number(passkey.counter),
                    transports: passkey.transports || undefined,
                },
            });
        } catch {
            await logOpsAudit({
                actorUserId: passkey.user_id,
                actorEmail: email,
                action: 'ops.login_passkey',
                result: 'failure',
                ip,
                userAgent,
            });
            return new Response(JSON.stringify({ error: 'invalid_credential' }), { status: 401 });
        }

        if (!verification.verified || !verification.authenticationInfo?.userVerified) {
            return new Response(JSON.stringify({ error: 'invalid_credential' }), { status: 401 });
        }

        const updated = await sql`
            update ops_passkeys set counter = ${verification.authenticationInfo.newCounter}, last_used_at = now()
            where id = ${passkey.id} and operator_id = ${challengedOperatorId}
              and counter = ${Number(passkey.counter)}
            returning id
        `;
        if (!updated.length) {
            await logOpsAudit({
                actorUserId: passkey.user_id,
                actorEmail: email,
                action: 'ops.login_passkey',
                result: 'denied',
                metadata: { reason: 'credential_race' },
                ip,
                userAgent,
            });
            return new Response(JSON.stringify({ error: 'invalid_credential' }), { status: 401 });
        }
        await resetOpsLockout(passkey.user_id);
        const sessionToken = await createOpsSession(
            passkey.user_id,
            'passkey',
            userAgent,
            ip,
            passkey.id,
        );
        cookies.set(OPS_SESSION_COOKIE, sessionToken, opsSessionCookieOptions());
        await logOpsAudit({
            actorUserId: passkey.user_id,
            actorEmail: email,
            action: 'ops.login',
            metadata: { method: 'passkey' },
            ip,
            userAgent,
        });
        sendOpsLoginAlertEmail(email, ip, userAgent).catch(() => null);
        return new Response(JSON.stringify({ success: true }), { status: 200 });
    } catch (error) {
        log.error('error no controlado', { route: 'ops/auth/passkey', err: error });
        return new Response(JSON.stringify({ error: 'internal_error' }), { status: 500 });
    }
};

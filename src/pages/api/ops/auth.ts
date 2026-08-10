// Login de Cord Ops: en producción password correcto SIEMPRE continúa a TOTP.
// Passkeys usan endpoints separados. Localhost admite sesión Cord + password.
export const prerender = false;

import type { APIRoute } from 'astro';
import { sql } from '../../../lib/db';
import {
    checkAndConsumeLockout,
    recordFailedLogin,
    resetFailedLogins,
    SESSION_COOKIE,
    sha256Hex,
    validateSession,
    verifyAndMaybeUpgrade,
} from '../../../lib/auth';
import { verifyTotp } from '../../../lib/totp';
import { strictLimitResponse, strictRateLimit } from '../../../lib/ratelimit';
import { trustedIp } from '../../../lib/ip';
import { sendOpsLoginAlertEmail } from '../../../lib/auth-email';
import {
    OPS_CHALLENGE_COOKIE,
    OPS_PASSKEY_CHALLENGE_COOKIE,
    OPS_SESSION_COOKIE,
    consumeOpsChallenge,
    createOpsChallenge,
    createOpsSession,
    invalidateOpsSession,
    isAllowedOpsEmail,
    logOpsAudit,
    normalizeOpsEmail,
    opsChallengeCookieOptions,
    opsSessionCookieOptions,
} from '../../../lib/ops-auth';

const GENERIC_ERROR = 'invalid_credentials';

async function jsonBody(request: Request, maxBytes = 4_096): Promise<any | null> {
    const contentLength = Number(request.headers.get('content-length') || 0);
    if (contentLength > maxBytes) return null;
    try {
        const body = await request.json();
        return body && typeof body === 'object' ? body : null;
    } catch {
        return null;
    }
}

/** Contraseña: sesión local reforzada en dev; reto TOTP de 5 min en prod. */
export const POST: APIRoute = async ({ request, cookies }) => {
    const ip = trustedIp(request);
    const userAgent = request.headers.get('user-agent') || 'desconocido';
    const ipLimit = await strictRateLimit(`ops-password-ip:${ip}`, 5, 60);
    const ipLimited = strictLimitResponse(ipLimit);
    if (ipLimited) return ipLimited;

    const body = await jsonBody(request);
    const email = normalizeOpsEmail(body?.email);
    const password = typeof body?.password === 'string' && body.password.length <= 1_024 ? body.password : '';
    const safeEmail = email.length <= 254 ? email : '';
    const accountLimit = await strictRateLimit(`ops-password-account:${sha256Hex(safeEmail || 'missing')}`, 5, 300);
    const accountLimited = strictLimitResponse(accountLimit);
    if (accountLimited) return accountLimited;

    if (!safeEmail || !password || !isAllowedOpsEmail(safeEmail)) {
        await verifyAndMaybeUpgrade('', password, null);
        await logOpsAudit({
            action: 'ops.login_password',
            result: 'denied',
            metadata: { identifier_hash: sha256Hex(safeEmail || 'missing') },
            ip,
            userAgent,
        });
        return new Response(JSON.stringify({ error: GENERIC_ERROR }), { status: 401 });
    }

    try {
        const rows = await sql`
            select u.id, u.email, u.password_hash, u.email_verified_at,
                   u.totp_enabled, u.totp_secret, u.totp_confirmed_at,
                   u.suspended_at, o.active
            from users u
            join ops_operators o on o.user_id = u.id
            where lower(u.email) = ${safeEmail} and lower(o.email) = ${safeEmail}
            limit 1
        `;
        if (!rows.length || !rows[0].active) {
            await verifyAndMaybeUpgrade('', password, null);
            return new Response(JSON.stringify({ error: GENERIC_ERROR }), { status: 401 });
        }

        const user = rows[0] as any;
        if (await checkAndConsumeLockout(user.id)) {
            await logOpsAudit({
                actorUserId: user.id,
                actorEmail: safeEmail,
                action: 'ops.login_password',
                result: 'denied',
                metadata: { reason: 'account_locked' },
                ip,
                userAgent,
            });
            return new Response(JSON.stringify({ error: 'account_locked' }), {
                status: 423,
                headers: { 'Retry-After': '900' },
            });
        }

        const validPassword = await verifyAndMaybeUpgrade(user.id, password, user.password_hash);
        if (!validPassword) {
            await recordFailedLogin(user.id);
            await logOpsAudit({
                actorUserId: user.id,
                actorEmail: safeEmail,
                action: 'ops.login_password',
                result: 'failure',
                ip,
                userAgent,
            });
            return new Response(JSON.stringify({ error: GENERIC_ERROR }), { status: 401 });
        }

        // Ergonomía exclusiva de desarrollo. En loopback exigimos DOS pruebas:
        // una sesión normal de Cord vigente para el mismo usuario y volver a
        // escribir su contraseña. Esta rama no existe en producción.
        const hostname = new URL(request.url).hostname.toLowerCase();
        const isLoopbackDev = !import.meta.env.PROD &&
            (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1');
        if (isLoopbackDev && user.email_verified_at && !user.suspended_at) {
            const cordToken = cookies.get(SESSION_COOKIE)?.value;
            const cordSession = cordToken ? await validateSession(cordToken) : null;
            if (!cordSession || cordSession.userId !== user.id) {
                return new Response(JSON.stringify({ error: 'local_session_required' }), { status: 403 });
            }

            await resetFailedLogins(user.id);
            const sessionToken = await createOpsSession(
                user.id,
                'local_session_password',
                userAgent,
                ip,
            );
            cookies.set(OPS_SESSION_COOKIE, sessionToken, opsSessionCookieOptions());
            await logOpsAudit({
                actorUserId: user.id,
                actorEmail: safeEmail,
                action: 'ops.login',
                metadata: { method: 'local_session_password', environment: 'development' },
                ip,
                userAgent,
            });
            return new Response(JSON.stringify({ success: true }), { status: 200 });
        }

        // Después de demostrar la contraseña sí podemos explicar por qué no se
        // permite continuar sin revelar información a un atacante anónimo.
        if (
            user.suspended_at ||
            !user.email_verified_at ||
            !user.totp_enabled ||
            !user.totp_secret ||
            !user.totp_confirmed_at
        ) {
            await logOpsAudit({
                actorUserId: user.id,
                actorEmail: safeEmail,
                action: 'ops.login_password',
                result: 'denied',
                metadata: { reason: 'strong_factor_required' },
                ip,
                userAgent,
            });
            return new Response(JSON.stringify({ error: 'strong_factor_required' }), { status: 403 });
        }

        await resetFailedLogins(user.id);
        const challenge = await createOpsChallenge(user.id);
        cookies.set(OPS_CHALLENGE_COOKIE, challenge, opsChallengeCookieOptions());
        return new Response(JSON.stringify({ success: true, mfaRequired: true }), { status: 200 });
    } catch (error) {
        console.error('[ops/auth/password]', error);
        return new Response(JSON.stringify({ error: 'internal_error' }), { status: 500 });
    }
};

/** Segundo paso: consume el reto y exige TOTP. Códigos de respaldo no abren Ops. */
export const PUT: APIRoute = async ({ request, cookies }) => {
    const ip = trustedIp(request);
    const userAgent = request.headers.get('user-agent') || 'desconocido';
    const ipLimit = await strictRateLimit(`ops-totp-ip:${ip}`, 8, 300);
    const ipLimited = strictLimitResponse(ipLimit);
    if (ipLimited) return ipLimited;

    const challengeToken = cookies.get(OPS_CHALLENGE_COOKIE)?.value;
    cookies.delete(OPS_CHALLENGE_COOKIE, { path: '/' });
    let operatorId: string | null = null;
    try {
        operatorId = await consumeOpsChallenge(challengeToken);
    } catch (error) {
        console.error('[ops/auth/totp-challenge]', error);
        return new Response(JSON.stringify({ error: 'internal_error' }), { status: 500 });
    }
    if (!operatorId) {
        return new Response(JSON.stringify({ error: 'challenge_expired' }), { status: 400 });
    }

    const body = await jsonBody(request);
    const code = typeof body?.code === 'string' ? body.code.trim() : '';

    try {
        const rows = await sql`
            select u.email, u.email_verified_at, u.suspended_at,
                   u.totp_enabled, u.totp_secret, u.totp_confirmed_at,
                   o.email as operator_email, o.active
            from users u join ops_operators o on o.user_id = u.id
            where u.id = ${operatorId}
            limit 1
        `;
        if (!rows.length) {
            return new Response(JSON.stringify({ error: 'invalid_state' }), { status: 400 });
        }
        const user = rows[0] as any;
        const email = normalizeOpsEmail(user.email);
        const valid =
            user.active &&
            user.email_verified_at &&
            !user.suspended_at &&
            isAllowedOpsEmail(email) &&
            normalizeOpsEmail(user.operator_email) === email &&
            user.totp_enabled &&
            typeof user.totp_secret === 'string' &&
            user.totp_confirmed_at &&
            /^[0-9]{6}$/.test(code) &&
            verifyTotp(user.totp_secret, code);

        if (!valid) {
            await recordFailedLogin(operatorId);
            await logOpsAudit({
                actorUserId: operatorId,
                actorEmail: email,
                action: 'ops.login_totp',
                result: 'failure',
                ip,
                userAgent,
            });
            return new Response(JSON.stringify({ error: 'invalid_code' }), { status: 401 });
        }

        await resetFailedLogins(operatorId);
        const sessionToken = await createOpsSession(operatorId, 'password_totp', userAgent, ip);
        cookies.set(OPS_SESSION_COOKIE, sessionToken, opsSessionCookieOptions());
        await logOpsAudit({
            actorUserId: operatorId,
            actorEmail: email,
            action: 'ops.login',
            metadata: { method: 'password_totp' },
            ip,
            userAgent,
        });
        sendOpsLoginAlertEmail(email, ip, userAgent).catch(() => null);
        return new Response(JSON.stringify({ success: true }), { status: 200 });
    } catch (error) {
        console.error('[ops/auth/totp]', error);
        return new Response(JSON.stringify({ error: 'internal_error' }), { status: 500 });
    }
};

export const DELETE: APIRoute = async ({ request, cookies }) => {
    const token = cookies.get(OPS_SESSION_COOKIE)?.value;
    await invalidateOpsSession(token, trustedIp(request), request.headers.get('user-agent') || 'desconocido');
    cookies.delete(OPS_SESSION_COOKIE, { path: '/' });
    cookies.delete(OPS_CHALLENGE_COOKIE, { path: '/' });
    cookies.delete(OPS_PASSKEY_CHALLENGE_COOKIE, { path: '/' });
    return new Response(JSON.stringify({ success: true }), { status: 200 });
};

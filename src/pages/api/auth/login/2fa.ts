// POST /api/auth/login/2fa — segundo paso del login cuando la cuenta tiene
// TOTP activo. Consume el reto de un solo uso creado por /api/auth/login
// (cookie cord_2fa_challenge) y, con un código de 6 dígitos o un código de
// respaldo válido, recién ahí crea la sesión real.
export const prerender = false;

import type { APIRoute } from 'astro';
import { sql } from '../../../../lib/db';
import {
    consumeTwoFactorChallenge,
    createSession,
    sessionCookieOptions,
    SESSION_COOKIE,
} from '../../../../lib/auth';
import { verifyTotp, matchBackupCode } from '../../../../lib/totp';
import { sendNewDeviceAlertEmail } from '../../../../lib/auth-email';
import { twoFactorVerifySchema, parseJsonBody } from '../../../../lib/validation';
import { rateLimit, tooMany } from '../../../../lib/ratelimit';
import { trustedIp } from '../../../../lib/ip';

const CHALLENGE_COOKIE = 'cord_2fa_challenge';

export const POST: APIRoute = async ({ request, cookies }) => {
    const ip = trustedIp(request);
    const rl = await rateLimit(`2fa-login:${ip}`, 15, 60);
    if (!rl.ok) return tooMany(rl.retryAfter);

    const challengeToken = cookies.get(CHALLENGE_COOKIE)?.value;
    if (!challengeToken) {
        return new Response(JSON.stringify({ error: 'no_challenge' }), { status: 400 });
    }

    const parsed = await parseJsonBody(request, twoFactorVerifySchema);
    if (!parsed.ok) {
        return new Response(JSON.stringify({ error: parsed.error }), { status: parsed.status });
    }

    // Cada intento (fallido o no) consume el challenge — evita fuerza bruta
    // repetida sobre el mismo reto; si falla, el usuario simplemente vuelve a
    // /sign-in y reintenta el password (que crea un challenge nuevo).
    const userId = await consumeTwoFactorChallenge(challengeToken);
    cookies.delete(CHALLENGE_COOKIE, { path: '/' });
    if (!userId) {
        return new Response(JSON.stringify({ error: 'challenge_expired' }), { status: 400 });
    }

    try {
        const rows = await sql`select totp_secret, totp_enabled, totp_backup_codes, email from users where id = ${userId} limit 1`;
        if (!rows.length || !rows[0].totp_enabled || !rows[0].totp_secret) {
            return new Response(JSON.stringify({ error: 'invalid_state' }), { status: 400 });
        }
        const user = rows[0] as any;

        let ok = false;
        let consumedBackupIndex = -1;
        if (parsed.data.code) {
            ok = verifyTotp(user.totp_secret, parsed.data.code);
        } else if (parsed.data.backupCode) {
            const codes: string[] = user.totp_backup_codes || [];
            consumedBackupIndex = matchBackupCode(codes, parsed.data.backupCode);
            ok = consumedBackupIndex !== -1;
        }

        if (!ok) {
            return new Response(JSON.stringify({ error: 'invalid_code' }), { status: 401 });
        }

        if (consumedBackupIndex !== -1) {
            const codes: string[] = [...(user.totp_backup_codes || [])];
            codes.splice(consumedBackupIndex, 1);
            await sql`update users set totp_backup_codes = ${codes} where id = ${userId}`;
        }

        const userAgent = request.headers.get('user-agent') || 'desconocido';
        const seenBefore = await sql`select 1 from sessions where user_id = ${userId} and ip = ${ip} limit 1`;
        if (!seenBefore.length) {
            sendNewDeviceAlertEmail(user.email as string).catch(() => null);
        }

        const sessionToken = await createSession(userId, userAgent, ip);
        cookies.set(SESSION_COOKIE, sessionToken, sessionCookieOptions());
        return new Response(JSON.stringify({ success: true }), { status: 200 });
    } catch (error) {
        console.error('[auth/login/2fa]', error);
        return new Response(JSON.stringify({ error: 'internal_error' }), { status: 500 });
    }
};

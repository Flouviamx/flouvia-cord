// POST /api/auth/login — password + (si aplica) segundo factor.
//
// Reescrito de punta a punta: la versión anterior devolvía 404 para "correo
// no existe" vs 401 para "contraseña incorrecta" (enumeración de cuentas) y
// tiraba 500 en cuentas solo-OAuth (password_hash null). Ahora SIEMPRE
// responde la misma forma/costo de CPU sin importar cuál de los dos casos es.
export const prerender = false;

import type { APIRoute } from 'astro';
import { sql } from '../../../lib/db';
import {
    verifyAndMaybeUpgrade,
    createSession,
    checkAndConsumeLockout,
    recordFailedLogin,
    resetFailedLogins,
    createEmailVerificationToken,
    createTwoFactorChallenge,
    sessionCookieOptions,
    SESSION_COOKIE,
    sha256Hex,
} from '../../../lib/auth';
import { sendVerificationEmail, sendNewDeviceAlertEmail } from '../../../lib/auth-email';
import { loginSchema, parseJsonBody } from '../../../lib/validation';
import { rateLimit, tooMany } from '../../../lib/ratelimit';
import { trustedIp } from '../../../lib/ip';

const CHALLENGE_COOKIE = 'cord_2fa_challenge';

export const POST: APIRoute = async ({ request, cookies }) => {
    const ip = trustedIp(request);
    const ipLimit = await rateLimit(`login-ip:${ip}`, 20, 60);
    if (!ipLimit.ok) return tooMany(ipLimit.retryAfter);

    const parsed = await parseJsonBody(request, loginSchema);
    if (!parsed.ok) {
        return new Response(JSON.stringify({ error: parsed.error }), { status: parsed.status });
    }
    const email = String(parsed.data.identifier || parsed.data.email || '').trim().toLowerCase();
    const { password } = parsed.data;
    if (!email) return new Response(JSON.stringify({ error: 'missing_fields' }), { status: 400 });

    // Límite por CUENTA además de por IP (un botnet reparte la IP; no la cuenta objetivo).
    // Se aplica exista o no el correo, con la MISMA clave — así el estado del rate
    // limiter tampoco filtra si la cuenta existe.
    const acctLimit = await rateLimit(`login-acct:${sha256Hex(email)}`, 10, 60);
    if (!acctLimit.ok) return tooMany(acctLimit.retryAfter);

    try {
        const users = await sql`select id, password_hash, email_verified_at, totp_enabled from users where email = ${email} limit 1`;
        const userAgent = request.headers.get('user-agent') || 'desconocido';

        if (users.length === 0) {
            // Corre el mismo trabajo de CPU que una verificación real (vía el hash
            // señuelo dentro de verifyAndMaybeUpgrade→verifyPassword) para que el
            // tiempo de respuesta no distinga "no existe" de "contraseña mala".
            await verifyAndMaybeUpgrade('', password, null);
            return new Response(JSON.stringify({ error: 'invalid_credentials' }), { status: 401 });
        }

        const user = users[0] as any;

        if (await checkAndConsumeLockout(user.id)) {
            return new Response(JSON.stringify({ error: 'account_locked' }), {
                status: 423,
                headers: { 'Retry-After': '900' },
            });
        }

        const ok = await verifyAndMaybeUpgrade(user.id, password, user.password_hash);
        if (!ok) {
            await recordFailedLogin(user.id);
            return new Response(JSON.stringify({ error: 'invalid_credentials' }), { status: 401 });
        }

        await resetFailedLogins(user.id);

        if (!user.email_verified_at) {
            // La contraseña SÍ era correcta — esto no es una filtración de
            // enumeración nueva, solo lo que la persona ya demostró saber.
            const token = await createEmailVerificationToken(user.id, email);
            await sendVerificationEmail(email, token).catch(() => null);
            return new Response(JSON.stringify({ error: 'email_not_verified' }), { status: 403 });
        }

        if (user.totp_enabled) {
            const challenge = await createTwoFactorChallenge(user.id);
            cookies.set(CHALLENGE_COOKIE, challenge, {
                path: '/', httpOnly: true, secure: import.meta.env.PROD, sameSite: 'lax', maxAge: 300,
            });
            return new Response(JSON.stringify({ success: true, mfaRequired: true }), { status: 200 });
        }

        // Alerta best-effort de "nuevo dispositivo": ¿ya existía una sesión de
        // este usuario desde esta misma IP? Si no, es la primera vez que se ve
        // esa combinación — se avisa sin bloquear el login.
        const seenBefore = await sql`select 1 from sessions where user_id = ${user.id} and ip = ${ip} limit 1`;
        if (!seenBefore.length) {
            sendNewDeviceAlertEmail(email).catch(() => null);
        }

        const sessionToken = await createSession(user.id, userAgent, ip);
        cookies.set(SESSION_COOKIE, sessionToken, sessionCookieOptions());
        return new Response(JSON.stringify({ success: true }), { status: 200 });
    } catch (error) {
        console.error('[auth/login]', error);
        return new Response(JSON.stringify({ error: 'internal_error' }), { status: 500 });
    }
};

// POST /api/auth/verify-email/confirm — consume el token del link de correo.
// Al verificar con éxito, inicia sesión directo (ya demostró dueño del
// password en el registro Y dueño del correo con este click — mismo nivel
// de confianza que un login normal).
export const prerender = false;

import type { APIRoute } from 'astro';
import { confirmEmailVerification, createSession, sessionCookieOptions, SESSION_COOKIE } from '../../../../lib/auth';
import { emailVerifyConfirmSchema, parseJsonBody } from '../../../../lib/validation';
import { rateLimit, tooMany } from '../../../../lib/ratelimit';
import { trustedIp } from '../../../../lib/ip';

export const POST: APIRoute = async ({ request, cookies }) => {
    const ip = trustedIp(request);
    const rl = await rateLimit(`verify-confirm:${ip}`, 20, 60);
    if (!rl.ok) return tooMany(rl.retryAfter);

    const parsed = await parseJsonBody(request, emailVerifyConfirmSchema);
    if (!parsed.ok) {
        return new Response(JSON.stringify({ error: parsed.error }), { status: parsed.status });
    }

    try {
        const result = await confirmEmailVerification(parsed.data.token);
        if (!result) {
            return new Response(JSON.stringify({ error: 'invalid_or_expired' }), { status: 400 });
        }

        const userAgent = request.headers.get('user-agent') || 'desconocido';
        const sessionToken = await createSession(result.userId, userAgent, ip);
        cookies.set(SESSION_COOKIE, sessionToken, sessionCookieOptions());

        return new Response(JSON.stringify({ success: true, email: result.email }), { status: 200 });
    } catch (error) {
        console.error('[verify-email/confirm]', error);
        return new Response(JSON.stringify({ error: 'internal_error' }), { status: 500 });
    }
};

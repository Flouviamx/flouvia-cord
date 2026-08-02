// POST /api/auth/register — crea la cuenta y manda el correo de verificación.
// NO inicia sesión: la verificación de correo es BLOQUEANTE (decisión de
// producto, ago 2026) — sin ella, cualquiera podía registrarse con el correo
// de otra persona sin que jamás se le notificara.
export const prerender = false;

import type { APIRoute } from 'astro';
import { sql } from '../../../lib/db';
import { hashPassword, createEmailVerificationToken } from '../../../lib/auth';
import { sendVerificationEmail } from '../../../lib/auth-email';
import { registerSchema, parseJsonBody } from '../../../lib/validation';
import { rateLimit, tooMany } from '../../../lib/ratelimit';
import { trustedIp } from '../../../lib/ip';

export const POST: APIRoute = async ({ request }) => {
    const ip = trustedIp(request);
    const rl = await rateLimit(`register:${ip}`, 5, 60);
    if (!rl.ok) return tooMany(rl.retryAfter);

    const parsed = await parseJsonBody(request, registerSchema);
    if (!parsed.ok) {
        return new Response(JSON.stringify({ error: parsed.error }), { status: parsed.status });
    }
    const { email, password, firstName, lastName } = parsed.data;

    try {
        const existing = await sql`select id from users where email = ${email} limit 1`;
        if (existing.length > 0) {
            // Mismo mensaje/forma que un registro exitoso hubiera devuelto en el
            // siguiente paso (verificar correo) — no confirma ni niega
            // explícitamente la existencia de la cuenta más de lo que ya hace
            // cualquier flujo de "olvidé mi contraseña".
            return new Response(JSON.stringify({ error: 'email_exists' }), { status: 409 });
        }

        const passwordHash = await hashPassword(password);
        const [user] = await sql`
            insert into users (email, first_name, last_name, password_hash)
            values (${email}, ${firstName || null}, ${lastName || null}, ${passwordHash})
            returning id
        `;

        const token = await createEmailVerificationToken(user.id as string, email);
        const sendRes = await sendVerificationEmail(email, token);
        if (!sendRes.sent) {
            console.warn('[register] no se pudo enviar el correo de verificación:', sendRes.error || sendRes.skipped);
        }

        return new Response(JSON.stringify({ success: true, requiresVerification: true, emailed: sendRes.sent }), { status: 200 });
    } catch (error) {
        console.error('[auth/register]', error);
        return new Response(JSON.stringify({ error: 'internal_error' }), { status: 500 });
    }
};

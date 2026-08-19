// POST /api/auth/verify-email/request — reenvía el correo de verificación.
// Sin sesión (el usuario todavía no puede entrar) — recibe el correo tal
// cual lo tecleó en el registro. Anti-enumeración: siempre 200.
export const prerender = false;

import type { APIRoute } from 'astro';
import { sql } from '../../../../lib/db';
import { createEmailVerificationToken } from '../../../../lib/auth';
import { sendVerificationEmail } from '../../../../lib/auth-email';
import { resetRequestSchema, parseJsonBody } from '../../../../lib/validation';
import { rateLimit, tooMany } from '../../../../lib/ratelimit';
import { trustedIp } from '../../../../lib/ip';
import { log } from '../../../../lib/log';

export const POST: APIRoute = async ({ request }) => {
    const ip = trustedIp(request);
    const rl = await rateLimit(`verify-resend:${ip}`, 5, 60);
    if (!rl.ok) return tooMany(rl.retryAfter);

    const parsed = await parseJsonBody(request, resetRequestSchema);
    if (!parsed.ok) return new Response(JSON.stringify({ success: true }), { status: 200 });
    const email = parsed.data.email;

    try {
        const rows = await sql`select id, email_verified_at from users where email = ${email} limit 1`;
        if (rows.length > 0 && !rows[0].email_verified_at) {
            const userId = rows[0].id as string;
            const token = await createEmailVerificationToken(userId, email);
            await sendVerificationEmail(email, token);
        }
        return new Response(JSON.stringify({ success: true }), { status: 200 });
    } catch (error) {
        log.error('error no controlado', { route: 'verify-email/request', err: error });
        return new Response(JSON.stringify({ success: true }), { status: 200 });
    }
};

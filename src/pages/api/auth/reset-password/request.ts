// POST /api/auth/reset-password/request — inicia el flujo de reset. Siempre
// responde 200 exista o no la cuenta (anti-enumeración); el trabajo real
// (token + correo) solo ocurre si el correo sí tiene cuenta.
export const prerender = false;

import type { APIRoute } from 'astro';
import { sql } from '../../../../lib/db';
import { createPasswordResetToken } from '../../../../lib/auth';
import { sendPasswordResetEmail } from '../../../../lib/auth-email';
import { resetRequestSchema, parseJsonBody } from '../../../../lib/validation';
import { rateLimit, tooMany } from '../../../../lib/ratelimit';
import { trustedIp } from '../../../../lib/ip';
import { log } from '../../../../lib/log';

export const POST: APIRoute = async ({ request }) => {
    const ip = trustedIp(request);
    const rl = await rateLimit(`reset-request:${ip}`, 5, 60);
    if (!rl.ok) return tooMany(rl.retryAfter);

    const parsed = await parseJsonBody(request, resetRequestSchema);
    if (!parsed.ok) {
        // Formato de correo inválido tampoco se distingue con detalle — 200 genérico.
        return new Response(JSON.stringify({ success: true }), { status: 200 });
    }
    const email = parsed.data.email;

    try {
        const rows = await sql`select id from users where email = ${email} limit 1`;
        if (rows.length > 0) {
            const userId = rows[0].id as string;
            const token = await createPasswordResetToken(userId);
            const sendRes = await sendPasswordResetEmail(email, token);
            if (!sendRes.sent) {
                log.warn('Resend no envió el correo', { route: 'reset/request', err: sendRes.error || sendRes.skipped });
            }
        }
        return new Response(JSON.stringify({ success: true }), { status: 200 });
    } catch (error) {
        log.error('error no controlado', { route: 'reset/request', err: error });
        // Incluso ante un error interno, no revelar más que un 200 genérico —
        // el estado de la cuenta no debe filtrarse por la forma de la respuesta.
        return new Response(JSON.stringify({ success: true }), { status: 200 });
    }
};

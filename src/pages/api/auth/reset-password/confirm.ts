// POST /api/auth/reset-password/confirm — establece la contraseña nueva.
//
// Reescrito (ago 2026): la versión anterior escribía el literal 'dummy_hash'
// como password_hash — cada reset completado dejaba la cuenta PERMANENTEMENTE
// bloqueada (ningún password vuelve a verificar contra ese valor). Ahora
// hashea de verdad con Argon2id.
export const prerender = false;

import type { APIRoute } from 'astro';
import { sql } from '../../../../lib/db';
import {
    lookupPasswordResetToken,
    consumePasswordResetToken,
    hashPassword,
    revokeAllSessions,
    resetFailedLogins,
} from '../../../../lib/auth';
import { resetConfirmSchema, parseJsonBody } from '../../../../lib/validation';
import { rateLimit, tooMany } from '../../../../lib/ratelimit';
import { trustedIp } from '../../../../lib/ip';
import { log } from '../../../../lib/log';

export const POST: APIRoute = async ({ request }) => {
    const ip = trustedIp(request);
    const rl = await rateLimit(`reset-confirm:${ip}`, 10, 60);
    if (!rl.ok) return tooMany(rl.retryAfter);

    const parsed = await parseJsonBody(request, resetConfirmSchema);
    if (!parsed.ok) {
        return new Response(JSON.stringify({ error: parsed.error }), { status: parsed.status });
    }
    const { token, password } = parsed.data;

    try {
        const userId = await lookupPasswordResetToken(token);
        if (!userId) {
            return new Response(JSON.stringify({ error: 'El enlace es inválido o ha expirado.' }), { status: 400 });
        }

        const passwordHash = await hashPassword(password);
        await sql`
            update users
            set password_hash = ${passwordHash}, password_changed_at = now(), updated_at = now()
            where id = ${userId}
        `;

        // El reset es también una forma legítima de "desbloquear" la cuenta.
        await resetFailedLogins(userId);
        // Invalida TODAS las sesiones vivas — quien tenía acceso antes del
        // reset (ej. un atacante con la contraseña vieja) queda fuera.
        await revokeAllSessions(userId);
        await consumePasswordResetToken(token);
        await sql`delete from password_reset_tokens where user_id = ${userId}`;

        return new Response(JSON.stringify({ success: true }), { status: 200 });
    } catch (error) {
        log.error('error no controlado', { route: 'reset/confirm', err: error });
        return new Response(JSON.stringify({ error: 'Ocurrió un error inesperado' }), { status: 500 });
    }
};

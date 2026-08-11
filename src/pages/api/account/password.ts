// POST /api/account/password { currentPassword, newPassword } — cambia la
// contraseña. Exige la actual (evita que una sesión robada la cambie sin
// saber la contraseña real) y revoca TODAS las demás sesiones al terminar —
// la sesión que hizo el cambio se queda viva.
export const prerender = false;

import type { APIRoute } from 'astro';
import { sql } from '../../../lib/db';
import { currentUserId } from '../../../lib/context';
import {
    verifyPassword,
    hashPassword,
    revokeAllSessions,
    sha256Hex,
    SESSION_COOKIE,
} from '../../../lib/auth';
import { passwordChangeSchema, parseJsonBody } from '../../../lib/validation';
import { rateLimit, tooMany } from '../../../lib/ratelimit';

export const POST: APIRoute = async ({ request, cookies }) => {
    const userId = currentUserId();
    if (!userId) return new Response(JSON.stringify({ error: 'No autenticado' }), { status: 401 });

    const rl = await rateLimit(`account-password:${userId}`, 10, 60);
    if (!rl.ok) return tooMany(rl.retryAfter);

    const parsed = await parseJsonBody(request, passwordChangeSchema);
    if (!parsed.ok) return new Response(JSON.stringify({ error: parsed.error }), { status: parsed.status });
    const { currentPassword, newPassword } = parsed.data;

    const [user] = await sql`select password_hash from users where id = ${userId} limit 1`;
    if (!user) return new Response(JSON.stringify({ error: 'internal_error' }), { status: 500 });

    // Cuenta OAuth-only (sin password todavía): permitir ESTABLECER una,
    // sin exigir "la actual" (no existe). Cuentas con password real sí la exigen.
    const hasRealPassword = !!user.password_hash && user.password_hash !== 'dummy_hash';
    if (hasRealPassword) {
        const ok = currentPassword
            ? await verifyPassword(currentPassword, user.password_hash as string)
            : false;
        if (!ok) return new Response(JSON.stringify({ error: 'wrong_password' }), { status: 401 });
    }

    const newHash = await hashPassword(newPassword);
    await sql`update users set password_hash = ${newHash}, password_changed_at = now(), updated_at = now() where id = ${userId}`;

    const currentToken = cookies.get(SESSION_COOKIE)?.value;
    const currentSessionId = currentToken ? sha256Hex(currentToken) : undefined;
    await revokeAllSessions(userId, currentSessionId);

    return new Response(JSON.stringify({ ok: true }), { status: 200 });
};

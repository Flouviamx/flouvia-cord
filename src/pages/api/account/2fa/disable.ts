// POST /api/account/2fa/disable { password? , code? } — desactiva 2FA. Exige
// re-confirmación: la contraseña actual si la cuenta tiene una, o si no
// (OAuth-only) un código TOTP vigente — nunca se apaga con solo tener la
// sesión abierta (una sesión robada no debería poder quitar el segundo factor).
export const prerender = false;

import type { APIRoute } from 'astro';
import { z } from 'zod';
import { sql } from '../../../../lib/db';
import { currentUserId } from '../../../../lib/context';
import { reauthenticate } from '../../../../lib/auth';
import { parseJsonBody } from '../../../../lib/validation';
import { rateLimit, tooMany } from '../../../../lib/ratelimit';

const schema = z.object({
    password: z.string().max(256).optional(),
    code: z.string().trim().max(64).optional(),
});

export const POST: APIRoute = async ({ request }) => {
    const userId = currentUserId();
    if (!userId) return new Response(JSON.stringify({ error: 'No autenticado' }), { status: 401 });

    const rl = await rateLimit(`2fa-disable:${userId}`, 10, 60);
    if (!rl.ok) return tooMany(rl.retryAfter);

    const parsed = await parseJsonBody(request, schema);
    if (!parsed.ok) return new Response(JSON.stringify({ error: parsed.error }), { status: parsed.status });

    const [user] = await sql`select totp_enabled from users where id = ${userId} limit 1`;
    if (!user?.totp_enabled) return new Response(JSON.stringify({ error: 'not_enabled' }), { status: 409 });

    const confirmed = await reauthenticate(userId, parsed.data);
    if (!confirmed) return new Response(JSON.stringify({ error: 'confirmation_required' }), { status: 401 });

    await sql`
        update users
        set totp_enabled = false, totp_secret = null, totp_secret_enc = null,
            totp_backup_codes = null, totp_confirmed_at = null
        where id = ${userId}`;

    return new Response(JSON.stringify({ ok: true }), { status: 200 });
};

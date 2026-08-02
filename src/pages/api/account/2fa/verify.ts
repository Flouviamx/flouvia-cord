// POST /api/account/2fa/verify { code } — confirma el código generado con el
// secreto pendiente (de /2fa/start) y ACTIVA 2FA. Genera 10 códigos de
// respaldo, devueltos en claro UNA sola vez (solo se guardan sus hashes).
export const prerender = false;

import type { APIRoute } from 'astro';
import { z } from 'zod';
import { sql } from '../../../../lib/db';
import { currentUserId } from '../../../../lib/context';
import { verifyTotp, generateBackupCodes, hashBackupCode } from '../../../../lib/totp';
import { parseJsonBody } from '../../../../lib/validation';
import { rateLimit, tooMany } from '../../../../lib/ratelimit';

const schema = z.object({ code: z.string().trim().regex(/^\d{6}$/) });

export const POST: APIRoute = async ({ request }) => {
    const userId = currentUserId();
    if (!userId) return new Response(JSON.stringify({ error: 'No autenticado' }), { status: 401 });

    const rl = await rateLimit(`2fa-verify:${userId}`, 15, 60);
    if (!rl.ok) return tooMany(rl.retryAfter);

    const parsed = await parseJsonBody(request, schema);
    if (!parsed.ok) return new Response(JSON.stringify({ error: parsed.error }), { status: parsed.status });

    const [user] = await sql`select totp_secret, totp_enabled from users where id = ${userId} limit 1`;
    if (!user?.totp_secret) return new Response(JSON.stringify({ error: 'no_pending_setup' }), { status: 409 });
    if (user.totp_enabled) return new Response(JSON.stringify({ error: 'already_enabled' }), { status: 409 });

    if (!verifyTotp(user.totp_secret as string, parsed.data.code)) {
        return new Response(JSON.stringify({ error: 'invalid_code' }), { status: 401 });
    }

    const backupCodes = generateBackupCodes(10);
    const hashed = backupCodes.map(hashBackupCode);
    await sql`
        update users
        set totp_enabled = true, totp_confirmed_at = now(), totp_backup_codes = ${hashed}
        where id = ${userId}`;

    return new Response(JSON.stringify({ ok: true, backupCodes }), { status: 200, headers: { 'Content-Type': 'application/json' } });
};

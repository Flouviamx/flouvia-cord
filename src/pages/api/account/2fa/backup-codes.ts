// POST /api/account/2fa/backup-codes { password?, code? } — regenera los 10
// códigos de respaldo (invalida los anteriores). Misma re-confirmación que
// /2fa/disable.
export const prerender = false;

import type { APIRoute } from 'astro';
import { z } from 'zod';
import { sql } from '../../../../lib/db';
import { currentUserId } from '../../../../lib/context';
import { verifyPassword } from '../../../../lib/auth';
import { verifyTotp, matchBackupCode, generateBackupCodes, hashBackupCode } from '../../../../lib/totp';
import { parseJsonBody } from '../../../../lib/validation';
import { rateLimit, tooMany } from '../../../../lib/ratelimit';
import { decryptSecret } from '../../../../lib/crypto-secret';

const schema = z.object({
    password: z.string().max(256).optional(),
    code: z.string().trim().max(64).optional(),
});

export const POST: APIRoute = async ({ request }) => {
    const userId = currentUserId();
    if (!userId) return new Response(JSON.stringify({ error: 'No autenticado' }), { status: 401 });

    const rl = await rateLimit(`2fa-backup:${userId}`, 10, 60);
    if (!rl.ok) return tooMany(rl.retryAfter);

    const parsed = await parseJsonBody(request, schema);
    if (!parsed.ok) return new Response(JSON.stringify({ error: parsed.error }), { status: parsed.status });

    const [user] = await sql`select password_hash, totp_secret, totp_secret_enc, totp_enabled, totp_backup_codes from users where id = ${userId} limit 1`;
    if (!user?.totp_enabled) return new Response(JSON.stringify({ error: 'not_enabled' }), { status: 409 });
    const totpSecret = decryptSecret(user.totp_secret_enc as string | null) || (user.totp_secret as string | null);

    const hasRealPassword = !!user.password_hash && user.password_hash !== 'dummy_hash';
    let confirmed = false;
    if (hasRealPassword && parsed.data.password) {
        confirmed = await verifyPassword(parsed.data.password, user.password_hash as string);
    } else if (parsed.data.code && totpSecret) {
        confirmed = verifyTotp(totpSecret, parsed.data.code)
            || matchBackupCode((user.totp_backup_codes as string[]) || [], parsed.data.code) !== -1;
    }
    if (!confirmed) return new Response(JSON.stringify({ error: 'confirmation_required' }), { status: 401 });

    const backupCodes = generateBackupCodes(10);
    const hashed = backupCodes.map(hashBackupCode);
    await sql`update users set totp_backup_codes = ${hashed} where id = ${userId}`;

    return new Response(JSON.stringify({ ok: true, backupCodes }), { status: 200 });
};

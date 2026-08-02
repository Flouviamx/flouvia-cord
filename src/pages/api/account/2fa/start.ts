// POST /api/account/2fa/start — genera un secreto TOTP nuevo y lo devuelve
// como QR (SVG) + secreto en texto (para captura manual). El secreto se
// guarda en `users.totp_secret` pero `totp_enabled` queda en false hasta que
// /2fa/verify confirme un código real — un secreto sin confirmar es inerte
// (no lo consulta ningún gate ni el login).
export const prerender = false;

import type { APIRoute } from 'astro';
import QRCode from 'qrcode';
import { sql } from '../../../../lib/db';
import { currentUserId } from '../../../../lib/context';
import { generateTotpSecret, totpAuthUri } from '../../../../lib/totp';
import { rateLimit, tooMany } from '../../../../lib/ratelimit';

export const POST: APIRoute = async () => {
    const userId = currentUserId();
    if (!userId) return new Response(JSON.stringify({ error: 'No autenticado' }), { status: 401 });

    const rl = await rateLimit(`2fa-start:${userId}`, 10, 60);
    if (!rl.ok) return tooMany(rl.retryAfter);

    const [user] = await sql`select email, totp_enabled from users where id = ${userId} limit 1`;
    if (!user) return new Response(JSON.stringify({ error: 'internal_error' }), { status: 500 });
    if (user.totp_enabled) return new Response(JSON.stringify({ error: 'already_enabled' }), { status: 409 });

    const secret = generateTotpSecret();
    await sql`update users set totp_secret = ${secret} where id = ${userId}`;

    const uri = totpAuthUri(secret, user.email as string, 'Cord');
    let qrSvg = '';
    try {
        qrSvg = await QRCode.toString(uri, { type: 'svg', margin: 1, color: { dark: '#0a192f', light: '#0000' } });
    } catch { /* el QR es decorativo — la captura manual del secreto sigue funcionando */ }

    return new Response(JSON.stringify({ secret, uri, qrSvg }), { status: 200, headers: { 'Content-Type': 'application/json' } });
};

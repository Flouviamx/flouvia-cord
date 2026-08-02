// POST /api/ops/auth — entra al panel interno /ops con la clave compartida
// de operaciones (OPS_SECRET).
//
// Reescrito (ago 2026): antes la cookie `cord_ops_token` guardaba el SECRETO
// MISMO en claro — cualquier fuga de esa cookie (log de acceso, XSS, un
// navegador compartido) entregaba la llave maestra completa y permanente, y
// la única forma de revocarla era rotar OPS_SECRET para TODOS. Ahora la
// cookie es un token de sesión opaco y aleatorio; solo su sha256 se guarda
// (tabla `ops_sessions`, con expiración real). También: comparación
// constant-time del secreto, y rate limit (antes no tenía ninguno).
export const prerender = false;

import type { APIRoute } from 'astro';
import { sql } from '../../../lib/db';
import { sha256Hex } from '../../../lib/auth';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { rateLimit, tooMany } from '../../../lib/ratelimit';
import { trustedIp } from '../../../lib/ip';

const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 días

export const POST: APIRoute = async ({ request, cookies }) => {
    const rl = await rateLimit(`ops-auth:${trustedIp(request)}`, 5, 60);
    if (!rl.ok) return tooMany(rl.retryAfter);

    let body: any;
    try { body = await request.json(); } catch { return new Response(JSON.stringify({ error: 'JSON inválido' }), { status: 400 }); }
    const secret = String(body?.secret ?? '');

    const validSecret = import.meta.env.OPS_SECRET;
    if (!validSecret) {
        return new Response(JSON.stringify({ error: 'OPS_SECRET no configurado en servidor' }), { status: 503 });
    }

    const a = Buffer.from(secret);
    const b = Buffer.from(validSecret);
    const ok = a.length === b.length && timingSafeEqual(a, b);
    if (!ok) {
        return new Response(JSON.stringify({ error: 'Clave incorrecta' }), { status: 401 });
    }

    const token = randomBytes(32).toString('hex');
    const tokenHash = sha256Hex(token);
    await sql`insert into ops_sessions (id, expires_at) values (${tokenHash}, now() + interval '7 days')`;

    cookies.set('cord_ops_token', token, {
        path: '/',
        httpOnly: true,
        secure: import.meta.env.PROD,
        sameSite: 'lax',
        maxAge: SESSION_TTL_SECONDS,
    });

    return new Response(JSON.stringify({ success: true }), { status: 200 });
};

export const DELETE: APIRoute = async ({ cookies }) => {
    const token = cookies.get('cord_ops_token')?.value;
    if (token) {
        await sql`delete from ops_sessions where id = ${sha256Hex(token)}`;
    }
    cookies.delete('cord_ops_token', { path: '/' });
    return new Response(JSON.stringify({ success: true }), { status: 200 });
};

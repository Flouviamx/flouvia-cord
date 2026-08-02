// GET /api/account/sessions — lista las sesiones activas del usuario.
// DELETE /api/account/sessions { id? } — revoca una sesión por id (hash), o
// TODAS las demás (nunca la actual) si no se manda id.
export const prerender = false;

import type { APIRoute } from 'astro';
import { currentUserId } from '../../../../lib/context';
import { listSessions, revokeSessionById, revokeAllSessions, sha256Hex, SESSION_COOKIE } from '../../../../lib/auth';

export const GET: APIRoute = async ({ cookies }) => {
    const userId = currentUserId();
    if (!userId) return new Response(JSON.stringify({ error: 'No autenticado' }), { status: 401 });

    const currentToken = cookies.get(SESSION_COOKIE)?.value;
    const currentSessionId = currentToken ? sha256Hex(currentToken) : null;

    const rows = await listSessions(userId);
    const sessions = rows.map((s: any) => ({
        id: s.id as string,
        userAgent: (s.user_agent as string) || null,
        ip: (s.ip as string) || null,
        createdAt: s.created_at,
        lastUsedAt: s.last_used_at,
        expiresAt: s.expires_at,
        current: s.id === currentSessionId,
    }));

    return new Response(JSON.stringify({ sessions }), { status: 200, headers: { 'Content-Type': 'application/json' } });
};

export const DELETE: APIRoute = async ({ request, cookies }) => {
    const userId = currentUserId();
    if (!userId) return new Response(JSON.stringify({ error: 'No autenticado' }), { status: 401 });

    let body: any = {};
    try { body = await request.json(); } catch { /* body vacío = revocar todas */ }
    const id = body?.id ? String(body.id) : null;

    const currentToken = cookies.get(SESSION_COOKIE)?.value;
    const currentSessionId = currentToken ? sha256Hex(currentToken) : undefined;

    if (id) {
        const removed = await revokeSessionById(id, userId);
        if (!removed) return new Response(JSON.stringify({ error: 'not_found' }), { status: 404 });
        return new Response(JSON.stringify({ ok: true, loggedOutSelf: id === currentSessionId }), { status: 200 });
    }

    await revokeAllSessions(userId, currentSessionId);
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
};

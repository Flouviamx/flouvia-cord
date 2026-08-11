import { sql } from './db';
import { currentSessionId, currentUserId } from './context';

const DEFAULT_MAX_AGE_SECONDS = 10 * 60;

export async function requireFreshAuth(maxAgeSeconds = DEFAULT_MAX_AGE_SECONDS): Promise<Response | null> {
    const userId = currentUserId();
    const sessionId = currentSessionId();
    if (!userId || !sessionId) {
        return json({ error: 'reauthentication_required' }, 401);
    }
    const [session] = await sql`
        select reauthenticated_at
        from sessions
        where id = ${sessionId} and user_id = ${userId} and revoked_at is null
        limit 1`;
    const reauthenticatedAt = session?.reauthenticated_at
        ? new Date(session.reauthenticated_at as string).getTime()
        : 0;
    if (!reauthenticatedAt || Date.now() - reauthenticatedAt > maxAgeSeconds * 1000) {
        return json({ error: 'reauthentication_required', maxAgeSeconds }, 428);
    }
    return null;
}

function json(body: unknown, status: number): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
}

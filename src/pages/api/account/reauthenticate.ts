export const prerender = false;

import type { APIRoute } from 'astro';
import { z } from 'zod';
import { currentSessionId, currentUserId } from '../../../lib/context';
import { reauthenticate } from '../../../lib/auth';
import { sql } from '../../../lib/db';
import { parseJsonBody } from '../../../lib/validation';
import { strictLimitResponse, strictRateLimit } from '../../../lib/ratelimit';

const schema = z.object({
    password: z.string().max(1_024).optional(),
    code: z.string().trim().max(64).optional(),
}).refine((value) => !!value.password || !!value.code, { message: 'confirmation_required' });

export const POST: APIRoute = async ({ request }) => {
    const userId = currentUserId();
    const sessionId = currentSessionId();
    if (!userId || !sessionId) return json({ error: 'No autenticado' }, 401);

    const limited = strictLimitResponse(await strictRateLimit(`reauth:${sessionId}`, 5, 300));
    if (limited) return limited;

    const parsed = await parseJsonBody(request, schema);
    if (!parsed.ok) return json({ error: parsed.error }, parsed.status);
    if (!await reauthenticate(userId, parsed.data)) {
        return json({ error: 'confirmation_required' }, 401);
    }

    const updated = await sql`
        update sessions set reauthenticated_at = now()
        where id = ${sessionId} and user_id = ${userId} and revoked_at is null
        returning id`;
    if (!updated.length) return json({ error: 'No autenticado' }, 401);
    return json({ ok: true }, 200);
};

function json(body: unknown, status: number): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
}

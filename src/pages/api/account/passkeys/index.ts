// GET /api/account/passkeys — lista las passkeys del usuario en sesión.
export const prerender = false;

import type { APIRoute } from 'astro';
import { sql } from '../../../../lib/db';
import { currentUserId } from '../../../../lib/context';

export const GET: APIRoute = async () => {
    const userId = currentUserId();
    if (!userId) return new Response(JSON.stringify({ error: 'No autenticado' }), { status: 401 });

    const rows = await sql`
        select id, name, device_type, created_at, last_used_at
        from passkeys where user_id = ${userId} order by created_at desc`;

    const passkeys = rows.map((p: any) => ({
        id: p.id as string,
        name: (p.name as string) || null,
        deviceType: p.device_type as string,
        createdAt: p.created_at,
        lastUsedAt: p.last_used_at,
    }));

    return new Response(JSON.stringify({ passkeys }), { status: 200, headers: { 'Content-Type': 'application/json' } });
};

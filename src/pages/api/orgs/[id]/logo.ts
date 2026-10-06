export const prerender = false;

import type { APIRoute } from 'astro';
import { sql, withUserTx } from '../../../../lib/db';
import { currentUserId } from '../../../../lib/context';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATA_URL_RE = /^data:(image\/(?:png|jpe?g|webp|svg\+xml));base64,(.+)$/s;

const notFound = () => new Response(null, { status: 404 });

export const GET: APIRoute = async ({ params }) => {
    const userId = currentUserId();
    if (!userId) return new Response(null, { status: 401 });

    const orgId = String(params.id || '');
    if (!UUID_RE.test(orgId)) return notFound();

    const [[row]] = await withUserTx(userId, sql`
        select o.logo_url
        from orgs o
        left join org_members m on m.org_id = o.id and m.user_id = ${userId} and m.estado = 'activo'
        where o.id = ${orgId}
          and (o.owner_id = ${userId} or m.user_id = ${userId})
          and o.sandbox_of is null
    `);
    const logo = (row?.logo_url as string | null) ?? '';
    if (!logo) return notFound();

    if (/^https?:\/\//.test(logo)) {
        return new Response(null, { status: 302, headers: { Location: logo, 'Cache-Control': 'private, max-age=300' } });
    }

    const m = DATA_URL_RE.exec(logo);
    if (!m) return notFound();

    return new Response(Buffer.from(m[2], 'base64'), {
        headers: {
            'Content-Type': m[1],
            'Cache-Control': 'private, max-age=31536000, immutable',
            'X-Content-Type-Options': 'nosniff',
            'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
        },
    });
};

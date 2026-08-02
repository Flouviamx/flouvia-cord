// DELETE /api/account/connections/[provider] — desvincula una cuenta OAuth
// (google|apple). Bloqueado si sería el ÚLTIMO método de acceso (sin
// password real, sin passkeys, sin otra cuenta OAuth vinculada).
export const prerender = false;

import type { APIRoute } from 'astro';
import { sql } from '../../../../lib/db';
import { currentUserId } from '../../../../lib/context';

const VALID_PROVIDERS = new Set(['google', 'apple']);

export const DELETE: APIRoute = async ({ params }) => {
    const userId = currentUserId();
    if (!userId) return new Response(JSON.stringify({ error: 'No autenticado' }), { status: 401 });

    const provider = params.provider;
    if (!provider || !VALID_PROVIDERS.has(provider)) {
        return new Response(JSON.stringify({ error: 'Proveedor inválido' }), { status: 400 });
    }

    const [owned] = await sql`select 1 as ok from oauth_accounts where user_id = ${userId} and provider = ${provider} limit 1`;
    if (!owned) return new Response(JSON.stringify({ error: 'not_found' }), { status: 404 });

    const [user] = await sql`select password_hash from users where id = ${userId} limit 1`;
    const hasRealPassword = !!user?.password_hash && user.password_hash !== 'dummy_hash';
    const [passkeyCount] = await sql`select count(*)::int as n from passkeys where user_id = ${userId}`;
    const [oauthCount] = await sql`select count(*)::int as n from oauth_accounts where user_id = ${userId}`;

    const remainingMethods = (hasRealPassword ? 1 : 0) + Number(passkeyCount.n) + (Number(oauthCount.n) - 1);
    if (remainingMethods < 1) {
        return new Response(JSON.stringify({ error: 'last_auth_method' }), { status: 409 });
    }

    await sql`delete from oauth_accounts where user_id = ${userId} and provider = ${provider}`;
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
};

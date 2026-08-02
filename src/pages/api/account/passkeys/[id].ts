// DELETE /api/account/passkeys/[id] — elimina una passkey del usuario.
// Bloqueado si sería el ÚLTIMO método de acceso a la cuenta (sin password
// real, sin otras passkeys, sin cuentas Google/Apple vinculadas) — evita que
// alguien se quede sin ninguna forma de entrar a su propia cuenta.
export const prerender = false;

import type { APIRoute } from 'astro';
import { sql } from '../../../../lib/db';
import { currentUserId } from '../../../../lib/context';

export const DELETE: APIRoute = async ({ params }) => {
    const userId = currentUserId();
    if (!userId) return new Response(JSON.stringify({ error: 'No autenticado' }), { status: 401 });

    const id = params.id;
    if (!id) return new Response(JSON.stringify({ error: 'Falta el id' }), { status: 400 });

    const [owned] = await sql`select 1 as ok from passkeys where id = ${id} and user_id = ${userId} limit 1`;
    if (!owned) return new Response(JSON.stringify({ error: 'not_found' }), { status: 404 });

    const [user] = await sql`select password_hash from users where id = ${userId} limit 1`;
    const hasRealPassword = !!user?.password_hash && user.password_hash !== 'dummy_hash';
    const [passkeyCount] = await sql`select count(*)::int as n from passkeys where user_id = ${userId}`;
    const [oauthCount] = await sql`select count(*)::int as n from oauth_accounts where user_id = ${userId}`;

    const remainingMethods = (hasRealPassword ? 1 : 0) + (Number(passkeyCount.n) - 1) + Number(oauthCount.n);
    if (remainingMethods < 1) {
        return new Response(JSON.stringify({ error: 'last_auth_method' }), { status: 409 });
    }

    await sql`delete from passkeys where id = ${id} and user_id = ${userId}`;
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
};

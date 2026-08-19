// GET /billing/entrar?t=… — canje del token de traspaso por una sesión de este host.
//
// Única ruta de billing.cordhq.app que el middleware deja pasar sin sesión.
// Recibe el token que emitió `/api/billing/handoff` en el apex y abre una sesión
// PROPIA de este host: no se copia la del apex ni se amplía su cookie a
// `.cordhq.app`, así que revocarla desde Ajustes › Sesiones sigue funcionando y
// ops./docs./dev. nunca la reciben.
export const prerender = false;

import type { APIRoute } from 'astro';
import { sql } from '../../lib/db';
import { sha256Hex, createSession, setSessionCookies } from '../../lib/auth';

export const GET: APIRoute = async ({ url, cookies, request, redirect }) => {
    const raw = url.searchParams.get('t') || '';
    // Token inválido, vencido o ya usado: de vuelta a la app, sin explicar cuál
    // de los tres fue. Cualquiera de ellos se resuelve pidiendo el link otra vez.
    const fail = () => redirect(
        import.meta.env.PROD ? 'https://cordhq.app/app/ajustes/plan' : '/app/ajustes/plan', 302);
    if (!/^[a-f0-9]{64}$/.test(raw)) return fail();

    // Un solo uso, y el marcado va en el mismo UPDATE que la lectura: dos
    // pestañas abriendo el link a la vez no pueden canjear el mismo token.
    const [row] = await sql`
        update billing_handoff_tokens
           set used_at = now()
         where id = ${sha256Hex(raw)} and used_at is null and expires_at > now()
        returning user_id, org_id`;
    if (!row) return fail();

    let token: string;
    try {
        token = await createSession(
            row.user_id as string,
            request.headers.get('user-agent') || undefined,
        );
    } catch {
        // createSession lanza si la cuenta está suspendida. Falla cerrado.
        return fail();
    }

    setSessionCookies(cookies, token);
    if (row.org_id) {
        cookies.set('cord_active_org', String(row.org_id), {
            path: '/', httpOnly: true, secure: import.meta.env.PROD,
            sameSite: 'lax', maxAge: 60 * 60 * 24 * 30,
        });
    }

    // A la raíz sin query: el token ya se consumió, pero dejarlo en la barra y
    // en el historial no aporta nada.
    return redirect('/billing', 302);
};

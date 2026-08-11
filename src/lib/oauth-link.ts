// Vinculación de Google/Apple a una cuenta YA autenticada (Ajustes › Tu cuenta).
//
// Es un flujo distinto al de /sign-in y la diferencia es de seguridad, no de
// cosmética:
//
//  · En LOGIN, el proveedor decide quién eres. Cord busca por
//    provider_user_id y, si no hay, cae a emparejar por correo verificado.
//  · En VINCULACIÓN, quién eres YA está decidido por la sesión. El proveedor
//    solo aporta una credencial nueva. Por eso aquí NUNCA se empareja por
//    correo ni se crea un usuario: se adjunta la credencial al usuario de la
//    sesión y punto. Emparejar por correo en este carril reabriría justo la
//    ruta de toma de control que se cerró en el login (un atacante que
//    controla un correo ajeno se adjuntaría a esa cuenta).
//
// La intención de vincular viaja en una cookie HttpOnly de 10 minutos, y al
// volver se exige que la sesión siga viva y sea del MISMO usuario que la
// inició: la cookie por sí sola no autoriza nada.
import type { AstroCookies } from 'astro';
import { sql } from './db';
import { SESSION_COOKIE, validateSession } from './auth';

export const OAUTH_LINK_COOKIE = 'cord_oauth_link';
export const LINK_RETURN_PATH = '/app/ajustes/cuenta';

export type OAuthProvider = 'google' | 'apple';

function linkCookieOptions() {
    return {
        path: '/',
        httpOnly: true,
        secure: import.meta.env.PROD,
        // `lax` permite que la cookie viaje en la navegación GET de vuelta desde
        // el proveedor. Apple responde con form_post (POST cross-site), donde
        // `lax` NO se envía — ver la nota en apple/callback.ts.
        sameSite: 'lax' as const,
        maxAge: 600,
    };
}

/** Marca este flujo OAuth como "vincular a la sesión actual", no como login. */
export function beginOAuthLink(cookies: AstroCookies, userId: string): void {
    cookies.set(OAUTH_LINK_COOKIE, userId, linkCookieOptions());
}

/** Un login normal no debe heredar una intención de vinculación vieja. */
export function clearOAuthLink(cookies: AstroCookies): void {
    cookies.delete(OAUTH_LINK_COOKIE, { path: '/' });
}

/**
 * Lee y consume la intención de vinculación. Devuelve el userId solo si la
 * sesión sigue viva y pertenece a esa misma persona.
 */
export async function consumeOAuthLink(cookies: AstroCookies): Promise<string | null> {
    const intended = cookies.get(OAUTH_LINK_COOKIE)?.value;
    clearOAuthLink(cookies);
    if (!intended) return null;

    const token = cookies.get(SESSION_COOKIE)?.value;
    const session = token ? await validateSession(token) : null;
    if (!session || session.userId !== intended) return null;
    return session.userId;
}

export type LinkOutcome = 'linked' | 'already_linked' | 'already_yours';

/**
 * Adjunta la credencial del proveedor al usuario de la sesión.
 * `already_linked` = esa cuenta del proveedor ya pertenece a OTRO usuario de
 * Cord; jamás se roba ni se reasigna, se rechaza.
 */
export async function completeOAuthLink(
    userId: string,
    provider: OAuthProvider,
    providerUserId: string,
    email: string | null,
): Promise<LinkOutcome> {
    const [existing] = await sql`
        select user_id from oauth_accounts
        where provider = ${provider} and provider_user_id = ${providerUserId}
        limit 1
    `;
    if (existing) {
        return existing.user_id === userId ? 'already_yours' : 'already_linked';
    }

    await sql`
        insert into oauth_accounts (user_id, provider, provider_user_id, email)
        values (${userId}, ${provider}, ${providerUserId}, ${email})
        on conflict (provider, provider_user_id) do nothing
    `;
    // Deliberadamente NO se toca users.email_verified_at: el correo del
    // proveedor puede ser distinto al de la cuenta de Cord, y verificar un
    // correo que nadie demostró sería una aserción falsa.
    return 'linked';
}

export function linkRedirect(params: Record<string, string>): string {
    return `${LINK_RETURN_PATH}?${new URLSearchParams(params)}`;
}

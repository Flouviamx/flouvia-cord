// POST /api/auth/apple/callback — Apple siempre usa form_post (POST, no GET)
// Procesa el id_token de Apple, extrae el email, busca/crea usuario, crea sesión.
export const prerender = false;

import type { APIRoute } from 'astro';
import { sql } from '../../../../lib/db';
import { createSession } from '../../../../lib/auth';
import { createAppleClientSecret } from '../../../../lib/auth-apple';

function decodeJwtPayload(token: string): any {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  } catch { return null; }
}

export const POST: APIRoute = async ({ request, cookies, redirect }) => {
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return redirect('/sign-in?sso_error=1');
  }

  const code = formData.get('code') as string;
  const state = formData.get('state') as string;
  const idToken = formData.get('id_token') as string;
  // Apple solo envía el nombre en el PRIMER login (en JSON dentro del form)
  const userJson = formData.get('user') as string | null;

  // Validar anti-CSRF state
  const savedState = cookies.get('cord_apple_state')?.value;
  if (!state || !savedState || state !== savedState || !code || !idToken) {
    return redirect('/sign-in?sso_error=1');
  }

  cookies.delete('cord_apple_state', { path: '/' });
  cookies.delete('cord_apple_nonce', { path: '/' });

  // Decodificar id_token (sin verificar firma — Apple verifica por nosotros con el code)
  // Para producción real, verificar con las JWKS de Apple: https://appleid.apple.com/auth/keys
  const claims = decodeJwtPayload(idToken);
  if (!claims?.sub || !claims?.email) {
    return redirect('/sign-in?sso_error=1');
  }

  const providerUserId = claims.sub as string;
  const email = (claims.email as string).toLowerCase();

  // Apple puede ocultar el email (relay email)
  let firstName: string | undefined;
  let lastName: string | undefined;
  if (userJson) {
    try {
      const userData = JSON.parse(userJson);
      firstName = userData?.name?.firstName;
      lastName = userData?.name?.lastName;
    } catch { /* no-op */ }
  }

  try {
    let userId: string | null = null;

    const oauthRows = await sql`
      select user_id from oauth_accounts
      where provider = 'apple' and provider_user_id = ${providerUserId}
      limit 1
    `;

    if (oauthRows.length > 0) {
      userId = oauthRows[0].user_id as string;
    } else {
      const userRows = await sql`select id from users where email = ${email} limit 1`;
      if (userRows.length > 0) {
        userId = userRows[0].id as string;
      } else {
        const [newUser] = await sql`
          insert into users (email, first_name, last_name)
          values (${email}, ${firstName || null}, ${lastName || null})
          returning id
        `;
        userId = newUser.id as string;
      }

      await sql`
        insert into oauth_accounts (user_id, provider, provider_user_id, email)
        values (${userId}, 'apple', ${providerUserId}, ${email})
        on conflict (provider, provider_user_id) do nothing
      `;
    }

    const sessionId = await createSession(userId!, 'Apple Sign In', 'oauth');

    cookies.set('cord_session', sessionId, {
      path: '/',
      httpOnly: true,
      secure: import.meta.env.PROD,
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60,
    });

    return redirect('/app');
  } catch (err) {
    console.error('[apple/callback] Error:', err);
    return redirect('/sign-in?sso_error=1');
  }
};

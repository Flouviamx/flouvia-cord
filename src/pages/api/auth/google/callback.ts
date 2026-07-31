// GET /api/auth/google/callback — procesa el código de autorización de Google
// Verifica CSRF state, intercambia code por tokens, busca o crea usuario, crea sesión.
export const prerender = false;

import type { APIRoute } from 'astro';
import { sql } from '../../../../lib/db';
import { createSession } from '../../../../lib/auth';

export const GET: APIRoute = async ({ url, cookies, redirect }) => {
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const errorParam = url.searchParams.get('error');

  if (errorParam) {
    return redirect('/sign-in?sso_error=1');
  }

  // Validar anti-CSRF state
  const savedState = cookies.get('cord_oauth_state')?.value;
  const codeVerifier = cookies.get('cord_oauth_verifier')?.value;

  if (!state || !savedState || state !== savedState || !codeVerifier || !code) {
    return redirect('/sign-in?sso_error=1');
  }

  // Limpiar cookies temporales
  cookies.delete('cord_oauth_state', { path: '/' });
  cookies.delete('cord_oauth_verifier', { path: '/' });

  const clientId = import.meta.env.GOOGLE_CLIENT_ID;
  const clientSecret = import.meta.env.GOOGLE_CLIENT_SECRET;
  const origin = url.origin;

  try {
    // Intercambiar code por access token
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: `${origin}/api/auth/google/callback`,
        grant_type: 'authorization_code',
        code_verifier: codeVerifier,
      }),
    });

    if (!tokenRes.ok) {
      console.error('[google/callback] Token exchange failed:', await tokenRes.text());
      return redirect('/sign-in?sso_error=1');
    }

    const tokens = await tokenRes.json();

    // Obtener perfil del usuario desde Google
    const userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });

    if (!userRes.ok) {
      return redirect('/sign-in?sso_error=1');
    }

    const profile = await userRes.json();
    const providerUserId = profile.id as string;
    const email = (profile.email as string).toLowerCase();
    const firstName = profile.given_name as string | undefined;
    const lastName = profile.family_name as string | undefined;
    const picture = profile.picture as string | undefined;

    // Buscar si ya existe cuenta OAuth vinculada
    let userId: string | null = null;
    const oauthRows = await sql`
      select user_id from oauth_accounts
      where provider = 'google' and provider_user_id = ${providerUserId}
      limit 1
    `;

    if (oauthRows.length > 0) {
      userId = oauthRows[0].user_id as string;
    } else {
      // ¿Existe usuario con ese email?
      const userRows = await sql`select id from users where email = ${email} limit 1`;

      if (userRows.length > 0) {
        userId = userRows[0].id as string;
        // Actualizar avatar_url si el usuario ya existía y no tenía foto, o usar la de Google
        if (picture) {
          await sql`update users set avatar_url = coalesce(avatar_url, ${picture}) where id = ${userId}`;
        }
      } else {
        // Crear usuario nuevo (sin contraseña — solo Google)
        const [newUser] = await sql`
          insert into users (email, first_name, last_name, avatar_url)
          values (${email}, ${firstName || null}, ${lastName || null}, ${picture || null})
          returning id
        `;
        userId = newUser.id as string;
      }

      // Vincular cuenta OAuth
      await sql`
        insert into oauth_accounts (user_id, provider, provider_user_id, email)
        values (${userId}, 'google', ${providerUserId}, ${email})
        on conflict (provider, provider_user_id) do nothing
      `;
    }

    // Crear sesión
    const ip = 'oauth';
    const userAgent = 'Google OAuth';
    const sessionId = await createSession(userId!, userAgent, ip);

    cookies.set('cord_session', sessionId, {
      path: '/',
      httpOnly: true,
      secure: import.meta.env.PROD,
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60,
    });

    return redirect('/app');
  } catch (err) {
    console.error('[google/callback] Error:', err);
    return redirect('/sign-in?sso_error=1');
  }
};

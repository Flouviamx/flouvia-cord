// GET /api/auth/google/callback — procesa el código de autorización de Google
// Verifica CSRF state, intercambia code por tokens, busca o crea usuario, crea sesión.
export const prerender = false;

import type { APIRoute } from 'astro';
import { sql } from '../../../../lib/db';
import { createSession, setSessionCookies, createTwoFactorChallenge } from '../../../../lib/auth';
import { rateLimit, tooMany } from '../../../../lib/ratelimit';
import { trustedIp } from '../../../../lib/ip';
import { posthogServer } from '../../../../lib/posthog-server';
import { safeRelativeRedirect } from '../../../../lib/safe-redirect';
import { ssoRequirementFor } from '../../../../lib/saml';

export const GET: APIRoute = async ({ request, url, cookies, redirect }) => {
  const ip = trustedIp(request);
  const rl = await rateLimit(`google-callback:${ip}`, 20, 60);
  if (!rl.ok) return tooMany(rl.retryAfter);

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
  const dest = safeRelativeRedirect(cookies.get('cord_oauth_redirect')?.value) || '/app';
  cookies.delete('cord_oauth_redirect', { path: '/' });

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

    // Obtener perfil del usuario desde Google (incluye verified_email)
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

    // Sin correo verificado por Google, NO se enlaza a una cuenta existente por
    // email — es exactamente la ruta de toma de control que se cerró en Apple.
    if (profile.verified_email !== true) {
      return redirect('/sign-in?sso_error=1');
    }

    // Buscar si ya existe cuenta OAuth vinculada
    let userId: string | null = null;
    const oauthRows = await sql`
      select user_id from oauth_accounts
      where provider = 'google' and provider_user_id = ${providerUserId}
      limit 1
    `;

    let isNewUser = false;
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
          insert into users (email, first_name, last_name, avatar_url, email_verified_at)
          values (${email}, ${firstName || null}, ${lastName || null}, ${picture || null}, now())
          returning id
        `;
        userId = newUser.id as string;
        isNewUser = true;
      }

      // Vincular cuenta OAuth
      await sql`
        insert into oauth_accounts (user_id, provider, provider_user_id, email)
        values (${userId}, 'google', ${providerUserId}, ${email})
        on conflict (provider, provider_user_id) do nothing
      `;
      // Un correo verificado por Google certifica el correo del usuario en Cord también.
      await sql`update users set email_verified_at = coalesce(email_verified_at, now()) where id = ${userId}`;
    }

    // Solo cuenta nueva de verdad — nunca en un login/link de una cuenta ya existente.
    if (isNewUser && posthogServer) {
      posthogServer.capture({
        distinctId: userId!,
        event: 'sign_up_completed',
        properties: { sign_up_method: 'google' },
      });
      await posthogServer.flush();
    }

    // Exigir SSO (org-level, ver src/lib/saml.ts): sin este chequeo, cualquier
    // empleado con una cuenta de Google en el mismo Workspace se saltaría por
    // completo el requisito — Google/Apple son otro "primer factor" más, y la
    // política de la org debe aplicarles igual que a password.
    const ssoReq = await ssoRequirementFor(userId!);
    if (ssoReq.blocked) {
      return redirect('/sign-in?sso_error=sso_required');
    }

    // Si la cuenta tiene 2FA activo, el SSO también lo respeta.
    const totpRow = await sql`select totp_enabled from users where id = ${userId} limit 1`;
    if (totpRow.length && totpRow[0].totp_enabled) {
      const challenge = await createTwoFactorChallenge(userId!);
      cookies.set('cord_2fa_challenge', challenge, {
        path: '/', httpOnly: true, secure: import.meta.env.PROD, sameSite: 'lax', maxAge: 300,
      });
      return redirect(`/verify-2fa?redirect_url=${encodeURIComponent(dest)}`);
    }

    const sessionToken = await createSession(userId!, 'Google OAuth', ip);
    setSessionCookies(cookies, sessionToken);

    return redirect(dest);
  } catch (err) {
    console.error('[google/callback] Error:', err);
    return redirect('/sign-in?sso_error=1');
  }
};

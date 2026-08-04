// GET /api/auth/google — inicia el flujo OAuth 2.0 con PKCE
// Genera un code_verifier, calcula el code_challenge y redirige a Google.
export const prerender = false;

import type { APIRoute } from 'astro';
import { randomBytes, createHash } from 'node:crypto';
import { safeRelativeRedirect } from '../../../../lib/safe-redirect';

function base64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

export const GET: APIRoute = async ({ cookies, redirect, url }) => {
  const clientId = import.meta.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    return new Response('GOOGLE_CLIENT_ID no configurado', { status: 503 });
  }

  // PKCE
  const codeVerifier = base64url(randomBytes(32));
  const codeChallenge = base64url(
    Buffer.from(createHash('sha256').update(codeVerifier).digest())
  );

  // Anti-CSRF state
  const state = base64url(randomBytes(16));

  // Guardar en cookies HttpOnly de corta vida (10 min)
  const cookieOpts = { path: '/', httpOnly: true, secure: import.meta.env.PROD, sameSite: 'lax' as const, maxAge: 600 };
  cookies.set('cord_oauth_verifier', codeVerifier, cookieOpts);
  cookies.set('cord_oauth_state', state, cookieOpts);

  // El botón de Google en /sign-in manda ?redirect_url= (ej. desde una
  // invitación de equipo) — se guarda en cookie para que sobreviva el
  // roundtrip completo a Google y de vuelta (un query param se perdería).
  const dest = safeRelativeRedirect(url.searchParams.get('redirect_url'));
  if (dest) cookies.set('cord_oauth_redirect', dest, cookieOpts);

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${url.origin}/api/auth/google/callback`,
    response_type: 'code',
    scope: 'openid email profile',
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    state,
    access_type: 'offline',
    prompt: 'select_account',
  });

  return redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
};

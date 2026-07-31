// GET /api/auth/apple — inicia el flujo Sign in with Apple (OAuth 2.0 + OIDC)
// Apple requiere client_secret generado con JWT firmado con la P8 key.
export const prerender = false;

import type { APIRoute } from 'astro';
import { randomBytes } from 'node:crypto';
import { createAppleClientSecret } from '../../../../lib/auth-apple';

function base64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

export const GET: APIRoute = async ({ cookies, redirect }) => {
  const clientId = import.meta.env.APPLE_CLIENT_ID;
  if (!clientId) {
    return new Response('APPLE_CLIENT_ID no configurado', { status: 503 });
  }

  // Anti-CSRF state + nonce
  const state = base64url(randomBytes(16));
  const nonce = base64url(randomBytes(16));

  const cookieOpts = {
    path: '/',
    httpOnly: true,
    secure: import.meta.env.PROD,
    sameSite: 'lax' as const,
    maxAge: 600
  };
  cookies.set('cord_apple_state', state, cookieOpts);
  cookies.set('cord_apple_nonce', nonce, cookieOpts);

  const origin = import.meta.env.SITE || 'http://localhost:4321';

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${origin}/api/auth/apple/callback`,
    response_type: 'code id_token',
    response_mode: 'form_post',
    scope: 'name email',
    state,
    nonce,
  });

  return redirect(`https://appleid.apple.com/auth/authorize?${params}`);
};

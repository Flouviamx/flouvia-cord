// GET /api/auth/saml/complete — hop same-origin que mintea la sesión real.
// El ACS redirige aquí en vez de poner la cookie de sesión él mismo (ver
// createSsoHandoff en src/lib/saml.ts para el porqué). Mismo patrón que la
// rama final de google/callback.ts: 2FA si aplica, si no sesión directa.
export const prerender = false;

import type { APIRoute } from 'astro';
import { trustedIp } from '../../../../lib/ip';
import { createSession, sessionCookieOptions, SESSION_COOKIE, createTwoFactorChallenge } from '../../../../lib/auth';
import { consumeSsoHandoff } from '../../../../lib/saml';
import { safeRelativeRedirect } from '../../../../lib/safe-redirect';

export const GET: APIRoute = async ({ url, cookies, request, redirect }) => {
  const token = url.searchParams.get('t');
  if (!token) return redirect('/sign-in?sso_error=handoff');

  const consumed = await consumeSsoHandoff(token);
  if (!consumed) return redirect('/sign-in?sso_error=handoff');

  const dest = safeRelativeRedirect(consumed.redirectTo) || '/app';
  const ip = trustedIp(request);

  // Si la cuenta tiene 2FA activo, el SSO también lo respeta — mismo criterio
  // que Google/Apple, ver google/callback.ts.
  if (consumed.needs2fa) {
    const challenge = await createTwoFactorChallenge(consumed.userId);
    cookies.set('cord_2fa_challenge', challenge, {
      path: '/', httpOnly: true, secure: import.meta.env.PROD, sameSite: 'lax', maxAge: 300,
    });
    return redirect(`/verify-2fa?redirect_url=${encodeURIComponent(dest)}`);
  }

  const sessionToken = await createSession(consumed.userId, 'SAML SSO', ip);
  cookies.set(SESSION_COOKIE, sessionToken, sessionCookieOptions());
  return redirect(dest);
};

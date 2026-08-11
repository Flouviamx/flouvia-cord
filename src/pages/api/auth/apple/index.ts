// GET /api/auth/apple — inicia el flujo Sign in with Apple (OAuth 2.0 + OIDC)
// Apple requiere client_secret generado con JWT firmado con la P8 key.
export const prerender = false;

import type { APIRoute } from 'astro';
import { randomBytes } from 'node:crypto';
import { createAppleClientSecret } from '../../../../lib/auth-apple';
import { safeRelativeRedirect } from '../../../../lib/safe-redirect';
import { clearOAuthLink, linkRedirect } from '../../../../lib/oauth-link';

function base64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

export const GET: APIRoute = async ({ cookies, redirect, url }) => {
  // ⚠️ Vincular Apple desde Ajustes NO se soporta todavía, y no es un olvido.
  // Apple responde con `form_post`: un POST CROSS-SITE. La cookie de sesión de
  // Cord es `SameSite=Lax`, así que el navegador NO la manda en ese POST — el
  // callback no puede comprobar de quién es la sesión, que es justo la prueba
  // en la que se apoya la vinculación (ver src/lib/oauth-link.ts). Hacerlo
  // funcionar exigiría o bien relajar la cookie de sesión a `SameSite=None`
  // (debilitaría la defensa CSRF de TODA la app — inaceptable por un botón),
  // o bien un token de vinculación firmado de un solo uso que se autorice a sí
  // mismo. Lo segundo es viable pero es un diseño aparte, no un parche.
  // Mientras tanto la UI muestra Apple como no disponible en vez de ofrecer un
  // botón que fallaría en silencio.
  const linkMode = url.searchParams.get('link') === '1';
  if (linkMode) return redirect(linkRedirect({ link_error: 'unsupported', provider: 'apple' }));

  const clientId = import.meta.env.APPLE_CLIENT_ID;
  if (!clientId) {
    return new Response('APPLE_CLIENT_ID no configurado', { status: 503 });
  }

  // Anti-CSRF state + nonce
  const state = base64url(randomBytes(16));
  const nonce = base64url(randomBytes(16));

  // ⚠️ `sameSite: 'none'` NO es un descuido: Apple responde con `form_post`,
  // es decir un POST CROSS-SITE desde appleid.apple.com hacia Cord. Una cookie
  // `lax` no se envía en ese caso, así que el callback nunca vería el state ni
  // el nonce y todo login de Apple terminaría en `sso_error=1`. `none` exige
  // `secure`, por eso va fijo en true (Apple solo admite redirect_uri https;
  // este flujo no es probable en http://localhost de todos modos).
  const cookieOpts = {
    path: '/',
    httpOnly: true,
    secure: true,
    sameSite: 'none' as const,
    maxAge: 600
  };
  cookies.set('cord_apple_state', state, cookieOpts);
  cookies.set('cord_apple_nonce', nonce, cookieOpts);

  // Ver comentario equivalente en google/index.ts — Apple usa form_post, así
  // que un query param tampoco sobreviviría el roundtrip sin esta cookie.
  const dest = safeRelativeRedirect(url.searchParams.get('redirect_url'));
  if (dest) cookies.set('cord_apple_redirect', dest, cookieOpts);

  // Un login de Apple nunca debe heredar una intención de vinculación de Google.
  clearOAuthLink(cookies);

  // ⚠️ Debe ser EXACTAMENTE el mismo origin que usa apple/callback.ts para
  // exchangeAppleCode() — Apple rechaza el intercambio si el redirect_uri no
  // coincide byte a byte entre la autorización y el token exchange. Antes
  // este archivo usaba `import.meta.env.SITE` (podía divergir de url.origin).
  const origin = url.origin;

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

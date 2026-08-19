// GET /api/auth/saml/[cid]/login — inicia el flujo SP-initiated SAML 2.0.
// Genera el AuthnRequest con binding HTTP-Redirect (esquiva el CSP
// form-action — ver src/middleware.ts) y persiste el roundtrip en
// saml_auth_requests: las cookies SameSite=lax no sobreviven el POST
// cross-site que el IdP hace al ACS, así que el estado no puede vivir ahí.
export const prerender = false;

import type { APIRoute } from 'astro';
import { randomBytes } from 'node:crypto';
import { trustedIp } from '../../../../../lib/ip';
import { rateLimit, tooMany } from '../../../../../lib/ratelimit';
import { safeRelativeRedirect } from '../../../../../lib/safe-redirect';
import { getConnection, buildSamlInstance } from '../../../../../lib/saml';
import { log } from '../../../../../lib/log';

export const GET: APIRoute = async ({ params, url, request, redirect }) => {
  const ip = trustedIp(request);
  const rl = await rateLimit(`saml-login:${ip}`, 30, 60);
  if (!rl.ok) return tooMany(rl.retryAfter);

  const cid = params.cid;
  if (!cid) return redirect('/sign-in?sso_error=connection');

  const conn = await getConnection(cid);
  if (!conn || !conn.enabled) return redirect('/sign-in?sso_error=connection');

  const relayState = randomBytes(32).toString('hex');
  const redirectTo = safeRelativeRedirect(url.searchParams.get('redirect_url'));

  try {
    const saml = buildSamlInstance(conn, { kind: 'sp-login', relayState, redirectTo, ip });
    const authorizeUrl = await saml.getAuthorizeUrlAsync(relayState, url.host, {});
    return redirect(authorizeUrl);
  } catch (err) {
    log.error('Error', { route: 'saml/login', err });
    return redirect('/sign-in?sso_error=connection');
  }
};

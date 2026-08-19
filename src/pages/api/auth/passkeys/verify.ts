import type { APIRoute } from 'astro';
import { verifyAuthenticationResponse } from '@simplewebauthn/server';
import { sql } from '../../../../lib/db';
import { createSession, setSessionCookies } from '../../../../lib/auth';
import { rateLimit, tooMany } from '../../../../lib/ratelimit';
import { trustedIp } from '../../../../lib/ip';
import { ssoRequirementFor } from '../../../../lib/saml';
import { log } from '../../../../lib/log';

export const prerender = false;

const rpID = import.meta.env.PROD ? 'cordhq.app' : 'localhost';
const expectedOrigin = import.meta.env.PROD ? 'https://cordhq.app' : 'http://localhost:4321';

export const POST: APIRoute = async ({ request, cookies }) => {
  try {
    const ip = trustedIp(request);
    const rl = await rateLimit(`passkey-verify:${ip}`, 20, 60);
    if (!rl.ok) return tooMany(rl.retryAfter);

    const body = await request.json();
    const expectedChallenge = cookies.get('passkey_auth_challenge')?.value;
    cookies.delete('passkey_auth_challenge', { path: '/' });

    if (!expectedChallenge) {
      return new Response(JSON.stringify({ error: 'Challenge expirado' }), { status: 400 });
    }
    if (!body?.id || typeof body.id !== 'string') {
      return new Response(JSON.stringify({ error: 'Solicitud inválida' }), { status: 400 });
    }

    const rows = await sql`
      select p.id, p.public_key, p.counter, p.user_id, p.transports, u.suspended_at
      from passkeys p
      join users u on u.id = p.user_id
      where p.id = ${body.id}
      limit 1
    `;

    if (rows.length === 0) {
      return new Response(JSON.stringify({ error: 'Credencial no encontrada' }), { status: 400 });
    }

    const passkey = rows[0];
    if (passkey.suspended_at) {
      return new Response(JSON.stringify({ error: 'account_suspended' }), { status: 403 });
    }

    let verification;
    try {
      verification = await verifyAuthenticationResponse({
        response: body,
        expectedChallenge,
        expectedOrigin,
        expectedRPID: rpID,
        // @simplewebauthn/server v13: el parámetro se llama `credential`, no
        // `authenticator` (v9/v12) — con el nombre viejo la llamada fallaba
        // siempre. `publicKey` va como Uint8Array (Buffer la extiende).
        credential: {
          id: passkey.id as string,
          publicKey: Buffer.from(passkey.public_key as string, 'base64url'),
          counter: Number(passkey.counter),
          transports: (passkey.transports as any) || undefined,
        },
      });
    } catch (error: any) {
      log.error('Error verificando autenticación', { err: error.message });
      return new Response(JSON.stringify({ error: error.message }), { status: 400 });
    }

    const { verified, authenticationInfo } = verification;
    if (!verified || !authenticationInfo) {
      return new Response(JSON.stringify({ error: 'Verificación fallida' }), { status: 400 });
    }

    await sql`
      update passkeys
      set counter = ${authenticationInfo.newCounter}, last_used_at = now()
      where id = ${body.id}
    `;

    // Passkey = autenticación fuerte por sí sola (posesión del dispositivo +
    // biometría/PIN local) — no se apila un segundo factor TOTP encima, a
    // diferencia del login con password.
    const userId = passkey.user_id as string;

    // Exigir SSO BLOQUEA passkeys a propósito (decisión de producto, no un
    // descuido): la razón real por la que una empresa activa "Exigir SSO" es
    // el desaprovisionamiento — al dar de baja a alguien en el IdP pierde
    // acceso a todo. Una passkey registrada en el dispositivo sobrevive a ese
    // apagado, así que dejarla como puerta alterna anularía la garantía que
    // el cliente está comprando. Mismo criterio que Stripe/Vercel/Linear.
    const ssoReq = await ssoRequirementFor(userId);
    if (ssoReq.blocked) {
      return new Response(JSON.stringify({ error: 'sso_required', connectionId: ssoReq.connectionId, orgNombre: ssoReq.orgNombre }), { status: 403 });
    }

    const userAgent = request.headers.get('user-agent') || 'desconocido';
    const sessionToken = await createSession(userId, userAgent, ip);

    setSessionCookies(cookies, sessionToken);
    return new Response(JSON.stringify({ success: true }), { status: 200 });
  } catch (error) {
    log.error('Error en verify', { err: error });
    return new Response(JSON.stringify({ error: 'Error interno' }), { status: 500 });
  }
};

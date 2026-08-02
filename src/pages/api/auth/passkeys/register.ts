import type { APIRoute } from 'astro';
import { verifyRegistrationResponse } from '@simplewebauthn/server';
import { sql } from '../../../../lib/db';
import { validateSession, SESSION_COOKIE } from '../../../../lib/auth';

export const prerender = false;

const rpID = import.meta.env.PROD ? 'cordhq.app' : 'localhost';
const expectedOrigin = import.meta.env.PROD ? 'https://cordhq.app' : 'http://localhost:4321';

export const POST: APIRoute = async ({ request, cookies }) => {
  try {
    const sessionToken = cookies.get(SESSION_COOKIE)?.value;
    if (!sessionToken) {
      return new Response(JSON.stringify({ error: 'No autenticado' }), { status: 401 });
    }
    const session = await validateSession(sessionToken);
    if (!session) {
      return new Response(JSON.stringify({ error: 'No autenticado' }), { status: 401 });
    }

    const body = await request.json();
    const expectedChallenge = cookies.get('passkey_challenge')?.value;

    if (!expectedChallenge) {
      return new Response(JSON.stringify({ error: 'Challenge expirado' }), { status: 400 });
    }

    let verification;
    try {
      verification = await verifyRegistrationResponse({
        response: body,
        expectedChallenge,
        expectedOrigin,
        expectedRPID: rpID,
      });
    } catch (error: any) {
      console.error('Error verificando registro:', error.message);
      return new Response(JSON.stringify({ error: error.message }), { status: 400 });
    } finally {
      // Challenge de un solo uso: se borra tanto en éxito como en fallo — un
      // intento fallido no debe dejar un reto reutilizable vivo por 5 min más.
      cookies.delete('passkey_challenge', { path: '/' });
    }

    const { verified, registrationInfo } = verification;

    if (verified && registrationInfo) {
      // @simplewebauthn/server v13: la credencial vive en registrationInfo.credential
      // (id/publicKey/counter), NO en credentialID/credentialPublicKey planos como en v9.
      const { credential, credentialDeviceType, credentialBackedUp } = registrationInfo;

      await sql`
        insert into passkeys (
          id, user_id, public_key, counter, device_type, backed_up, transports
        ) values (
          ${credential.id},
          ${session.userId},
          ${Buffer.from(credential.publicKey).toString('base64url')},
          ${credential.counter},
          ${credentialDeviceType},
          ${credentialBackedUp},
          ${credential.transports || body.response?.transports || []}
        )
      `;

      return new Response(JSON.stringify({ success: true }), { status: 200 });
    }

    return new Response(JSON.stringify({ error: 'Verificación fallida' }), { status: 400 });
  } catch (error) {
    console.error('Error en register:', error);
    return new Response(JSON.stringify({ error: 'Error interno' }), { status: 500 });
  }
};

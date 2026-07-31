import type { APIRoute } from 'astro';
import { verifyRegistrationResponse } from '@simplewebauthn/server';
import { sql } from '../../../../lib/db';
import { validateSession } from '../../../../lib/auth';

export const prerender = false;

const rpID = import.meta.env.PROD ? 'cordhq.app' : 'localhost';
const expectedOrigin = import.meta.env.PROD ? 'https://cordhq.app' : 'http://localhost:4321';

export const POST: APIRoute = async ({ request, cookies }) => {
  try {
    const sessionId = cookies.get('cord_session')?.value;
    if (!sessionId) {
      return new Response(JSON.stringify({ error: 'No autenticado' }), { status: 401 });
    }

    const session = await validateSession(sessionId);
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
    }

    const { verified, registrationInfo } = verification;

    if (verified && registrationInfo) {
      const { credentialID, credentialPublicKey, counter, credentialDeviceType, credentialBackedUp } = registrationInfo;
      
      // Guardar en la base de datos
      await sql`
        insert into passkeys (
          id, user_id, public_key, counter, device_type, backed_up, transports
        ) values (
          ${credentialID}, 
          ${session.userId}, 
          ${Buffer.from(credentialPublicKey).toString('base64url')},
          ${counter}, 
          ${credentialDeviceType}, 
          ${credentialBackedUp}, 
          ${body.response.transports || []}
        )
      `;

      // Limpiar el challenge
      cookies.delete('passkey_challenge', { path: '/' });

      return new Response(JSON.stringify({ success: true }), { status: 200 });
    }

    return new Response(JSON.stringify({ error: 'Verificación fallida' }), { status: 400 });
  } catch (error) {
    console.error('Error en register:', error);
    return new Response(JSON.stringify({ error: 'Error interno' }), { status: 500 });
  }
};

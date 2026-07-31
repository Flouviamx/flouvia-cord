import type { APIRoute } from 'astro';
import { verifyAuthenticationResponse } from '@simplewebauthn/server';
import { sql } from '../../../../lib/db';
import { createSession } from '../../../../lib/auth';
import { randomBytes } from 'node:crypto';

export const prerender = false;

function base64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

const rpID = import.meta.env.PROD ? 'cordhq.app' : 'localhost';
const expectedOrigin = import.meta.env.PROD ? 'https://cordhq.app' : 'http://localhost:4321';

export const POST: APIRoute = async ({ request, cookies }) => {
  try {
    const body = await request.json();
    const expectedChallenge = cookies.get('passkey_auth_challenge')?.value;

    if (!expectedChallenge) {
      return new Response(JSON.stringify({ error: 'Challenge expirado' }), { status: 400 });
    }

    // Buscar la credencial en la base de datos
    const rows = await sql`
      select p.public_key, p.counter, p.user_id, p.transports 
      from passkeys p
      where p.id = ${body.id}
      limit 1
    `;

    if (rows.length === 0) {
      return new Response(JSON.stringify({ error: 'Credencial no encontrada' }), { status: 400 });
    }

    const passkey = rows[0];

    let verification;
    try {
      verification = await verifyAuthenticationResponse({
        response: body,
        expectedChallenge,
        expectedOrigin,
        expectedRPID: rpID,
        authenticator: {
          credentialID: body.id,
          credentialPublicKey: Buffer.from(passkey.public_key as string, 'base64url'),
          counter: Number(passkey.counter),
          transports: passkey.transports as any,
        },
      });
    } catch (error: any) {
      console.error('Error verificando autenticación:', error.message);
      return new Response(JSON.stringify({ error: error.message }), { status: 400 });
    }

    const { verified, authenticationInfo } = verification;

    if (verified && authenticationInfo) {
      // Actualizar el contador de la credencial y last_used_at
      await sql`
        update passkeys 
        set counter = ${authenticationInfo.newCounter}, last_used_at = now()
        where id = ${body.id}
      `;

      // Crear sesión
      const sessionId = base64url(randomBytes(32));
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 días
      
      const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "anon";
      const userAgent = request.headers.get("user-agent");

      await createSession(sessionId, passkey.user_id as string, expiresAt, userAgent, ip);

      // Setear cookie segura
      cookies.set('cord_session', sessionId, {
        path: '/',
        httpOnly: true,
        secure: import.meta.env.PROD,
        sameSite: 'lax',
        maxAge: 30 * 24 * 60 * 60, // 30 días en segundos
      });

      // Limpiar el challenge
      cookies.delete('passkey_auth_challenge', { path: '/' });

      return new Response(JSON.stringify({ success: true }), { status: 200 });
    }

    return new Response(JSON.stringify({ error: 'Verificación fallida' }), { status: 400 });
  } catch (error) {
    console.error('Error en verify:', error);
    return new Response(JSON.stringify({ error: 'Error interno' }), { status: 500 });
  }
};

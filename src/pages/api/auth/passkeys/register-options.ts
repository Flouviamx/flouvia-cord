import type { APIRoute } from 'astro';
import { generateRegistrationOptions } from '@simplewebauthn/server';
import { sql } from '../../../../lib/db';
import { validateSession } from '../../../../lib/auth';

export const prerender = false;

const rpName = 'Cord';
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

    // Buscar al usuario
    const rows = await sql`select email from users where id = ${session.userId}`;
    if (rows.length === 0) {
      return new Response(JSON.stringify({ error: 'Usuario no encontrado' }), { status: 404 });
    }
    const user = rows[0];

    // Buscar passkeys ya registradas para excluirlas
    const passkeys = await sql`select id from passkeys where user_id = ${session.userId}`;

    // SimpleWebAuthn espera el ID como un string/buffer
    const options = await generateRegistrationOptions({
      rpName,
      rpID,
      userID: new TextEncoder().encode(session.userId), // Enviar uuid codificado
      userName: user.email as string,
      attestationType: 'none',
      excludeCredentials: passkeys.map(pk => ({
        id: pk.id as string,
        transports: ['internal'],
      })),
      authenticatorSelection: {
        residentKey: 'preferred',
        userVerification: 'preferred',
        authenticatorAttachment: 'platform',
      },
    });

    // Guardar el challenge temporalmente en una cookie segura
    cookies.set('passkey_challenge', options.challenge, {
      httpOnly: true,
      secure: import.meta.env.PROD,
      sameSite: 'lax',
      path: '/',
      maxAge: 300, // 5 minutos
    });

    return new Response(JSON.stringify(options), { status: 200 });
  } catch (error) {
    console.error('Error en register-options:', error);
    return new Response(JSON.stringify({ error: 'Error interno' }), { status: 500 });
  }
};

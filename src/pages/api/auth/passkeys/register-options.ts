import type { APIRoute } from 'astro';
import { generateRegistrationOptions } from '@simplewebauthn/server';
import { sql } from '../../../../lib/db';
import { validateSession, SESSION_COOKIE } from '../../../../lib/auth';

export const prerender = false;

const rpName = 'Cord';
const rpID = import.meta.env.PROD ? 'cordhq.app' : 'localhost';

export const POST: APIRoute = async ({ cookies }) => {
  try {
    const sessionToken = cookies.get(SESSION_COOKIE)?.value;
    if (!sessionToken) {
      return new Response(JSON.stringify({ error: 'No autenticado' }), { status: 401 });
    }
    const session = await validateSession(sessionToken);
    if (!session) {
      return new Response(JSON.stringify({ error: 'No autenticado' }), { status: 401 });
    }

    const rows = await sql`select email from users where id = ${session.userId}`;
    if (rows.length === 0) {
      return new Response(JSON.stringify({ error: 'Usuario no encontrado' }), { status: 404 });
    }
    const user = rows[0];

    // Passkeys ya registradas (con sus transports reales) — para excluirlas del alta.
    const passkeys = await sql`select id, transports from passkeys where user_id = ${session.userId}`;

    // @simplewebauthn/server v13: userID espera un Uint8Array_.
    const options = await generateRegistrationOptions({
      rpName,
      rpID,
      userID: new TextEncoder().encode(session.userId),
      userName: user.email as string,
      attestationType: 'none',
      excludeCredentials: passkeys.map((pk) => ({
        id: pk.id as string,
        transports: (pk.transports as any) || undefined,
      })),
      authenticatorSelection: {
        residentKey: 'preferred',
        userVerification: 'preferred',
        authenticatorAttachment: 'platform',
      },
    });

    cookies.set('passkey_challenge', options.challenge, {
      httpOnly: true,
      secure: import.meta.env.PROD,
      sameSite: 'lax',
      path: '/',
      maxAge: 300,
    });

    return new Response(JSON.stringify(options), { status: 200 });
  } catch (error) {
    console.error('Error en register-options:', error);
    return new Response(JSON.stringify({ error: 'Error interno' }), { status: 500 });
  }
};

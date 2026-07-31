import type { APIRoute } from 'astro';
import { generateAuthenticationOptions } from '@simplewebauthn/server';

export const prerender = false;

const rpID = import.meta.env.PROD ? 'cordhq.app' : 'localhost';

export const POST: APIRoute = async ({ cookies }) => {
  try {
    const options = await generateAuthenticationOptions({
      rpID,
      userVerification: 'preferred',
    });

    // Guardar el challenge temporalmente en una cookie segura
    cookies.set('passkey_auth_challenge', options.challenge, {
      httpOnly: true,
      secure: import.meta.env.PROD,
      sameSite: 'lax',
      path: '/',
      maxAge: 300, // 5 minutos
    });

    return new Response(JSON.stringify(options), { status: 200 });
  } catch (error) {
    console.error('Error en auth-options:', error);
    return new Response(JSON.stringify({ error: 'Error interno' }), { status: 500 });
  }
};

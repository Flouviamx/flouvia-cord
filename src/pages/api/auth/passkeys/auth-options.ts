import type { APIRoute } from 'astro';
import { generateAuthenticationOptions } from '@simplewebauthn/server';
import { rateLimit, tooMany } from '../../../../lib/ratelimit';
import { trustedIp } from '../../../../lib/ip';
import { log } from '../../../../lib/log';

export const prerender = false;

const rpID = import.meta.env.PROD ? 'cordhq.app' : 'localhost';

export const POST: APIRoute = async ({ request, cookies }) => {
  try {
    const rl = await rateLimit(`passkey-auth-opts:${trustedIp(request)}`, 30, 60);
    if (!rl.ok) return tooMany(rl.retryAfter);

    const options = await generateAuthenticationOptions({
      rpID,
      userVerification: 'preferred',
    });

    cookies.set('passkey_auth_challenge', options.challenge, {
      httpOnly: true,
      secure: import.meta.env.PROD,
      sameSite: 'lax',
      path: '/',
      maxAge: 300,
    });

    return new Response(JSON.stringify(options), { status: 200 });
  } catch (error) {
    log.error('Error en auth-options', { err: error });
    return new Response(JSON.stringify({ error: 'Error interno' }), { status: 500 });
  }
};

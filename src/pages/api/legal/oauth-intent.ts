export const prerender = false;

import type { APIRoute } from 'astro';
import { createSignupLegalIntent, SIGNUP_LEGAL_INTENT_COOKIE } from '../../../lib/legal-signup';
import { oauthLegalIntentSchema, parseJsonBody } from '../../../lib/validation';
import { rateLimit, tooMany } from '../../../lib/ratelimit';
import { trustedIp } from '../../../lib/ip';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});

export const POST: APIRoute = async ({ request, cookies }) => {
  const rl = await rateLimit(`legal-oauth-intent:${trustedIp(request)}`, 10, 60);
  if (!rl.ok) return tooMany(rl.retryAfter);

  const parsed = await parseJsonBody(request, oauthLegalIntentSchema);
  if (!parsed.ok) return json({ error: parsed.error }, parsed.status);

  const { provider, legalLocale } = parsed.data;
  try {
    const token = await createSignupLegalIntent(request, legalLocale, `signup_${provider}`);
    const apple = provider === 'apple';
    cookies.set(SIGNUP_LEGAL_INTENT_COOKIE, token, {
      path: '/',
      httpOnly: true,
      secure: apple || import.meta.env.PROD,
      sameSite: apple ? 'none' : 'lax',
      maxAge: 15 * 60,
    });
    return json({ ok: true });
  } catch {
    return json({ error: 'legal_intent_failed' }, 500);
  }
};

import { createHash, randomBytes } from 'node:crypto';
import { sql } from './db';
import { trustedIp } from './ip';
import type { LegalLocale } from './legal-corpus';

export const SIGNUP_LEGAL_INTENT_COOKIE = 'cord_signup_legal_intent';

export type OAuthLegalSurface = 'signup_google' | 'signup_apple';

export function legalIntentHash(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export async function createSignupLegalIntent(
  request: Request,
  locale: LegalLocale,
  surface: OAuthLegalSurface,
): Promise<string> {
  const token = randomBytes(32).toString('base64url');
  const tokenHash = legalIntentHash(token);
  const ip = trustedIp(request);
  const userAgent = request.headers.get('user-agent') || 'desconocido';

  await sql`select cord_create_signup_legal_intent(
    ${tokenHash}, ${locale}, ${surface}, ${ip}, ${userAgent}
  )`;

  return token;
}

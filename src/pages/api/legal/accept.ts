export const prerender = false;

import type { APIRoute } from 'astro';
import { currentUserId } from '../../../lib/context';
import { sql } from '../../../lib/db';
import { trustedIp } from '../../../lib/ip';
import { log } from '../../../lib/log';
import { currentLegalAcceptanceSchema, parseJsonBody } from '../../../lib/validation';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});

export const POST: APIRoute = async ({ request }) => {
  const userId = currentUserId();
  if (!userId) return json({ error: 'not_authenticated' }, 401);

  const parsed = await parseJsonBody(request, currentLegalAcceptanceSchema);
  if (!parsed.ok) return json({ error: parsed.error }, parsed.status);

  const { legalLocale, termsAccepted, privacyAcknowledged } = parsed.data;
  try {
    await sql`select cord_accept_current_legal_bundle(
      ${userId}, ${legalLocale}, ${termsAccepted}, ${privacyAcknowledged},
      ${trustedIp(request)}, ${request.headers.get('user-agent') || 'desconocido'}
    )`;
    return json({ ok: true });
  } catch (error) {
    log.error('no se pudo registrar el bundle legal', { route: 'legal/accept', err: error });
    return json({ error: 'legal_acceptance_failed' }, 500);
  }
};

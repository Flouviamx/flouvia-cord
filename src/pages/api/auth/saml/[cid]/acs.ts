// POST /api/auth/saml/[cid]/acs — Assertion Consumer Service. Recibe el POST
// cross-origin del IdP (Origin = el dominio del IdP o null — necesita un
// carve-out explícito de CSRF en src/middleware.ts; la defensa real de esta
// ruta es la firma XML-DSig + InResponseTo/RelayState de un solo uso + el
// replay-guard de assertion_id, NUNCA el header Origin).
export const prerender = false;

import type { APIRoute } from 'astro';
import { sql, logAudit, reqIp } from '../../../../../lib/db';
import { rateLimit, tooMany } from '../../../../../lib/ratelimit';
import { log } from '../../../../../lib/log';
import {
  getConnection, buildSamlInstance, peekResponseAttr, assertNameIdFormatAllowed,
  assertDestinationAndRecipient, extractAssertionIdAndExpiry, claimAssertionOnce,
  resolveUserAndProvision, createSsoHandoff, acsUrl, SamlValidationError,
} from '../../../../../lib/saml';

export const POST: APIRoute = async ({ params, request, redirect }) => {
  const cid = params.cid;
  if (!cid) return redirect('/sign-in?sso_error=connection');

  // Por conexión, no por IP — el IdP suele reenviar todas las respuestas
  // desde un puñado de IPs propias; limitar por IP ahí bloquearía a toda una
  // empresa detrás del mismo NAT saliente del lado del IdP.
  const rl = await rateLimit(`saml-acs:${cid}`, 60, 60);
  if (!rl.ok) return tooMany(rl.retryAfter);

  const conn = await getConnection(cid);
  if (!conn || !conn.enabled) return redirect('/sign-in?sso_error=connection');

  let form: FormData;
  try { form = await request.formData(); } catch { return redirect('/sign-in?sso_error=formato'); }
  const samlResponse = form.get('SAMLResponse');
  const relayState = form.get('RelayState');
  if (typeof samlResponse !== 'string' || !samlResponse) return redirect('/sign-in?sso_error=formato');

  // Presencia de InResponseTo en el XML CRUDO (sin validar todavía) decide el
  // MODO de validación — mismo patrón que node-saml usa internamente para su
  // propia decisión de "must validate". Nada se confía de este peek más allá
  // de "¿debo exigir InResponseTo o no?"; la firma se verifica después.
  const hasInResponseTo = !!peekResponseAttr(samlResponse, 'InResponseTo');
  const isIdpInitiated = !hasInResponseTo;

  if (isIdpInitiated && !conn.allowIdpInitiated) {
    await logAudit(conn.orgId, { accion: 'sso.idp_initiated_rechazado', entidad: 'sso_connection', entidad_id: cid, ip: reqIp(request) });
    return redirect('/sign-in?sso_error=idp_initiated_no_permitido');
  }

  // El destino solo viene de Cord (la fila que el propio login.ts creó);
  // IdP-initiated SIEMPRE aterriza en /app — nunca en algo que el POST del
  // IdP pudiera intentar controlar.
  let redirectTo = '/app';
  if (!isIdpInitiated && typeof relayState === 'string' && relayState) {
    const rows = await sql`
      select redirect_to from saml_auth_requests
      where relay_state = ${relayState} and connection_id = ${cid} and expires_at > now()
      limit 1`;
    if (rows.length && rows[0].redirect_to) redirectTo = rows[0].redirect_to as string;
  }

  try {
    const saml = buildSamlInstance(conn, isIdpInitiated ? { kind: 'idp-acs' } : { kind: 'sp-acs' });
    const { profile } = await saml.validatePostResponseAsync(
      typeof relayState === 'string' && relayState
        ? { SAMLResponse: samlResponse, RelayState: relayState }
        : { SAMLResponse: samlResponse },
    );
    if (!profile) throw new SamlValidationError('sin_perfil');

    // Checklist que node-saml NO cubre (ver src/lib/saml.ts):
    assertNameIdFormatAllowed(profile.nameIDFormat);
    assertDestinationAndRecipient(profile, acsUrl(cid));

    const idAndExpiry = extractAssertionIdAndExpiry(profile);
    if (!idAndExpiry) throw new SamlValidationError('sin_assertion_id');
    const claimed = await claimAssertionOnce(idAndExpiry.assertionId, cid, idAndExpiry.notOnOrAfter);
    if (!claimed) throw new SamlValidationError('replay');

    const result = await resolveUserAndProvision(conn, profile);

    await logAudit(conn.orgId, {
      accion: 'sso.login',
      entidad: 'usuario',
      entidad_id: result.userId,
      actor: result.userId,
      detalle: isIdpInitiated ? 'idp-initiated' : 'sp-initiated',
      ip: reqIp(request),
      userAgent: request.headers.get('user-agent'),
    });

    // Nunca se pone la cookie de sesión aquí — ver createSsoHandoff.
    const handoffToken = await createSsoHandoff(result.userId, redirectTo, result.needs2fa);
    return redirect(`/api/auth/saml/complete?t=${encodeURIComponent(handoffToken)}`);
  } catch (err) {
    // El detalle SOLO va a consola + sso_connections.last_error (visible al
    // admin en Ajustes › SSO) — nunca a la URL, que podría filtrar detalle de
    // validación a un atacante iterando el ataque a través de la barra de
    // direcciones/historial del navegador.
    const slug = err instanceof SamlValidationError ? err.message : 'validacion';
    log.error('Error', { route: 'saml/acs', err });
    await sql`update sso_connections set last_error = ${slug}, last_error_at = now() where id = ${cid}`;
    return redirect(`/sign-in?sso_error=${encodeURIComponent(slug)}`);
  }
};

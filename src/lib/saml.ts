// Núcleo de SSO empresarial SAML 2.0. La firma/canonicalización XML-DSig NO se
// hand-rollea (a diferencia de auth-apple.ts, que verifica JWT a mano con
// webcrypto): SAML firma un node-set, no un string de bytes, y exige Exclusive
// C14N — equivocarse en el detalle produce un verificador que acepta firmas
// válidas Y documentos mutados por XML Signature Wrapping (XSW), en silencio.
// Motor real: @node-saml/node-saml (xml-crypto por debajo). Ver
// docs/historial-auth-clerk.md para el detalle de la decisión.
//
// Cobertura verificada de node-saml (leyendo su fuente, no solo los tipos):
// ya valida — single-assertion enforcement, firma vía nodo verificado
// (getVerifiedXml, nunca el documento crudo), Issuer, Audience, NotBefore/
// NotOnOrAfter (Conditions y SubjectConfirmationData), InResponseTo vía
// cacheProvider. NO valida (y este módulo sí lo hace): Destination/Recipient
// contra la ACS URL real, NameID transient, y replay de assertion_id fuera de
// la ventana de InResponseTo (crítico para IdP-initiated, que no tiene
// InResponseTo en absoluto).

import { randomBytes } from 'node:crypto';
import { DOMParser } from '@xmldom/xmldom';
import { SAML, ValidateInResponseTo } from '@node-saml/node-saml';
import type { CacheProvider, CacheItem, Profile } from '@node-saml/node-saml';
import { sql, withOrgTx } from './db';
import { siteOrigin } from './email';
import { validateWebhookUrl } from './ssrf';
import { sha256Hex } from './auth';
import { checkEntitlement } from './org-entitlements';
import { cancelUsage, flushUsageReservation, reserveUsage } from './billing';
import { trackServer, posthogServer } from './posthog-server';
import { PRESETS, ALL_PERM_KEYS, type PermMap } from './permissions';

export class SamlValidationError extends Error {}

// ── Fila de conexión ──────────────────────────────────────────────────────

export interface AttrMap {
  email?: string;
  firstName?: string;
  lastName?: string;
  groups?: string;
}

export interface RoleMappingRule {
  attr: string;
  op: 'equals' | 'contains' | 'regex';
  value: string;
  preset: string;
  permisos?: PermMap | null;
}

export interface SsoConnection {
  id: string;
  orgId: string;
  nombre: string;
  proveedor: string;
  enabled: boolean;
  idpEntityId: string;
  idpSsoUrl: string;
  idpSloUrl: string | null;
  idpCerts: string[];
  nameidFormat: string;
  wantAssertionSigned: boolean;
  wantResponseSigned: boolean;
  signAuthnRequest: boolean;
  clockSkewMs: number;
  allowIdpInitiated: boolean;
  jitProvisioning: boolean;
  attrMap: AttrMap;
  roleMappings: RoleMappingRule[];
  defaultPreset: string;
}

function rowToConnection(r: any): SsoConnection {
  return {
    id: r.id,
    orgId: r.org_id,
    nombre: r.nombre,
    proveedor: r.proveedor,
    enabled: r.enabled,
    idpEntityId: r.idp_entity_id,
    idpSsoUrl: r.idp_sso_url,
    idpSloUrl: r.idp_slo_url,
    idpCerts: Array.isArray(r.idp_certs) ? r.idp_certs : [],
    nameidFormat: r.nameid_format,
    wantAssertionSigned: !!r.want_assertion_signed,
    wantResponseSigned: !!r.want_response_signed,
    signAuthnRequest: !!r.sign_authn_request,
    clockSkewMs: r.clock_skew_ms,
    allowIdpInitiated: !!r.allow_idp_initiated,
    jitProvisioning: !!r.jit_provisioning,
    attrMap: r.attr_map ?? {},
    roleMappings: Array.isArray(r.role_mappings) ? r.role_mappings : [],
    defaultPreset: r.default_preset,
  };
}

/** Carga una conexión por id. Sin contexto de org (carril de auth — sql crudo, mismo patrón que oauth_accounts/sessions; ver RLS sin force en db/schema.sql). */
export async function getConnection(id: string): Promise<SsoConnection | null> {
  // El id de conexión aparece en URLs públicas y por sí solo no demuestra que
  // la organización siga pagando SSO. Filtrar aquí cubre login SP/IdP,
  // metadata y ACS, incluso si alguien conserva una URL después del downgrade.
  const rows = await sql`
    select c.*
      from sso_connections c
     where c.id = ${id}
       and cord_effective_plan(c.org_id) in ('scale', 'developer')
     limit 1`;
  if (!rows.length) return null;
  return rowToConnection(rows[0]);
}

// ── URLs del SP ─────────────────────────────────────────────────────────────
// SIEMPRE derivadas de siteOrigin() (mismo helper ya usado por los correos de
// cron en email.ts), NUNCA de url.origin de la request: un preview de Vercel
// tiene un hostname distinto en cada deploy, y validar Destination/Audience
// contra ese valor volvería la validación vacua.
export function acsUrl(connectionId: string): string {
  return `${siteOrigin()}/api/auth/saml/${connectionId}/acs`;
}
export function metadataUrl(connectionId: string): string {
  return `${siteOrigin()}/api/auth/saml/${connectionId}/metadata`;
}

// ── Material de firma del SP (opcional, un solo keypair a nivel Cord) ──────
// Reusado por TODAS las conexiones — un keypair por org multiplicaría gestión
// de llaves sin ganancia real de aislamiento (ver plan). Sin estas env vars,
// firmar AuthnRequests simplemente no está disponible; la CRUD de Fase 2
// rechaza activar sign_authn_request si esto devuelve null.
export function spSigningMaterial(): { privateKey: string; publicCert: string } | null {
  const privateKey = import.meta.env.SAML_SP_PRIVATE_KEY || process.env.SAML_SP_PRIVATE_KEY;
  const publicCert = import.meta.env.SAML_SP_CERT || process.env.SAML_SP_CERT;
  if (!privateKey || !publicCert) return null;
  return { privateKey: privateKey.replace(/\\n/g, '\n'), publicCert: publicCert.replace(/\\n/g, '\n') };
}

// ── Cache de node-saml, respaldado por Postgres ────────────────────────────
// node-saml documenta que su InMemoryCacheProvider default NO alcanza para
// "multiple server instances/load balanced scenarios" — exactamente Vercel
// (cada invocación puede caer en una instancia de proceso distinta a la que
// generó el AuthnRequest). Esta clase reusa la MISMA tabla saml_auth_requests
// que ya guarda relay_state/redirect_to: node-saml llama
// saveAsync(id, instant) al generar un AuthnRequest (id = el AuthnRequest ID
// real) y luego getAsync/removeAsync(id) al validar la respuesta — el id es
// la clave natural que ata ambos lados del roundtrip.
class PgSamlCacheProvider implements CacheProvider {
  constructor(
    private connectionId: string,
    private onSave?: { relayState: string; redirectTo: string | null; ip: string | null },
  ) {}

  async saveAsync(key: string, value: string): Promise<CacheItem | null> {
    if (this.onSave) {
      // TTL 10 min: alcanza para una IdP con MFA/reset de password de por
      // medio, y mantiene la ventana de replay irrelevante.
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
      // Limpieza oportunista (mismo patrón que two_factor_challenges/
      // sso_handoffs): sin cron dedicado, la tabla se autolimpia sobre el
      // tráfico real de logins — un índice por expires_at hace este delete barato.
      await sql`delete from saml_auth_requests where expires_at < now()`;
      await sql`
        insert into saml_auth_requests (id, connection_id, relay_state, redirect_to, ip, expires_at)
        values (${key}, ${this.connectionId}, ${this.onSave.relayState}, ${this.onSave.redirectTo}, ${this.onSave.ip}, ${expiresAt})
        on conflict (id) do nothing`;
    }
    return { value, createdAt: Date.now() };
  }

  async getAsync(key: string): Promise<string | null> {
    const rows = await sql`
      select created_at from saml_auth_requests
      where id = ${key} and connection_id = ${this.connectionId} and expires_at > now()
      limit 1`;
    if (!rows.length) return null;
    return new Date(rows[0].created_at as string).toISOString();
  }

  async removeAsync(key: string | null): Promise<string | null> {
    if (!key) return null;
    // Un solo uso, atómico: si otra request ya lo consumió, esta devuelve null.
    const rows = await sql`
      update saml_auth_requests set consumed_at = now()
      where id = ${key} and connection_id = ${this.connectionId} and consumed_at is null
      returning id`;
    return rows.length ? key : null;
  }
}

// ── Construcción de la instancia SAML ──────────────────────────────────────

export type SamlBuildMode =
  | { kind: 'sp-login'; relayState: string; redirectTo: string | null; ip: string | null }
  | { kind: 'sp-acs' }
  | { kind: 'idp-acs' };

/**
 * Arma una instancia de `SAML` (node-saml) desde una fila de conexión.
 * - 'sp-login' → /api/auth/saml/[cid]/login, genera el AuthnRequest.
 * - 'sp-acs'   → /api/auth/saml/[cid]/acs cuando la respuesta trae InResponseTo.
 * - 'idp-acs'  → /api/auth/saml/[cid]/acs cuando NO trae InResponseTo — SOLO
 *                válido si connection.allowIdpInitiated === true (el caller
 *                es responsable de verificar ese flag antes de llamar aquí).
 */
export function buildSamlInstance(conn: SsoConnection, mode: SamlBuildMode): SAML {
  if (conn.idpCerts.length === 0) {
    throw new SamlValidationError('sin_certificado');
  }
  if (!conn.wantAssertionSigned && !conn.wantResponseSigned) {
    // Defensa en profundidad — la CRUD de Fase 2 ya rechaza esta combinación,
    // pero un valor corrupto en BD no debe terminar autenticando sin firma.
    throw new SamlValidationError('sin_firma_requerida');
  }

  const cacheProvider = new PgSamlCacheProvider(
    conn.id,
    mode.kind === 'sp-login' ? { relayState: mode.relayState, redirectTo: mode.redirectTo, ip: mode.ip } : undefined,
  );

  let signing: { privateKey: string; publicCert: string } | undefined;
  if (conn.signAuthnRequest) {
    const material = spSigningMaterial();
    if (!material) throw new SamlValidationError('sp_signing_no_configurado');
    signing = material;
  }

  return new SAML({
    idpCert: conn.idpCerts,
    issuer: metadataUrl(conn.id),
    callbackUrl: acsUrl(conn.id),
    entryPoint: conn.idpSsoUrl,
    identifierFormat: conn.nameidFormat,
    wantAssertionsSigned: conn.wantAssertionSigned,
    wantAuthnResponseSigned: conn.wantResponseSigned,
    validateInResponseTo: mode.kind === 'idp-acs' ? ValidateInResponseTo.never : ValidateInResponseTo.always,
    acceptedClockSkewMs: conn.clockSkewMs,
    disableRequestedAuthnContext: true, // el IdP decide el método de auth, Cord no lo fuerza
    authnRequestBinding: 'HTTP-Redirect', // esquiva el CSP form-action — ver src/middleware.ts
    privateKey: signing?.privateKey,
    publicCert: signing?.publicCert,
    cacheProvider,
  });
}

/** Metadata XML del Service Provider — firma el AuthnRequest solo si hay keypair configurado. */
export function generateMetadata(saml: SAML): string {
  const signing = spSigningMaterial();
  return saml.generateServiceProviderMetadata(null, signing?.publicCert ?? null);
}

// ── Validación adicional (lo que node-saml NO cubre) ────────────────────────

function firstElementAttr(xml: string, localName: string, attr: string): string | null {
  const doc = new DOMParser().parseFromString(xml, 'text/xml');
  let found: string | null = null;
  const walk = (node: any) => {
    if (found) return;
    if (node.nodeType === 1 && node.localName === localName) {
      const v = node.getAttribute(attr);
      if (v) { found = v; return; }
    }
    const children = node.childNodes;
    for (let i = 0; children && i < children.length; i++) walk(children[i]);
  };
  if (doc.documentElement) walk(doc.documentElement);
  return found;
}

/**
 * Lee un atributo de `<Response>` ANTES de cualquier validación de firma —
 * usado SOLO para decidir qué modo de validación aplicar (sp-acs vs
 * idp-acs), nunca como fuente de verdad de identidad. Es el mismo patrón que
 * usa node-saml internamente (línea ~508 de saml.js): mira `InResponseTo` en
 * el documento crudo para decidir SI debe validar contra el cache, y luego
 * compara el valor contra algo impredecible (aquí, si existe una fila en
 * saml_auth_requests) — un atacante puede escribir cualquier cosa en un XML
 * no firmado, pero no puede hacer que ese valor pase la verificación real.
 */
export function peekResponseAttr(samlResponseB64: string, attr: string): string | null {
  let xml: string;
  try { xml = Buffer.from(samlResponseB64, 'base64').toString('utf8'); }
  catch { return null; }
  if (xml.length > 512_000) return null;
  return firstElementAttr(xml, 'Response', attr);
}

/**
 * node-saml valida firma/Issuer/Audience/timestamps/InResponseTo pero NO
 * valida Destination (en <Response>) ni Recipient (en SubjectConfirmationData)
 * contra la URL real del ACS. Chequeo manual sobre el XML YA VERIFICADO por
 * node-saml (profile.getSamlResponseXml()) — nunca sobre el body crudo sin
 * validar. Solo rechaza en caso de MISMATCH; la ausencia del atributo (que
 * algunos IdPs omiten) no es un error aquí, siguiendo la redacción del spec
 * ("Destination, cuando está presente").
 */
export function assertDestinationAndRecipient(profile: Profile, expectedAcsUrl: string): void {
  const responseXml = profile.getSamlResponseXml?.();
  if (responseXml) {
    const destination = firstElementAttr(responseXml, 'Response', 'Destination');
    if (destination && destination !== expectedAcsUrl) {
      throw new SamlValidationError('destination_no_coincide');
    }
  }
  const assertionXml = profile.getAssertionXml?.();
  if (assertionXml) {
    const recipient = firstElementAttr(assertionXml, 'SubjectConfirmationData', 'Recipient');
    if (recipient && recipient !== expectedAcsUrl) {
      throw new SamlValidationError('recipient_no_coincide');
    }
  }
}

/** Un NameID `transient` rota en cada login — crearía una fila `oauth_accounts` distinta por sesión, bifurcando la cuenta en silencio. */
export function assertNameIdFormatAllowed(nameIdFormat: string | null | undefined): void {
  if (!nameIdFormat) return;
  if (nameIdFormat.endsWith(':nameid-format:transient')) {
    throw new SamlValidationError('nameid_transient_no_permitido');
  }
}

/** Extrae el `@ID` y `Conditions/@NotOnOrAfter` de la aserción YA verificada, para el registro de replay. */
export function extractAssertionIdAndExpiry(profile: Profile): { assertionId: string; notOnOrAfter: Date } | null {
  const xml = profile.getAssertionXml?.();
  if (!xml) return null;
  const assertionId = firstElementAttr(xml, 'Assertion', 'ID');
  const notOnOrAfter = firstElementAttr(xml, 'Conditions', 'NotOnOrAfter');
  if (!assertionId || !notOnOrAfter) return null;
  const expiry = new Date(notOnOrAfter);
  if (Number.isNaN(expiry.getTime())) return null;
  return { assertionId, notOnOrAfter: expiry };
}

/**
 * Registra el uso de una aserción. `true` = primera vez que se ve (login
 * sigue adelante); `false` = replay, rechazar. Atómico vía `on conflict do
 * nothing returning` — sin carrera read-then-write. Necesario sobre todo
 * para IdP-initiated (sin InResponseTo, sin la protección que ya da
 * saml_auth_requests), pero se aplica siempre como defensa en profundidad.
 */
export async function claimAssertionOnce(assertionId: string, connectionId: string, notOnOrAfter: Date): Promise<boolean> {
  const expiresAt = new Date(notOnOrAfter.getTime() + 5 * 60 * 1000); // margen sobre el skew aceptado
  // Limpieza oportunista: una fila ya expirada aquí es una aserción cuyo
  // propio NotOnOrAfter ya pasó — node-saml la habría rechazado por timestamp
  // antes de llegar a este punto, así que nunca hay riesgo de limpiar algo
  // todavía reclamable.
  await sql`delete from saml_assertion_replay where expires_at < now()`;
  const rows = await sql`
    insert into saml_assertion_replay (assertion_id, connection_id, expires_at)
    values (${assertionId}, ${connectionId}, ${expiresAt})
    on conflict (assertion_id) do nothing
    returning assertion_id`;
  return rows.length > 0;
}

// ── Mapeo de roles desde atributos del IdP ──────────────────────────────────

export interface RoleEvalResult { rol: string; permisos: PermMap | null }

function attrArray(attributes: Record<string, unknown> | undefined, attrName: string): string[] {
  if (!attributes) return [];
  const v = attributes[attrName];
  if (v == null) return [];
  return Array.isArray(v) ? v.map(String) : [String(v)];
}

function ruleMatches(rule: RoleMappingRule, values: string[]): boolean {
  switch (rule.op) {
    case 'equals':
      return values.some((v) => v === rule.value);
    case 'contains':
      return values.some((v) => v.includes(rule.value));
    case 'regex':
      try {
        const re = new RegExp(rule.value);
        return values.some((v) => re.test(v));
      } catch {
        return false; // patrón inválido guardado en BD → nunca matchea, no tronar el login
      }
    default:
      return false;
  }
}

/**
 * Reglas en orden, primera que matchea gana. `preset:'owner'` en una regla se
 * ignora siempre — owner es la identidad de facturación/eliminación y jamás
 * se otorga por una config de IdP (server-side, no solo en la UI de Fase 7).
 */
export function evaluateRoleMappings(
  rules: RoleMappingRule[],
  attributes: Record<string, unknown> | undefined,
  defaultPreset: string,
): RoleEvalResult {
  for (const rule of rules) {
    if (rule.preset === 'owner') continue;
    if (ruleMatches(rule, attrArray(attributes, rule.attr))) {
      return { rol: rule.preset, permisos: rule.permisos ?? null };
    }
  }
  return { rol: defaultPreset === 'owner' ? 'lectura' : defaultPreset, permisos: null };
}

// ── Parser de metadata XML del IdP ──────────────────────────────────────────
// Solo acepta XML PEGADO por el admin — nunca una URL que Cord vaya a fetchear
// server-side (eso sería un vector SSRF real, a diferencia de idp_sso_url/
// idp_slo_url, que solo se usan para armar un Location de REDIRECT al
// navegador, nunca un fetch del servidor).

export interface ParsedIdpMetadata {
  entityId: string;
  ssoUrl: string;
  sloUrl: string | null;
  certs: string[];
}

function elementsByLocalName(root: any, localName: string): any[] {
  const out: any[] = [];
  const walk = (node: any) => {
    if (node.nodeType === 1 && node.localName === localName) out.push(node);
    const children = node.childNodes;
    for (let i = 0; children && i < children.length; i++) walk(children[i]);
  };
  walk(root);
  return out;
}

function textOf(node: any): string {
  return (node.textContent ?? '').replace(/\s+/g, '');
}

/** Parsea un XML de metadata SAML de IdP (`<EntityDescriptor><IDPSSODescriptor>...`). Lanza SamlValidationError si falta algo esencial. */
export function parseIdpMetadata(xml: string): ParsedIdpMetadata {
  if (xml.length > 512_000) throw new SamlValidationError('metadata_demasiado_grande');
  let doc: any;
  try {
    doc = new DOMParser().parseFromString(xml, 'text/xml');
  } catch {
    throw new SamlValidationError('metadata_xml_invalido');
  }
  const root = doc?.documentElement;
  if (!root || root.localName !== 'EntityDescriptor') {
    throw new SamlValidationError('metadata_xml_invalido');
  }
  const entityId = root.getAttribute('entityID');
  if (!entityId) throw new SamlValidationError('metadata_sin_entity_id');

  const idpDescriptors = elementsByLocalName(root, 'IDPSSODescriptor');
  if (!idpDescriptors.length) throw new SamlValidationError('metadata_sin_idpssodescriptor');
  const idp = idpDescriptors[0];

  const ssoServices = elementsByLocalName(idp, 'SingleSignOnService');
  // Preferir HTTP-Redirect (el binding que usa Cord para el AuthnRequest);
  // si el IdP solo publica POST, se toma esa — la CRUD no fuerza binding.
  const redirectSso = ssoServices.find((n) => n.getAttribute('Binding')?.includes('HTTP-Redirect'));
  const ssoUrl = (redirectSso ?? ssoServices[0])?.getAttribute('Location') ?? null;
  if (!ssoUrl) throw new SamlValidationError('metadata_sin_sso_url');

  const sloServices = elementsByLocalName(idp, 'SingleLogoutService');
  const redirectSlo = sloServices.find((n) => n.getAttribute('Binding')?.includes('HTTP-Redirect'));
  const sloUrl = (redirectSlo ?? sloServices[0])?.getAttribute('Location') ?? null;

  // Certs: buscamos KeyDescriptor con use="signing" (o sin @use, que aplica a
  // ambos usos por spec) dentro de X509Certificate. Varios certs = rotación.
  const certs: string[] = [];
  for (const kd of elementsByLocalName(idp, 'KeyDescriptor')) {
    const use = kd.getAttribute('use');
    if (use && use !== 'signing') continue;
    for (const x509 of elementsByLocalName(kd, 'X509Certificate')) {
      const raw = textOf(x509);
      if (raw) certs.push(raw);
    }
  }
  if (!certs.length) throw new SamlValidationError('metadata_sin_certificado');

  return { entityId, ssoUrl, sloUrl, certs };
}

// ── CRUD de conexiones (Ajustes › SSO) ──────────────────────────────────────
// Estas funciones asumen que el caller (la ruta) ya verificó permiso + plan;
// aquí solo vive la validación de FORMA de los datos y el acceso a BD.

export interface ConnectionInput {
  nombre: string;
  idpEntityId: string;
  idpSsoUrl: string;
  idpSloUrl?: string | null;
  idpCerts: string[];
  nameidFormat?: string;
  wantAssertionSigned?: boolean;
  wantResponseSigned?: boolean;
  signAuthnRequest?: boolean;
  clockSkewMs?: number;
  allowIdpInitiated?: boolean;
  jitProvisioning?: boolean;
  attrMap?: AttrMap;
  roleMappings?: RoleMappingRule[];
  defaultPreset?: string;
}

const PEM_CERT_RE = /-----BEGIN CERTIFICATE-----[\s\S]+-----END CERTIFICATE-----/;
const ALLOWED_NAMEID_FORMATS = new Set([
  'urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress',
  'urn:oasis:names:tc:SAML:2.0:nameid-format:persistent',
  'urn:oasis:names:tc:SAML:1.1:nameid-format:unspecified',
]);
const ALLOWED_PRESETS = new Set(['admin', 'vendedor', 'lectura']); // nunca 'owner' — ver evaluateRoleMappings

function normalizeCert(raw: string): string {
  const trimmed = raw.trim();
  if (PEM_CERT_RE.test(trimmed)) return trimmed;
  // Admite el cert "pelado" (sin envolturas, como viene en <X509Certificate> de metadata).
  return `-----BEGIN CERTIFICATE-----\n${trimmed.replace(/\r?\n/g, '')}\n-----END CERTIFICATE-----`;
}

/** Valida y normaliza los campos de una conexión antes de insert/update. Lanza SamlValidationError con un slug claro si algo no cuadra. */
export function validateConnectionInput(input: ConnectionInput): Required<ConnectionInput> {
  const nombre = input.nombre.trim().slice(0, 120);
  if (!nombre) throw new SamlValidationError('nombre_requerido');

  const idpEntityId = input.idpEntityId.trim();
  if (!idpEntityId || idpEntityId.length > 500) throw new SamlValidationError('entity_id_invalido');

  const ssoCheck = validateWebhookUrl(input.idpSsoUrl.trim());
  if (!ssoCheck.ok) throw new SamlValidationError('sso_url_invalida');
  const idpSsoUrl = input.idpSsoUrl.trim();

  let idpSloUrl: string | null = null;
  if (input.idpSloUrl) {
    const sloCheck = validateWebhookUrl(input.idpSloUrl.trim());
    if (!sloCheck.ok) throw new SamlValidationError('slo_url_invalida');
    idpSloUrl = input.idpSloUrl.trim();
  }

  const idpCerts = (input.idpCerts ?? []).map(normalizeCert).filter((c) => PEM_CERT_RE.test(c));
  if (!idpCerts.length) throw new SamlValidationError('sin_certificado');

  const nameidFormat = input.nameidFormat || 'urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress';
  if (!ALLOWED_NAMEID_FORMATS.has(nameidFormat)) throw new SamlValidationError('nameid_format_no_permitido');

  const wantAssertionSigned = input.wantAssertionSigned ?? true;
  const wantResponseSigned = input.wantResponseSigned ?? true;
  if (!wantAssertionSigned && !wantResponseSigned) throw new SamlValidationError('sin_firma_requerida');

  const signAuthnRequest = input.signAuthnRequest ?? false;
  if (signAuthnRequest && !spSigningMaterial()) throw new SamlValidationError('sp_signing_no_configurado');

  const clockSkewMs = Math.min(Math.max(Number(input.clockSkewMs ?? 60000) || 60000, 0), 300000);

  const roleMappings = (input.roleMappings ?? []).map((r) => {
    if (!r.attr || !r.op || !r.value || !r.preset) throw new SamlValidationError('regla_de_rol_incompleta');
    if (!ALLOWED_PRESETS.has(r.preset)) throw new SamlValidationError('preset_no_permitido'); // rechaza 'owner' aquí también
    if (r.op === 'regex') {
      try { new RegExp(r.value); } catch { throw new SamlValidationError('regex_invalido'); }
    }
    return { attr: String(r.attr).slice(0, 200), op: r.op, value: String(r.value).slice(0, 500), preset: r.preset, permisos: r.permisos ?? null };
  });

  const defaultPreset = input.defaultPreset ?? 'lectura';
  if (!ALLOWED_PRESETS.has(defaultPreset)) throw new SamlValidationError('preset_no_permitido');

  return {
    nombre, idpEntityId, idpSsoUrl, idpSloUrl, idpCerts, nameidFormat,
    wantAssertionSigned, wantResponseSigned, signAuthnRequest, clockSkewMs,
    allowIdpInitiated: !!input.allowIdpInitiated,
    jitProvisioning: input.jitProvisioning ?? true,
    attrMap: input.attrMap ?? {},
    roleMappings,
    defaultPreset,
  };
}

export async function listConnections(orgId: string): Promise<SsoConnection[]> {
  const [rows] = await withOrgTx(orgId, sql`
    select * from sso_connections where org_id = ${orgId} order by created_at asc`);
  return rows.map(rowToConnection);
}

export async function getConnectionForOrg(orgId: string, id: string): Promise<SsoConnection | null> {
  const [rows] = await withOrgTx(orgId, sql`
    select * from sso_connections where id = ${id} and org_id = ${orgId} limit 1`);
  return rows.length ? rowToConnection(rows[0]) : null;
}

export async function createConnection(orgId: string, input: ConnectionInput, createdBy: string | null): Promise<SsoConnection> {
  const v = validateConnectionInput(input);
  const [rows] = await withOrgTx(orgId, sql`
    insert into sso_connections (
      org_id, nombre, idp_entity_id, idp_sso_url, idp_slo_url, idp_certs,
      nameid_format, want_assertion_signed, want_response_signed, sign_authn_request,
      clock_skew_ms, allow_idp_initiated, jit_provisioning, attr_map, role_mappings,
      default_preset, created_by
    ) values (
      ${orgId}, ${v.nombre}, ${v.idpEntityId}, ${v.idpSsoUrl}, ${v.idpSloUrl}, ${v.idpCerts},
      ${v.nameidFormat}, ${v.wantAssertionSigned}, ${v.wantResponseSigned}, ${v.signAuthnRequest},
      ${v.clockSkewMs}, ${v.allowIdpInitiated}, ${v.jitProvisioning}, ${JSON.stringify(v.attrMap)}::jsonb, ${JSON.stringify(v.roleMappings)}::jsonb,
      ${v.defaultPreset}, ${createdBy}
    )
    on conflict (org_id, idp_entity_id) do nothing
    returning *`);
  if (!rows.length) throw new SamlValidationError('conexion_duplicada'); // mismo idp_entity_id ya registrado en esta org
  return rowToConnection(rows[0]);
}

export interface ConnectionPatch extends Partial<ConnectionInput> {
  enabled?: boolean;
}

export async function updateConnection(orgId: string, id: string, patch: ConnectionPatch): Promise<SsoConnection | null> {
  const existing = await getConnectionForOrg(orgId, id);
  if (!existing) return null;

  // Fusiona sobre lo existente y re-valida el objeto COMPLETO — evita que un
  // PATCH parcial deje la fila en una combinación inválida (ej. apagar
  // want_response_signed cuando want_assertion_signed ya estaba en false).
  const merged: ConnectionInput = {
    nombre: patch.nombre ?? existing.nombre,
    idpEntityId: patch.idpEntityId ?? existing.idpEntityId,
    idpSsoUrl: patch.idpSsoUrl ?? existing.idpSsoUrl,
    idpSloUrl: patch.idpSloUrl !== undefined ? patch.idpSloUrl : existing.idpSloUrl,
    idpCerts: patch.idpCerts ?? existing.idpCerts,
    nameidFormat: patch.nameidFormat ?? existing.nameidFormat,
    wantAssertionSigned: patch.wantAssertionSigned ?? existing.wantAssertionSigned,
    wantResponseSigned: patch.wantResponseSigned ?? existing.wantResponseSigned,
    signAuthnRequest: patch.signAuthnRequest ?? existing.signAuthnRequest,
    clockSkewMs: patch.clockSkewMs ?? existing.clockSkewMs,
    allowIdpInitiated: patch.allowIdpInitiated ?? existing.allowIdpInitiated,
    jitProvisioning: patch.jitProvisioning ?? existing.jitProvisioning,
    attrMap: patch.attrMap ?? existing.attrMap,
    roleMappings: patch.roleMappings ?? existing.roleMappings,
    defaultPreset: patch.defaultPreset ?? existing.defaultPreset,
  };
  const v = validateConnectionInput(merged);
  const enabled = patch.enabled ?? existing.enabled;

  const [rows] = await withOrgTx(orgId, sql`
    update sso_connections set
      nombre = ${v.nombre}, idp_entity_id = ${v.idpEntityId}, idp_sso_url = ${v.idpSsoUrl},
      idp_slo_url = ${v.idpSloUrl}, idp_certs = ${v.idpCerts}, nameid_format = ${v.nameidFormat},
      want_assertion_signed = ${v.wantAssertionSigned}, want_response_signed = ${v.wantResponseSigned},
      sign_authn_request = ${v.signAuthnRequest}, clock_skew_ms = ${v.clockSkewMs},
      allow_idp_initiated = ${v.allowIdpInitiated}, jit_provisioning = ${v.jitProvisioning},
      attr_map = ${JSON.stringify(v.attrMap)}::jsonb, role_mappings = ${JSON.stringify(v.roleMappings)}::jsonb,
      default_preset = ${v.defaultPreset}, enabled = ${enabled}, updated_at = now()
    where id = ${id} and org_id = ${orgId}
    returning *`);
  return rows.length ? rowToConnection(rows[0]) : null;
}

export async function deleteConnection(orgId: string, id: string): Promise<boolean> {
  const [rows] = await withOrgTx(orgId, sql`
    delete from sso_connections where id = ${id} and org_id = ${orgId} returning id`);
  return rows.length > 0;
}

// ── Dominios ─────────────────────────────────────────────────────────────

export interface SsoDomain {
  id: string;
  connectionId: string;
  domain: string;
  verifyToken: string;
  verifiedAt: string | null;
}

function rowToDomain(r: any): SsoDomain {
  return { id: r.id, connectionId: r.connection_id, domain: r.domain, verifyToken: r.verify_token, verifiedAt: r.verified_at };
}

export async function listDomains(orgId: string, connectionId: string): Promise<SsoDomain[]> {
  const [rows] = await withOrgTx(orgId, sql`
    select * from sso_domains where connection_id = ${connectionId} and org_id = ${orgId} order by created_at asc`);
  return rows.map(rowToDomain);
}

const DOMAIN_RE = /^(?!-)[a-z0-9-]{1,63}(?<!-)(\.(?!-)[a-z0-9-]{1,63}(?<!-))+$/;

/** Agrega un dominio a verificar. `uq_sso_domain_global` es quien realmente decide si otra org ya lo reclamó (el insert falla con conflicto). */
export async function addDomain(orgId: string, connectionId: string, domainRaw: string): Promise<SsoDomain> {
  const domain = domainRaw.trim().toLowerCase().replace(/^@/, '');
  if (!DOMAIN_RE.test(domain) || domain.length > 253) throw new SamlValidationError('dominio_invalido');
  const token = `cord-domain-verify=${randomBytes(16).toString('hex')}`;
  let rows: any[];
  try {
    [rows] = await withOrgTx(orgId, sql`
      insert into sso_domains (connection_id, org_id, domain, verify_token)
      values (${connectionId}, ${orgId}, ${domain}, ${token})
      on conflict (connection_id, domain) do update set verify_token = sso_domains.verify_token
      returning *`);
  } catch {
    // uq_sso_domain_global: el dominio ya está verificado bajo OTRA conexión/org.
    throw new SamlValidationError('dominio_ya_reclamado');
  }
  return rowToDomain(rows[0]);
}

export async function removeDomain(orgId: string, domainId: string): Promise<boolean> {
  const [rows] = await withOrgTx(orgId, sql`
    delete from sso_domains where id = ${domainId} and org_id = ${orgId} returning id`);
  return rows.length > 0;
}

/** Verificación real por DNS TXT — reemplazo del wizard cosmético que generaba el código en el navegador y nunca lo comprobaba. */
export async function verifyDomainOwnership(orgId: string, domainId: string): Promise<{ ok: boolean; error?: string }> {
  const [rows] = await withOrgTx(orgId, sql`
    select * from sso_domains where id = ${domainId} and org_id = ${orgId} limit 1`);
  if (!rows.length) return { ok: false, error: 'dominio_no_encontrado' };
  const domain = rowToDomain(rows[0]);

  const { resolveTxt } = await import('node:dns/promises');
  let records: string[][];
  try {
    records = await resolveTxt(domain.domain);
  } catch {
    await withOrgTx(orgId, sql`update sso_domains set last_checked_at = now() where id = ${domainId}`);
    return { ok: false, error: 'sin_registros_txt' };
  }
  const flat = records.map((chunks) => chunks.join(''));
  const found = flat.some((v) => v.trim() === domain.verifyToken);

  if (found) {
    try {
      await withOrgTx(orgId, sql`
        update sso_domains set verified_at = now(), last_checked_at = now() where id = ${domainId}`);
    } catch {
      // El índice único global (uq_sso_domain_global) rechazó el UPDATE: otra
      // org verificó este dominio primero, en la ventana entre el DNS check y
      // este UPDATE. Perder la carrera aquí es el comportamiento correcto.
      return { ok: false, error: 'dominio_ya_reclamado' };
    }
    return { ok: true };
  }
  await withOrgTx(orgId, sql`update sso_domains set last_checked_at = now() where id = ${domainId}`);
  return { ok: false, error: 'txt_no_coincide' };
}

// ── Handoff ACS → sesión (mismo patrón que two_factor_challenges) ──────────
// El ACS NUNCA pone la cookie de sesión directamente — sería un Set-Cookie en
// un POST top-level cross-site, terreno inestable con partición de cookies de
// terceros y ya inconsistente en Safari/ITP. En vez de eso crea este handoff
// y redirige a un GET same-origin (/api/auth/saml/complete) que sí mintea la
// sesión, igual que hace google/callback.ts.
const HANDOFF_TTL_MS = 60 * 1000; // 60s — un solo salto inmediato, no una sesión de trabajo

export async function createSsoHandoff(userId: string, redirectTo: string, needs2fa: boolean): Promise<string> {
  const token = randomBytes(32).toString('base64url');
  const tokenHash = sha256Hex(token);
  const expiresAt = new Date(Date.now() + HANDOFF_TTL_MS);
  await sql`insert into sso_handoffs (id, user_id, redirect_to, needs_2fa, expires_at) values (${tokenHash}, ${userId}, ${redirectTo}, ${needs2fa}, ${expiresAt})`;
  return token;
}

export interface ConsumedHandoff { userId: string; redirectTo: string; needs2fa: boolean }

export async function consumeSsoHandoff(token: string): Promise<ConsumedHandoff | null> {
  const tokenHash = sha256Hex(token);
  await sql`delete from sso_handoffs where expires_at < now()`;
  const rows = await sql`delete from sso_handoffs where id = ${tokenHash} returning user_id, redirect_to, needs_2fa, expires_at`;
  if (!rows.length) return null;
  const r = rows[0] as any;
  if (new Date(r.expires_at) < new Date()) return null;
  return { userId: r.user_id as string, redirectTo: (r.redirect_to as string) || '/app', needs2fa: !!r.needs_2fa };
}

// ── Resolución de usuario + JIT provisioning ────────────────────────────────

function cleanPermisos(input: PermMap | null | undefined): PermMap | null {
  if (!input) return null;
  const out: PermMap = {};
  for (const k of ALL_PERM_KEYS) out[k] = !!(input as any)[k];
  return out;
}

export interface SamlLoginResult {
  userId: string;
  isNewUser: boolean;
  needs2fa: boolean;
}

/**
 * Toma una aserción YA VALIDADA (firma/Issuer/Audience/timestamps/
 * InResponseTo/replay ya pasaron) y resuelve/aprovisiona el usuario + su
 * membresía. Mismo patrón que google/callback.ts, con el gate de dominio
 * verificado en el lugar del `verified_email` de Google — sin él, cualquiera
 * que levante un IdP podría asertar el correo de otra persona y quedarse con
 * su cuenta. Usa `sql` crudo (sin withOrgTx): igual que equipo/join.ts,
 * org_members no tiene FORCE RLS — las queries de auth necesitan escribir
 * antes de que exista cualquier contexto de sesión/org establecido.
 */
export async function resolveUserAndProvision(conn: SsoConnection, profile: Profile): Promise<SamlLoginResult> {
  const attributes = (profile as any).attributes as Record<string, unknown> | undefined;

  const emailAttrName = conn.attrMap.email;
  const rawEmail = (emailAttrName ? attributes?.[emailAttrName] : undefined) ?? (profile as any).email ?? (profile as any).mail;
  if (!rawEmail || typeof rawEmail !== 'string') throw new SamlValidationError('sin_correo');
  const email = rawEmail.toLowerCase().trim();
  const atIdx = email.indexOf('@');
  if (atIdx < 1 || atIdx === email.length - 1) throw new SamlValidationError('correo_invalido');
  const emailDomain = email.slice(atIdx + 1);

  // ── El gate real ── (ver docs/historial-auth-clerk.md, análogo de Google)
  const domRows = await sql`
    select 1 from sso_domains
    where connection_id = ${conn.id} and domain = ${emailDomain} and verified_at is not null
    limit 1`;
  if (!domRows.length) throw new SamlValidationError('dominio_no_verificado');

  const nameId = profile.nameID;
  if (!nameId) throw new SamlValidationError('sin_nameid');
  const provider = `saml:${conn.id}`;

  let userId: string;
  let isNewUser = false;

  const oauthRows = await sql`select user_id from oauth_accounts where provider = ${provider} and provider_user_id = ${nameId} limit 1`;
  if (oauthRows.length) {
    userId = oauthRows[0].user_id as string;
  } else {
    const userRows = await sql`select id from users where email = ${email} limit 1`;
    if (userRows.length) {
      userId = userRows[0].id as string;
    } else {
      const firstNameAttrName = conn.attrMap.firstName;
      const lastNameAttrName = conn.attrMap.lastName;
      const firstName = firstNameAttrName ? (attributes?.[firstNameAttrName] as string | undefined) : undefined;
      const lastName = lastNameAttrName ? (attributes?.[lastNameAttrName] as string | undefined) : undefined;
      const [newUser] = await sql`
        insert into users (email, first_name, last_name, email_verified_at)
        values (${email}, ${firstName || null}, ${lastName || null}, now())
        returning id`;
      userId = newUser.id as string;
      isNewUser = true;
    }
    await sql`
      insert into oauth_accounts (user_id, provider, provider_user_id, email)
      values (${userId}, ${provider}, ${nameId}, ${email})
      on conflict (provider, provider_user_id) do nothing`;
    await sql`update users set email_verified_at = coalesce(email_verified_at, now()) where id = ${userId}`;
  }

  // ── Membresía + mapeo de roles ──
  const { rol, permisos } = evaluateRoleMappings(conn.roleMappings, attributes, conn.defaultPreset);
  const resolvedPermisos = cleanPermisos(permisos) ?? cleanPermisos(PRESETS[rol]?.permisos ?? PRESETS.lectura.permisos);

  const [orgRow] = await sql`select owner_id, (sandbox_of is not null) as is_sandbox, is_demo from orgs where id = ${conn.orgId} limit 1`;
  if (!orgRow) throw new SamlValidationError('org_no_encontrada');

  // El owner NUNCA se toca — es un override incondicional en memberCan(), y
  // una mala config de IdP no puede degradarlo ni desactivarlo.
  if (orgRow.owner_id !== userId) {
    const memberRows = await sql`
      select id, estado, sso_managed from org_members
      where org_id = ${conn.orgId} and (user_id = ${userId} or (user_id is null and email = ${email}))
      limit 1`;

    if (memberRows.length) {
      const m = memberRows[0];
      if (m.estado === 'revocado') throw new SamlValidationError('miembro_revocado');
      if (m.estado === 'invitado') {
        const usage = await reserveUsage(conn.orgId, 'usuario', 1);
        if (!usage.ok || !usage.id) throw new SamlValidationError('limite_de_asientos');
        try {
          await sql`
            update org_members set user_id = ${userId}, estado = 'activo', joined_at = now(),
              token = null, token_expires_at = null, rol = ${rol},
              permisos = ${JSON.stringify(resolvedPermisos)}::jsonb, sso_managed = true, sso_connection_id = ${conn.id}
            where id = ${m.id}`;
        } catch (error) {
          await cancelUsage(conn.orgId, usage.id);
          throw error;
        }
        void flushUsageReservation(conn.orgId, usage.id);
      } else if (m.estado === 'activo' && m.sso_managed) {
        // Re-sincroniza SOLO si esta membresía está bajo control del IdP —
        // un admin que fijó el rol a mano (sso_managed=false) no se pisa.
        await sql`
          update org_members set rol = ${rol}, permisos = ${JSON.stringify(resolvedPermisos)}::jsonb, sso_connection_id = ${conn.id}
          where id = ${m.id}`;
      }
    } else {
      if (!conn.jitProvisioning) throw new SamlValidationError('no_es_miembro');
      // Un SSO ya configurado puede seguir autenticando miembros existentes
      // para evitar lockout, pero JIT es una capacidad Scale y no puede crear
      // asientos nuevos después de una baja o impago.
      const entitlement = await checkEntitlement(conn.orgId, 'sso');
      if (!entitlement.ok) throw new SamlValidationError('suscripcion_requerida');
      const usage = await reserveUsage(conn.orgId, 'usuario', 1);
      if (!usage.ok || !usage.id) throw new SamlValidationError('limite_de_asientos');
      try {
        await sql`
          insert into org_members (org_id, user_id, email, rol, permisos, estado, joined_at, sso_managed, sso_connection_id)
          values (${conn.orgId}, ${userId}, ${email}, ${rol}, ${JSON.stringify(resolvedPermisos)}::jsonb, 'activo', now(), true, ${conn.id})`;
      } catch (error) {
        await cancelUsage(conn.orgId, usage.id);
        throw error;
      }
      void flushUsageReservation(conn.orgId, usage.id);
    }
  }

  await sql`update sso_connections set last_login_at = now() where id = ${conn.id}`;

  const [totpRow] = await sql`select totp_enabled from users where id = ${userId} limit 1`;
  const needs2fa = !!totpRow?.totp_enabled;

  // Solo cuenta nueva de verdad — nunca en un login/link de una cuenta ya existente.
  if (isNewUser && posthogServer) {
    posthogServer.capture({ distinctId: userId, event: 'sign_up_completed', properties: { sign_up_method: 'saml' } });
    await posthogServer.flush();
  }
  await trackServer('sso_login', conn.orgId, { provider: conn.proveedor }, !!orgRow.is_sandbox, !!orgRow.is_demo);

  return { userId, isNewUser, needs2fa };
}

// ── Exigir SSO — enforcement ────────────────────────────────────────────────
// Consultado desde CADA punto de entrada que puede minutear una sesión de
// contraseña o de un proveedor social (login, google/callback, apple/callback,
// reset-password/confirm, passkeys/verify) — NUNCA desde el middleware/
// getAppGates, que es una verificación por PÁGINA y correría en cada request
// de /app/* para una condición que solo puede cambiar al iniciar sesión.

export interface SsoRequirement {
  blocked: boolean;
  connectionId?: string;
  orgNombre?: string;
}

/**
 * ¿Este usuario debe entrar por SSO en vez de por el método que está
 * intentando? `blocked=true` cuando pertenece a una org con `require_sso`
 * activo, NO es el owner de esa org (el owner conserva password siempre —
 * es el escape principal), y no hay una ventana de break-glass vigente.
 */
export async function ssoRequirementFor(userId: string): Promise<SsoRequirement> {
  const rows = await sql`
    select o.id as org_id, o.nombre, o.owner_id, o.sso_breakglass_until, c.id as connection_id
    from org_members m
    join orgs o on o.id = m.org_id and o.sandbox_of is null and o.require_sso = true
      and cord_effective_plan(o.id) in ('scale', 'developer')
    left join sso_connections c on c.org_id = o.id and c.enabled = true
    where m.user_id = ${userId} and m.estado = 'activo'
    order by c.created_at asc
    limit 1`;
  if (!rows.length) return { blocked: false };
  const r = rows[0] as any;
  if (r.owner_id === userId) return { blocked: false };
  if (r.sso_breakglass_until && new Date(r.sso_breakglass_until) > new Date()) return { blocked: false };
  return { blocked: true, connectionId: r.connection_id ?? undefined, orgNombre: r.nombre };
}

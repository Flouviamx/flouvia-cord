const PROTECTED_COLUMNS = new Set([
  'password_hash', 'totp_secret', 'totp_secret_enc', 'totp_backup_codes', 'hash',
  'secret', 'secret_enc', 'secret_prev', 'secret_prev_enc',
  'stripe_person_id',
  'public_key', 'token', 'verify_token', 'relay_state', 'idp_certs', 'facturapi_live_key',
  'banco_clabe', 'request_body', 'response_body', 'payload', 'captured', 'provider_data',
  'fiscal_metadata', 'stripe_requirements', 'integraciones',
]);

const PROTECTED_IDS = new Set([
  'sessions', 'ops_sessions', 'ops_auth_challenges', 'ops_passkey_challenges', 'password_reset_tokens',
  'email_verification_tokens', 'two_factor_challenges', 'saml_auth_requests',
  'saml_assertion_replay', 'sso_handoffs', 'mcp_idempotency',
]);

export function isProtectedDatabaseValue(table: string, column: string): boolean {
  const sensitiveName = /(password|secret|(^|_)token($|_)|private|public_key|backup_codes|certs?|clabe|captured|request_body|response_body|payload|auth_token)/i.test(column);
  return PROTECTED_COLUMNS.has(column) || sensitiveName || (column === 'id' && PROTECTED_IDS.has(table));
}

export function databaseCategory(table: string): string {
  if (/^(users|sessions|passkeys|oauth_|password_|email_|two_factor|ops_|sso_|saml_)/.test(table)) return 'Identidad y seguridad';
  if (/^(orgs|org_members|clientes|productos|kits|kit_items|tareas)/.test(table)) return 'Negocio';
  if (/^(cotizacion|eventos|plantillas|promesas|planes_pago|intereses)/.test(table)) return 'Cierre comercial';
  if (/^(stripe|documentos_fiscales|facturas|identity_capture)/.test(table)) return 'Pagos y fiscal';
  if (/^(api_|webhook|mcp_)/.test(table)) return 'Plataforma y APIs';
  if (/^(agentes|cobranza|uso_periodo)/.test(table)) return 'Automatización';
  return 'Operación interna';
}

export function formatDatabaseValue(table: string, column: string, value: unknown): { text: string; redacted: boolean } {
  if (isProtectedDatabaseValue(table, column)) return { text: 'Protegido', redacted: true };
  if (value === null || value === undefined) return { text: 'null', redacted: false };
  if (typeof value === 'boolean') return { text: value ? 'true' : 'false', redacted: false };
  if (value instanceof Date) return { text: value.toISOString(), redacted: false };
  if (typeof value === 'object') return { text: JSON.stringify(value), redacted: false };
  return { text: String(value), redacted: false };
}

interface DatabaseColumn {
  column_name: string;
  data_type: string;
}

const SEARCH_PRIORITY = ['id', 'email', 'nombre', 'empresa', 'folio', 'sku', 'status', 'provider', 'action', 'ruta', 'url'];

export function databaseSearchColumns(table: string, columns: DatabaseColumn[]): DatabaseColumn[] {
  const safe = columns.filter((column) => !isProtectedDatabaseValue(table, column.column_name));
  const ranked = [...safe].sort((a, b) => {
    const aRank = SEARCH_PRIORITY.indexOf(a.column_name);
    const bRank = SEARCH_PRIORITY.indexOf(b.column_name);
    return (aRank < 0 ? 999 : aRank) - (bRank < 0 ? 999 : bRank);
  });
  const preferred = ranked.filter((column) => SEARCH_PRIORITY.includes(column.column_name));
  if (preferred.length) return preferred.slice(0, 6);
  return ranked.filter((column) => ['text', 'uuid', 'character varying'].includes(column.data_type)).slice(0, 3);
}

type DatabaseCursor = { order: unknown; tie?: unknown };

export function encodeDatabaseCursor(cursor: DatabaseCursor): string {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
}

export function decodeDatabaseCursor(value: string | null): DatabaseCursor | null {
  if (!value || value.length > 700) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
    if (!parsed || typeof parsed !== 'object' || !Object.prototype.hasOwnProperty.call(parsed, 'order')) return null;
    return parsed as DatabaseCursor;
  } catch {
    return null;
  }
}

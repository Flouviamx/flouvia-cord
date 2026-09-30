export const opsDate = (value: unknown, empty = 'Sin actividad') => value
  ? new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Mexico_City' }).format(new Date(value as string))
  : empty;

export const opsNumber = (value: unknown) => new Intl.NumberFormat('es-MX').format(Number(value || 0));

export const OPS_AUDIT_LABELS: Record<string, string> = {
  'ops.login': 'Inicio de sesión',
  'ops.logout': 'Cierre de sesión',
  'ops.login_password': 'Verificación de contraseña',
  'ops.login_totp': 'Verificación TOTP',
  'ops.login_passkey': 'Verificación de clave de acceso',
  'ops.session_user_agent_mismatch': 'Sesión revocada por dispositivo',
  'ops.user_sessions_revoked': 'Sesiones de usuario revocadas',
  'ops.user_unlocked': 'Cuenta desbloqueada',
  'ops.user_suspended': 'Cuenta suspendida',
  'ops.user_restored': 'Cuenta restaurada',
  'ops.user_deleted': 'Usuario eliminado',
  'ops.organization_api_keys_revoked': 'Llaves API revocadas',
  'ops.organization_webhooks_disabled': 'Webhooks desactivados',
  'ops.organization_sessions_revoked': 'Sesiones de organización revocadas',
  'ops.organization_deleted': 'Organización eliminada',
  'ops.database_table_viewed': 'Tabla consultada',
  'ops.privileged_session_revoked': 'Sesión Ops revocada',
  'ops.status_incident_created': 'Incidente público creado',
  'ops.status_incident_updated': 'Incidente público actualizado',
  'ops.status_incident_status_changed': 'Estado de incidente actualizado',
};

/** Importe con SU divisa (regla 21). Sin divisa no se inventa un símbolo. */
export function opsMoney(value: unknown, currency: unknown, compact = false): string {
  const amount = Number(value || 0);
  const code = typeof currency === 'string' && /^[A-Z]{3}$/i.test(currency) ? currency.toUpperCase() : null;
  if (!code) return new Intl.NumberFormat('es-MX', { maximumFractionDigits: 2 }).format(amount);
  try {
    const formatted = new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency: code,
      currencyDisplay: 'narrowSymbol',
      notation: compact ? 'compact' : 'standard',
      maximumFractionDigits: compact ? 1 : 2,
    }).format(amount);
    // "$" lo usan MXN, USD, CLP, COP, ARS, CAD…: sin el código no se sabe cuál es.
    return formatted.includes('$') ? `${formatted} ${code}` : formatted;
  } catch {
    return `${new Intl.NumberFormat('es-MX').format(amount)} ${code}`;
  }
}

/** "hace 5 min", "hace 3 h", "ayer"; con la fecha completa como respaldo. */
export function opsAgo(value: unknown, empty = 'Sin actividad'): string {
  if (!value) return empty;
  const date = new Date(value as string);
  const diff = Date.now() - date.getTime();
  if (!Number.isFinite(diff)) return empty;
  if (diff < 0) return opsDate(value, empty);
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return 'Hace un momento';
  if (minutes < 60) return `Hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Hace ${hours} h`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'Ayer';
  if (days < 7) return `Hace ${days} días`;
  return new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeZone: 'America/Mexico_City' }).format(date);
}

export const opsPct = (part: unknown, whole: unknown) => {
  const total = Number(whole || 0);
  return total > 0 ? Math.round((Number(part || 0) / total) * 100) : 0;
};

export type OpsEventKind = 'quote' | 'invoice' | 'payment' | 'alert' | 'catalog' | 'system';

/** Qué hizo alguien, en una frase. La clave es `domain_events.type`. */
export const OPS_EVENT_LABELS: Record<string, [string, OpsEventKind]> = {
  'quote.created': ['creó la cotización', 'quote'],
  'quote.sent': ['envió la cotización', 'quote'],
  'quote.viewed': ['abrió la cotización', 'quote'],
  'quote.approved': ['aprobó la cotización', 'payment'],
  'quote.rejected': ['rechazó la cotización', 'alert'],
  'quote.updated': ['editó la cotización', 'quote'],
  'quote.expired': ['venció la cotización', 'alert'],
  'quote.deleted': ['eliminó la cotización', 'alert'],
  'quote.paid': ['registró el pago de la cotización', 'payment'],
  'quote.approval_requested': ['pidió aprobación interna de', 'quote'],
  'quote.approval_decided': ['resolvió la aprobación interna de', 'quote'],
  'quote.comment_added': ['comentó en la cotización', 'quote'],
  'quote.expiring': ['está por vencer la cotización', 'system'],
  'payment.partial': ['registró un abono en', 'payment'],
  'payment.failed': ['tuvo un pago fallido en', 'alert'],
  'invoice.issued': ['emitió la factura de', 'invoice'],
  'invoice.stamped': ['timbró la factura de', 'invoice'],
  'invoice.finalized': ['emitió la factura', 'invoice'],
  'invoice.sent': ['envió la factura', 'invoice'],
  'invoice.paid': ['registró el pago de la factura', 'payment'],
  'invoice.payment_failed': ['tuvo un pago fallido en la factura', 'alert'],
  'invoice.voided': ['anuló la factura', 'alert'],
  'invoice.marked_uncollectible': ['marcó como incobrable la factura', 'alert'],
  'invoice.overdue': ['venció la factura', 'alert'],
  'invoice.due_soon': ['está por vencer la factura', 'system'],
  'invoice.past_due': ['sigue vencida la factura', 'alert'],
  'client.created': ['agregó un cliente', 'catalog'],
  'client.updated': ['editó un cliente', 'catalog'],
  'client.deleted': ['eliminó un cliente', 'catalog'],
  'product.created': ['agregó un producto', 'catalog'],
  'product.updated': ['editó un producto', 'catalog'],
  'product.deleted': ['eliminó un producto', 'catalog'],
  'task.created': ['creó una tarea de cobranza', 'system'],
  'task.completed': ['completó una tarea de cobranza', 'system'],
  'promise.created': ['registró una promesa de pago', 'payment'],
  'promise.kept': ['cumplió una promesa de pago', 'payment'],
  'promise.broken': ['incumplió una promesa de pago', 'alert'],
  'dispute.created': ['recibió un contracargo', 'alert'],
  'dispute.closed': ['cerró un contracargo', 'payment'],
  'refund.succeeded': ['emitió un reembolso', 'payment'],
  'refund.failed': ['tuvo un reembolso fallido', 'alert'],
  'payout.paid': ['recibió un depósito', 'payment'],
  'payout.failed': ['tuvo un depósito fallido', 'alert'],
  'account.updated': ['actualizó su cuenta de cobros', 'system'],
};

export function opsEventLabel(type: string): [string, OpsEventKind] {
  return OPS_EVENT_LABELS[type] ?? [type.replace('.', ' · ').replace(/_/g, ' '), 'system'];
}

/** Quién lo hizo. `domain_events.actor` es `user:<uuid>`, `api:…`, `client`… */
export function opsActorLabel(actor: string, userName?: string | null): string {
  if (actor.startsWith('user:')) return userName || 'Un miembro del equipo';
  if (actor.startsWith('api')) return 'La API';
  if (actor.startsWith('mcp')) return 'Un agente vía MCP';
  if (actor.startsWith('workflow')) return 'Un workflow';
  if (actor.startsWith('system')) return 'Cord';
  if (actor === 'client' || actor === 'public' || actor.startsWith('client')) return 'El cliente';
  if (actor === 'onboarding') return 'El onboarding';
  const [name] = actor.split(':');
  return name.charAt(0).toUpperCase() + name.slice(1);
}

export const OPS_EVENT_CATEGORIES = [
  { id: '', label: 'Todo' },
  { id: 'quotes', label: 'Cotizaciones' },
  { id: 'invoices', label: 'Facturas' },
  { id: 'payments', label: 'Pagos' },
  { id: 'catalog', label: 'Clientes y catálogo' },
  { id: 'collections', label: 'Cobranza' },
] as const;

export const OPS_PROVIDER_LABELS: Record<string, string> = {
  hubspot: 'HubSpot', shopify: 'Shopify', google_sheets: 'Google Sheets', excel: 'Excel',
  quickbooks: 'QuickBooks', xero: 'Xero', gmail: 'Gmail', slack: 'Slack', teams: 'Microsoft Teams',
  mercadopago: 'Mercado Pago',
};

export const OPS_PROVIDER_DOMAINS: Record<string, string> = {
  hubspot: 'hubspot.com', shopify: 'shopify.com', google_sheets: 'sheets.google.com', excel: 'microsoft.com',
  quickbooks: 'quickbooks.intuit.com', xero: 'xero.com', gmail: 'mail.google.com', slack: 'slack.com',
  teams: 'teams.microsoft.com', mercadopago: 'mercadopago.com',
};

export const opsFavicon = (domain: string) =>
  `https://t3.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=http://${domain}&size=64`;

export const OPS_LIFECYCLE_LABELS: Record<string, [string, string]> = {
  draft: ['Borrador', ''],
  open: ['Por cobrar', 'blue'],
  paid: ['Pagada', 'green'],
  void: ['Anulada', ''],
  uncollectible: ['Incobrable', 'red'],
  issued: ['Emitida', 'blue'],
};

export const OPS_QUOTE_STATUS: Record<string, [string, string]> = {
  draft: ['Borrador', ''], sent: ['Enviada', 'blue'], viewed: ['Vista', 'blue'], approved: ['Aprobada', 'green'],
  paid: ['Pagada', 'green'], invoiced: ['Facturada', 'navy'], rejected: ['Rechazada', 'red'], expired: ['Vencida', 'amber'],
};

export const OPS_RUN_STATUS: Record<string, [string, string]> = {
  queued: ['En cola', ''], running: ['Ejecutando', 'blue'], waiting: ['En espera', 'amber'],
  succeeded: ['Correcta', 'green'], failed: ['Falló', 'red'], canceled: ['Cancelada', ''],
};

export const OPS_SUBSCRIPTION: Record<string, string> = {
  active: 'Activa', trialing: 'En prueba', past_due: 'Pago atrasado', canceled: 'Cancelada',
  unpaid: 'Sin pagar', incomplete: 'Incompleta', incomplete_expired: 'Expirada', paused: 'Pausada',
};
export const opsSubscription = (value: unknown) => value ? OPS_SUBSCRIPTION[String(value)] ?? String(value) : 'Sin suscripción';

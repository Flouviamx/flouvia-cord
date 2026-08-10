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
};

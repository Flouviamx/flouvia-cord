// Alertas configurables de Cord Ops. Catálogo CERRADO de métricas: una regla
// solo puede encender, apagar o mover el umbral de una métrica de esta lista;
// nunca escribir SQL ni elegir una tabla. Las métricas salen de
// `cord_ops_alert_metrics()` (agregados, security definer) y la de crons del
// monitor de crons, así que la pantalla y el cron que avisa leen lo mismo.
import { sql } from './db';

export interface OpsAlertMetric {
  id: string;
  label: string;
  /** Qué significa el número, en una frase. */
  description: string;
  unit: 'count' | 'pct';
  defaultThreshold: number;
  href: string;
}

export const OPS_ALERT_METRICS: OpsAlertMetric[] = [
  { id: 'crons_problem', label: 'Crons con problemas', description: 'Crons que fallaron, se colgaron o no corrieron en su periodo.', unit: 'count', defaultThreshold: 1, href: '/ops/crons' },
  { id: 'health_failing', label: 'Componentes caídos', description: 'Componentes cuya última sonda de disponibilidad falló.', unit: 'count', defaultThreshold: 1, href: '/ops/status' },
  { id: 'stripe_events_stuck', label: 'Eventos del procesador atorados', description: 'Avisos de Stripe sin procesar después de 15 minutos.', unit: 'count', defaultThreshold: 1, href: '/ops/webhooks' },
  { id: 'webhook_fail_pct_24h', label: 'Webhooks rechazados', description: 'Porcentaje de entregas a endpoints de negocios que fallaron en 24 h (desde 20 entregas).', unit: 'pct', defaultThreshold: 20, href: '/ops/webhooks' },
  { id: 'api_5xx_1h', label: 'Errores de la API', description: 'Respuestas 5xx de la API pública y MCP en la última hora.', unit: 'count', defaultThreshold: 20, href: '/ops/developers' },
  { id: 'workflow_failed_24h', label: 'Workflows fallidos', description: 'Ejecuciones de workflows que fallaron en 24 h.', unit: 'count', defaultThreshold: 10, href: '/ops/workflows' },
  { id: 'disputes_needs_response', label: 'Disputas sin responder', description: 'Contracargos que esperan evidencia del negocio.', unit: 'count', defaultThreshold: 1, href: '/ops/organizations' },
  { id: 'payouts_failed_7d', label: 'Depósitos fallidos', description: 'Depósitos a cuentas de negocios que fallaron en 7 días.', unit: 'count', defaultThreshold: 1, href: '/ops/organizations' },
  { id: 'integrations_error', label: 'Integraciones con error', description: 'Conexiones externas (QuickBooks, Shopify, hojas…) en estado de error.', unit: 'count', defaultThreshold: 3, href: '/ops/integrations' },
];
export const OPS_ALERT_IDS = new Set(OPS_ALERT_METRICS.map((m) => m.id));

export const opsAlertMetricValues = () => sql`select metric, value from cord_ops_alert_metrics()`;
export const opsAlertRules = () => sql`select metric, enabled, threshold, updated_by, updated_at from ops_alert_rules`;
export const opsAlertStates = () => sql`select metric, firing, value, since, notified_at, checked_at from ops_alert_state`;

export interface OpsAlertRow {
  metric: OpsAlertMetric;
  value: number | null;
  enabled: boolean;
  threshold: number;
  firing: boolean;
  since: Date | null;
  /** Qué cambió respecto al estado guardado: avisar solo en las transiciones. */
  transition: 'fired' | 'resolved' | null;
  updatedBy: string | null;
}

/**
 * Evalúa todas las métricas del catálogo. Sin regla guardada vale el umbral
 * por defecto y está encendida. Una métrica sin valor (la función no la
 * devolvió) nunca dispara: no se inventa un problema por falta de dato.
 */
export function evaluateOpsAlerts(
  values: Map<string, number>,
  rules: { metric: string; enabled: boolean; threshold: number | string; updated_by?: string | null }[],
  states: { metric: string; firing: boolean; since: string | Date | null }[],
  now = new Date(),
): OpsAlertRow[] {
  return OPS_ALERT_METRICS.map((metric) => {
    const rule = rules.find((r) => r.metric === metric.id);
    const state = states.find((s) => s.metric === metric.id);
    const enabled = rule ? !!rule.enabled : true;
    const threshold = rule ? Number(rule.threshold) : metric.defaultThreshold;
    const value = values.has(metric.id) ? Number(values.get(metric.id)) : null;
    const firing = enabled && value !== null && value >= threshold;
    const was = !!state?.firing;
    return {
      metric, value, enabled, threshold, firing,
      since: firing ? (was && state?.since ? new Date(state.since) : now) : null,
      transition: firing && !was ? 'fired' : !firing && was ? 'resolved' : null,
      updatedBy: rule?.updated_by ?? null,
    };
  });
}

export const opsAlertValue = (m: OpsAlertMetric, v: number | null) =>
  v === null ? '—' : m.unit === 'pct' ? `${v}%` : new Intl.NumberFormat('es-MX').format(v);

/** Valida un umbral que manda el formulario: número finito, no negativo, acotado. */
export function parseOpsThreshold(metric: OpsAlertMetric, raw: unknown): number | null {
  const n = typeof raw === 'number' ? raw : Number(String(raw ?? '').replace(',', '.'));
  if (!Number.isFinite(n) || n < 0) return null;
  if (metric.unit === 'pct' && n > 100) return null;
  if (n > 1_000_000) return null;
  return Math.round(n * 10) / 10;
}

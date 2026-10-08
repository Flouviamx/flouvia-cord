// Inspector de webhooks de Ops: entregas a los endpoints de los negocios, la
// cola de reintentos y los eventos que Cord recibe del procesador de pagos.
// Constructores `sql` para withOpsTx. Nunca se leen cuerpos de request ni de
// respuesta, payloads ni secretos: Ops diagnostica con el código, el error y
// los tiempos, y re-entrega con la misma función que usa la app.
import { sql } from './db';

export const OPS_DELIVERY_FILTERS = [
  { id: 'failed', label: 'Fallidas' },
  { id: 'all', label: 'Todas' },
  { id: 'ok', label: 'Exitosas' },
] as const;
export type OpsDeliveryFilter = (typeof OPS_DELIVERY_FILTERS)[number]['id'];
export const parseDeliveryFilter = (value: unknown): OpsDeliveryFilter =>
  OPS_DELIVERY_FILTERS.some((f) => f.id === value) ? value as OpsDeliveryFilter : 'failed';

/** Panorama de las últimas 24 horas y de lo que sigue pendiente. Sin entregas de prueba. */
export const opsWebhookStats = () => sql`
  select
    (select count(*)::int from webhook_deliveries where created_at >= now() - interval '24 hours' and not es_prueba) deliveries_24h,
    (select count(*)::int from webhook_deliveries where created_at >= now() - interval '24 hours' and not es_prueba and not ok) failed_24h,
    (select percentile_cont(0.95) within group (order by duracion_ms)::int from webhook_deliveries
      where created_at >= now() - interval '24 hours' and not es_prueba and duracion_ms is not null) p95_ms,
    (select count(*)::int from webhook_events where estado in ('pending', 'delivering')) outbox_pending,
    (select count(*)::int from webhook_events where estado = 'failed' and created_at >= now() - interval '7 days') outbox_failed_7d,
    (select count(*)::int from webhooks where activo) endpoints_active,
    (select count(*)::int from webhooks where not activo and deshabilitado_at is not null) endpoints_disabled,
    (select count(*)::int from stripe_events where processed_at is null and received_at < now() - interval '5 minutes'
       and received_at >= now() - interval '7 days') stripe_stuck,
    (select count(*)::int from stripe_events where last_error is not null and received_at >= now() - interval '7 days') stripe_errors_7d`;

/** Endpoints con fallos seguidos o apagados por la racha: lo primero que se revisa. */
export const opsFailingEndpoints = (limit = 12) => sql`
  select w.id, w.org_id, o.nombre org_nombre, w.url, w.activo, w.last_status, w.last_error,
         w.last_delivery_at, w.fallos_consecutivos, w.deshabilitado_at
  from webhooks w join orgs o on o.id = w.org_id
  where (w.activo and w.fallos_consecutivos > 0) or (not w.activo and w.deshabilitado_at is not null)
  order by w.activo asc, w.fallos_consecutivos desc, w.last_delivery_at desc nulls last
  limit ${limit}`;

/** Intentos de entrega, del más reciente al más viejo. `total_count` es del filtro completo. */
export const opsDeliveryPage = (filter: OpsDeliveryFilter, orgId: string | null, limit: number, offset: number) => sql`
  select d.id, d.org_id, o.nombre org_nombre, d.webhook_id, w.url, d.evento, d.status, d.ok, d.error,
         d.intento, d.duracion_ms, d.es_prueba, d.created_at,
         -- ¿Queda con qué re-entregar? Se pregunta si existe, nunca se lee el cuerpo.
         (d.request_body is not null or exists(select 1 from webhook_events e where e.id = d.message_id and e.org_id = d.org_id)) replayable,
         count(*) over()::int total_count
  from webhook_deliveries d
  join webhooks w on w.id = d.webhook_id
  join orgs o on o.id = d.org_id
  where (${orgId}::uuid is null or d.org_id = ${orgId}::uuid)
    and (${filter} = 'all' or (${filter} = 'failed' and not d.ok) or (${filter} = 'ok' and d.ok))
  order by d.created_at desc
  limit ${limit} offset ${offset}`;

/** Mensajes que agotaron sus reintentos (MAX_ATTEMPTS) en la última semana. */
export const opsOutboxFailed = (limit = 10, orgId: string | null = null) => sql`
  select e.id, e.org_id, o.nombre org_nombre, w.url, e.evento, e.intentos, e.last_status, e.last_error, e.created_at, e.updated_at
  from webhook_events e
  join webhooks w on w.id = e.webhook_id
  join orgs o on o.id = e.org_id
  where e.estado = 'failed' and e.created_at >= now() - interval '7 days'
    and (${orgId}::uuid is null or e.org_id = ${orgId}::uuid)
  order by e.updated_at desc
  limit ${limit}`;

/**
 * Eventos del procesador que Cord recibió y no terminó de procesar, o que
 * fallaron alguna vez. `stripe_events` no tiene org_id ni RLS: es la bandeja
 * de entrada del webhook de la plataforma.
 */
export const opsStripeEvents = (limit = 12) => sql`
  select id, type, received_at, claimed_at, processed_at, attempt_count, last_error
  from stripe_events
  where received_at >= now() - interval '7 days'
    and (last_error is not null or (processed_at is null and received_at < now() - interval '5 minutes'))
  order by received_at desc
  limit ${limit}`;

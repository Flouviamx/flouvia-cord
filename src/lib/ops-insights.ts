import { sql } from './db';

// Lecturas cross-org de Cord Ops. Cada función devuelve una plantilla `sql`
// SIN ejecutar: el llamador las pasa a withOpsTx() (regla 30), que enciende
// app.scope='ops' en la misma transacción. Las políticas `ops_*` de solo
// lectura están en db/migrations/2026-09-30-ops-lectura.sql.
//
// Días en la zona de la operación (la misma de opsDate), no en UTC: si no, la
// barra de "hoy" se corta a las 18:00 de Ciudad de México.
const TZ = 'America/Mexico_City';

export const OPS_FEED_PAGE = 40;

type FeedFilter = {
  orgId?: string | null;
  userId?: string | null;
  category?: string;
  limit?: number;
  offset?: number;
};

/** Actividad de las organizaciones: lo que hicieron personas, clientes y sistema. */
export function opsEventFeed({ orgId = null, userId = null, category = '', limit = OPS_FEED_PAGE, offset = 0 }: FeedFilter) {
  const actor = userId ? `user:${userId}` : null;
  return sql`
    select e.id, e.type, e.object, e.object_id, e.actor, e.created_at, e.org_id,
           o.nombre as org_nombre,
           u.id as user_id,
           coalesce(nullif(trim(concat_ws(' ', u.first_name, u.last_name)), ''), u.email) as user_name,
           q.folio as quote_folio,
           coalesce(d.invoice_number, d.id::text) as invoice_number,
           coalesce(c.empresa, p.nombre) as subject_name
    from domain_events e
    join orgs o on o.id = e.org_id
    left join users u on e.actor ~ '^user:[0-9a-f-]{36}$'
      and u.id = (case when e.actor ~ '^user:[0-9a-f-]{36}$' then substr(e.actor, 6)::uuid end)
    left join cotizaciones q on e.object = 'quote' and q.id = e.object_id
    left join documentos_fiscales d on e.object = 'invoice' and d.id = e.object_id
    left join clientes c on e.object = 'client' and c.id = e.object_id
    left join productos p on e.object = 'product' and p.id = e.object_id
    where (${orgId}::uuid is null or e.org_id = ${orgId}::uuid)
      and (${actor}::text is null or e.actor = ${actor}::text)
      and (${category} = ''
        or (${category} = 'quotes' and e.type like 'quote.%' and e.type <> 'quote.paid')
        or (${category} = 'invoices' and e.type like 'invoice.%' and e.type <> 'invoice.paid')
        or (${category} = 'payments' and (e.type in ('quote.paid', 'invoice.paid') or e.type like 'payment.%'
             or e.type like 'refund.%' or e.type like 'payout.%' or e.type like 'dispute.%'))
        or (${category} = 'catalog' and (e.type like 'client.%' or e.type like 'product.%'))
        or (${category} = 'collections' and (e.type like 'task.%' or e.type like 'promise.%')))
    order by e.created_at desc, e.id desc
    limit ${limit + 1} offset ${offset}`;
}

/** Serie diaria de 30 días: altas, cotizaciones y eventos. */
export function opsDailySeries(days = 30) {
  return sql`
    with span as (
      select generate_series((now() at time zone ${TZ})::date - ${days - 1}::int,
                             (now() at time zone ${TZ})::date, interval '1 day')::date as d
    ),
    ev as (select (created_at at time zone ${TZ})::date d, count(*)::int n from domain_events
           where created_at >= now() - make_interval(days => ${days + 1}) group by 1),
    us as (select (created_at at time zone ${TZ})::date d, count(*)::int n from users
           where created_at >= now() - make_interval(days => ${days + 1}) group by 1),
    qu as (select (created_at at time zone ${TZ})::date d, count(*)::int n from cotizaciones
           where created_at >= now() - make_interval(days => ${days + 1}) group by 1),
    se as (select (last_used_at at time zone ${TZ})::date d, count(distinct user_id)::int n from sessions
           where last_used_at >= now() - make_interval(days => ${days + 1}) group by 1)
    select to_char(span.d, 'YYYY-MM-DD') as day,
           coalesce(ev.n, 0) as events, coalesce(us.n, 0) as signups,
           coalesce(qu.n, 0) as quotes, coalesce(se.n, 0) as active_users
    from span
    left join ev on ev.d = span.d left join us on us.d = span.d
    left join qu on qu.d = span.d left join se on se.d = span.d
    order by span.d`;
}

export function opsOverviewStats() {
  return sql`
    select
      (select count(*)::int from users) users,
      (select count(*)::int from users where created_at >= now() - interval '7 days') users_7d,
      (select count(*)::int from users where created_at >= now() - interval '14 days' and created_at < now() - interval '7 days') users_prev_7d,
      (select count(distinct user_id)::int from sessions where last_used_at >= now() - interval '24 hours') active_users_24h,
      (select count(distinct user_id)::int from sessions where last_used_at >= now() - interval '7 days') active_users_7d,
      (select count(*)::int from users where suspended_at is not null) suspended,
      (select count(*)::int from users where locked_until > now()) locked,
      (select count(*)::int from orgs) orgs,
      (select count(*)::int from orgs where created_at >= now() - interval '30 days') orgs_30d,
      (select count(*)::int from orgs where coalesce(plan, 'free') <> 'free' and subscription_status in ('active', 'trialing', 'past_due')) paying_orgs,
      (select count(distinct org_id)::int from domain_events where created_at >= now() - interval '7 days') active_orgs_7d,
      (select count(*)::int from cotizaciones where created_at >= now() - interval '30 days') quotes_30d,
      (select count(*)::int from cotizaciones where sent_at >= now() - interval '30 days') sent_30d,
      (select count(*)::int from cotizaciones where approved_at >= now() - interval '30 days') approved_30d,
      (select count(*)::int from documentos_fiscales where created_at >= now() - interval '30 days' and lifecycle <> 'draft') invoices_30d,
      (select count(*)::int from documentos_fiscales where lifecycle = 'open') invoices_open,
      (select count(*)::int from documentos_fiscales where lifecycle = 'open' and due_date < current_date) invoices_overdue,
      (select count(*)::int from documentos_fiscales where status = 'error') invoices_error,
      ((select count(*)::int from cotizacion_cobros where status = 'pagado' and paid_at >= now() - interval '30 days')
        + (select count(*)::int from documento_pagos where cobro_id is null and aplicado_at >= now() - interval '30 days')) payments_30d,
      (select count(*)::int from domain_events where type in ('payment.failed', 'invoice.payment_failed') and created_at >= now() - interval '7 days') payment_failures_7d,
      (select count(*)::int from workflows where estado = 'active') workflows_active,
      (select count(*)::int from workflow_runs where created_at >= now() - interval '24 hours') runs_24h,
      (select count(*)::int from workflow_runs where status = 'failed' and created_at >= now() - interval '24 hours') runs_failed_24h,
      (select count(*)::int from integracion_conexiones where estado <> 'desconectada') integrations,
      (select count(*)::int from integracion_conexiones where estado = 'error') integrations_error,
      (select count(*)::int from domain_events where created_at >= now() - interval '24 hours') events_24h,
      (select count(*)::int from sessions where revoked_at is null and expires_at > now()) sessions`;
}

/** Dinero cobrado por divisa (regla 21: nunca se suman divisas distintas). */
export function opsCollectedByCurrency(days = 30, orgId: string | null = null) {
  return sql`
    select currency, sum(amount)::numeric as total, count(*)::int as payments
    from (
      select coalesce(q.moneda, o.moneda) as currency, c.monto as amount
      from cotizacion_cobros c
      join cotizaciones q on q.id = c.cotizacion_id
      join orgs o on o.id = c.org_id
      where c.status = 'pagado' and c.paid_at >= now() - make_interval(days => ${days})
        and (${orgId}::uuid is null or c.org_id = ${orgId}::uuid)
      union all
      -- Un abono que nació de un cobro de cotización ya se contó arriba.
      select p.currency, p.monto
      from documento_pagos p
      where p.cobro_id is null and p.aplicado_at >= now() - make_interval(days => ${days})
        and (${orgId}::uuid is null or p.org_id = ${orgId}::uuid)
    ) x
    where currency is not null
    group by currency
    order by count(*) desc, currency
    limit 8`;
}

export function opsTopEventTypes(days = 7, orgId: string | null = null) {
  return sql`
    select type, count(*)::int n from domain_events
    where created_at >= now() - make_interval(days => ${days})
      and (${orgId}::uuid is null or org_id = ${orgId}::uuid)
    group by type order by n desc, type limit 8`;
}

export function opsTopOrgs(days = 7) {
  return sql`
    select o.id, o.nombre, coalesce(o.plan, 'free') plan, count(*)::int n,
           count(distinct e.actor) filter (where e.actor like 'user:%')::int people
    from domain_events e join orgs o on o.id = e.org_id
    where e.created_at >= now() - make_interval(days => ${days})
    group by o.id, o.nombre, o.plan order by n desc limit 8`;
}

export function opsTopUsers(days = 7) {
  return sql`
    select u.id, u.email, coalesce(nullif(trim(concat_ws(' ', u.first_name, u.last_name)), ''), u.email) as name,
           count(*)::int n, max(e.created_at) last_at
    from domain_events e
    join users u on e.actor ~ '^user:[0-9a-f-]{36}$'
      and u.id = (case when e.actor ~ '^user:[0-9a-f-]{36}$' then substr(e.actor, 6)::uuid end)
    where e.created_at >= now() - make_interval(days => ${days})
    group by u.id order by n desc limit 8`;
}

export function opsActivityStats() {
  return sql`
    select
      (select count(*)::int from domain_events where created_at >= now() - interval '24 hours') events_24h,
      (select count(*)::int from domain_events where created_at >= now() - interval '7 days') events_7d,
      (select count(*)::int from domain_events where created_at >= now() - interval '14 days' and created_at < now() - interval '7 days') events_prev_7d,
      (select count(distinct org_id)::int from domain_events where created_at >= now() - interval '7 days') orgs_7d,
      (select count(distinct actor)::int from domain_events where actor like 'user:%' and created_at >= now() - interval '7 days') people_7d,
      (select count(*)::int from domain_events where actor in ('client', 'public') and created_at >= now() - interval '7 days') client_7d,
      (select count(*)::int from sessions where created_at >= now() - interval '7 days') logins_7d`;
}

/** Inicios de sesión recientes (sesiones creadas), para ver quién entra. */
export function opsRecentLogins(limit = 12, userId: string | null = null) {
  return sql`
    select s.created_at, s.last_used_at, s.ip, s.user_agent, u.id user_id, u.email,
           coalesce(nullif(trim(concat_ws(' ', u.first_name, u.last_name)), ''), u.email) as name
    from sessions s join users u on u.id = s.user_id
    where (${userId}::uuid is null or s.user_id = ${userId}::uuid)
    order by s.created_at desc limit ${limit}`;
}

// ── Facturas ────────────────────────────────────────────────────────────

export const OPS_INVOICE_FILTERS = [
  { id: '', label: 'Todas' },
  { id: 'open', label: 'Por cobrar' },
  { id: 'overdue', label: 'Vencidas' },
  { id: 'paid', label: 'Pagadas' },
  { id: 'draft', label: 'Borradores' },
  { id: 'void', label: 'Anuladas' },
  { id: 'uncollectible', label: 'Incobrables' },
  { id: 'fiscal_error', label: 'Error fiscal' },
] as const;

export function opsInvoiceStats() {
  return sql`
    select
      count(*) filter (where lifecycle <> 'draft')::int issued,
      count(*) filter (where lifecycle <> 'draft' and created_at >= now() - interval '30 days')::int issued_30d,
      count(*) filter (where lifecycle = 'open')::int open,
      count(*) filter (where lifecycle = 'open' and due_date < current_date)::int overdue,
      count(*) filter (where lifecycle = 'paid')::int paid,
      count(*) filter (where lifecycle = 'draft')::int drafts,
      count(*) filter (where status = 'error')::int fiscal_errors,
      count(*) filter (where sent_at is not null)::int sent,
      count(*) filter (where sent_at is not null and first_viewed_at is not null)::int viewed,
      count(distinct org_id)::int orgs
    from documentos_fiscales`;
}

export function opsInvoiceCounts() {
  return sql`
    select coalesce(lifecycle, 'issued') lifecycle, count(*)::int n,
           count(*) filter (where lifecycle = 'open' and due_date < current_date)::int overdue,
           count(*) filter (where status = 'error')::int fiscal_errors
    from documentos_fiscales group by 1`;
}

export function opsOpenBalanceByCurrency() {
  return sql`
    select currency, sum(coalesce(amount_remaining, total, 0))::numeric total, count(*)::int n,
           sum(coalesce(amount_remaining, total, 0)) filter (where due_date < current_date)::numeric overdue
    from documentos_fiscales
    where lifecycle = 'open' and currency is not null
    group by currency order by n desc limit 8`;
}

export function opsInvoicePage(filter: string, query: string, limit: number, offset: number, orgId: string | null = null) {
  const like = `%${query}%`;
  return sql`
    select d.id, d.org_id, o.nombre org_nombre, d.invoice_number, d.document_type, d.provider, d.status,
           d.lifecycle, d.currency, d.total, d.amount_paid, d.amount_remaining, d.due_date, d.sent_at,
           d.first_viewed_at, d.issued_at, d.created_at, d.country_code,
           coalesce(c.empresa, d.recipient_snapshot->>'legal_name', d.recipient_snapshot->>'name') cliente,
           (d.lifecycle = 'open' and d.due_date < current_date) overdue,
           count(*) over()::int total_count
    from documentos_fiscales d
    join orgs o on o.id = d.org_id
    left join clientes c on c.id = d.cliente_id
    where (${orgId}::uuid is null or d.org_id = ${orgId}::uuid)
      and (${filter} = ''
        or (${filter} = 'overdue' and d.lifecycle = 'open' and d.due_date < current_date)
        or (${filter} = 'fiscal_error' and d.status = 'error')
        or d.lifecycle = ${filter})
      and (${query} = '' or lower(coalesce(d.invoice_number, '')) like lower(${like})
        or lower(o.nombre) like lower(${like}) or lower(coalesce(c.empresa, '')) like lower(${like}))
    order by coalesce(d.issued_at, d.created_at) desc, d.id desc
    limit ${limit} offset ${offset}`;
}

// ── Workflows ───────────────────────────────────────────────────────────

export function opsWorkflowStats() {
  return sql`
    select
      (select count(*)::int from workflows) total,
      (select count(*)::int from workflows where estado = 'active') active,
      (select count(*)::int from workflows where estado = 'paused') paused,
      (select count(*)::int from workflows where estado = 'draft') drafts,
      (select count(distinct org_id)::int from workflows where estado = 'active') orgs,
      (select count(*)::int from workflow_runs where created_at >= now() - interval '7 days') runs_7d,
      (select count(*)::int from workflow_runs where created_at >= now() - interval '24 hours') runs_24h,
      (select count(*)::int from workflow_runs where status = 'succeeded' and created_at >= now() - interval '7 days') ok_7d,
      (select count(*)::int from workflow_runs where status = 'failed' and created_at >= now() - interval '7 days') failed_7d,
      (select count(*)::int from workflow_runs where status in ('queued', 'running', 'waiting')) in_flight`;
}

export function opsWorkflowTriggers() {
  return sql`
    select coalesce(trigger_publicado, 'sin publicar') trigger, count(*)::int n
    from workflows where estado <> 'draft' group by 1 order by n desc limit 8`;
}

export function opsWorkflowPage(estado: string, query: string, limit: number, offset: number, orgId: string | null = null) {
  const like = `%${query}%`;
  return sql`
    with stats as (
      select workflow_id,
             count(*) filter (where created_at >= now() - interval '7 days')::int runs_7d,
             count(*) filter (where status = 'failed' and created_at >= now() - interval '7 days')::int failed_7d,
             count(*) filter (where status in ('queued', 'running', 'waiting'))::int in_flight,
             max(created_at) last_run
      from workflow_runs group by workflow_id
    )
    select w.id, w.org_id, o.nombre org_nombre, w.nombre, w.estado, w.trigger_publicado, w.version,
           w.updated_at, w.published_at, w.next_run_at,
           coalesce(s.runs_7d, 0) runs_7d, coalesce(s.failed_7d, 0) failed_7d,
           coalesce(s.in_flight, 0) in_flight, s.last_run,
           count(*) over()::int total_count
    from workflows w
    join orgs o on o.id = w.org_id
    left join stats s on s.workflow_id = w.id
    where (${orgId}::uuid is null or w.org_id = ${orgId}::uuid)
      and (${estado} = '' or w.estado = ${estado})
      and (${query} = '' or lower(w.nombre) like lower(${like}) or lower(o.nombre) like lower(${like}))
    order by (w.estado = 'active') desc, s.last_run desc nulls last, w.updated_at desc
    limit ${limit} offset ${offset}`;
}

export function opsWorkflowFailures(limit = 12, orgId: string | null = null) {
  return sql`
    select r.id, r.org_id, o.nombre org_nombre, w.nombre workflow, r.status, r.error, r.attempts,
           r.created_at, r.finished_at
    from workflow_runs r
    join workflows w on w.id = r.workflow_id
    join orgs o on o.id = r.org_id
    where r.status = 'failed' and (${orgId}::uuid is null or r.org_id = ${orgId}::uuid)
    order by r.created_at desc limit ${limit}`;
}

// ── Integraciones ───────────────────────────────────────────────────────

export function opsIntegrationProviders() {
  return sql`
    select proveedor,
           count(*) filter (where estado = 'activa')::int active,
           count(*) filter (where estado = 'error')::int errors,
           count(*) filter (where estado = 'desconectada')::int disconnected,
           max(ultima_sync_at) last_sync
    from integracion_conexiones group by proveedor order by active desc, proveedor`;
}

export function opsIntegrationStats() {
  return sql`
    select
      (select count(*)::int from integracion_conexiones where estado = 'activa') active,
      (select count(*)::int from integracion_conexiones where estado = 'error') errors,
      (select count(*)::int from integracion_conexiones where estado = 'desconectada') disconnected,
      (select count(distinct org_id)::int from integracion_conexiones where estado <> 'desconectada') orgs,
      (select count(*)::int from integracion_sync where created_at >= now() - interval '24 hours') syncs_24h,
      (select count(*)::int from integracion_sync where status = 'failed' and created_at >= now() - interval '24 hours') failed_24h,
      (select count(*)::int from integracion_sync where status in ('queued', 'running')) queued`;
}

/** Nunca selecciona los tokens cifrados: Ops ve el estado, no la credencial. */
export function opsIntegrationPage(provider: string, estado: string, limit: number, offset: number, orgId: string | null = null) {
  return sql`
    with sync as (
      select conexion_id,
             count(*) filter (where created_at >= now() - interval '7 days')::int syncs_7d,
             count(*) filter (where status = 'failed' and created_at >= now() - interval '7 days')::int failed_7d
      from integracion_sync group by conexion_id
    )
    select c.id, c.org_id, o.nombre org_nombre, c.proveedor, c.estado, c.cuenta_externa, c.cuenta_nombre,
           c.ultima_sync_at, c.ultimo_error, c.ultimo_error_at, c.created_at,
           coalesce(array_length(c.scopes, 1), 0) scopes,
           coalesce(s.syncs_7d, 0) syncs_7d, coalesce(s.failed_7d, 0) failed_7d,
           count(*) over()::int total_count
    from integracion_conexiones c
    join orgs o on o.id = c.org_id
    left join sync s on s.conexion_id = c.id
    where (${orgId}::uuid is null or c.org_id = ${orgId}::uuid)
      and (${provider} = '' or c.proveedor = ${provider})
      and (${estado} = '' or c.estado = ${estado})
    order by (c.estado = 'error') desc, c.ultima_sync_at desc nulls last, c.created_at desc
    limit ${limit} offset ${offset}`;
}

export function opsSyncFailures(limit = 12) {
  return sql`
    select s.id, s.org_id, o.nombre org_nombre, c.proveedor, s.direccion, s.objeto, s.error, s.attempts, s.created_at
    from integracion_sync s
    join integracion_conexiones c on c.id = s.conexion_id
    join orgs o on o.id = s.org_id
    where s.status = 'failed'
    order by s.created_at desc limit ${limit}`;
}

// ── Detalle de organización ─────────────────────────────────────────────

export function opsOrgCommerce(orgId: string) {
  return sql`
    select
      count(*)::int quotes,
      count(*) filter (where created_at >= now() - interval '30 days')::int quotes_30d,
      count(*) filter (where status in ('sent', 'viewed', 'approved', 'paid', 'invoiced', 'rejected', 'expired'))::int sent,
      count(*) filter (where status in ('approved', 'paid', 'invoiced'))::int won,
      count(*) filter (where status = 'rejected')::int lost,
      max(created_at) last_quote
    from cotizaciones where org_id = ${orgId}::uuid`;
}

/** Volumen cerrado por divisa: una cotización en USD no se suma a una en MXN. */
export function opsOrgClosedByCurrency(orgId: string) {
  return sql`
    select coalesce(q.moneda, o.moneda) currency, sum(q.total)::numeric total, count(*)::int n
    from cotizaciones q join orgs o on o.id = q.org_id
    where q.org_id = ${orgId}::uuid and q.status in ('approved', 'paid', 'invoiced')
    group by 1 order by n desc limit 6`;
}

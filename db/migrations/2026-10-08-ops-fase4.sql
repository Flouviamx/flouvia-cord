-- BEGIN ops-fase4
-- 2026-10-08: Cord Ops — monitor de crons y alertas configurables.
-- Aditiva e idempotente: corre en cada build (scripts/migrate-ops.mjs,
-- en el buildCommand de vercel.json). Cada política se crea solo si falta:
-- `create policy` toma ACCESS EXCLUSIVE aunque no cambie nada, y en cada build
-- eso frenaría a los crons que escriben `cron_runs`.
--
-- 1. Ops lee la bitácora de los crons. `cron_runs` no tiene org_id y hasta
--    hoy solo la tocaba el carril de sistema.
do $$ begin
  if to_regclass('public.cron_runs') is not null
     and not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'cron_runs' and policyname = 'ops_cron_runs') then
    create policy ops_cron_runs on cron_runs for select using (current_setting('app.scope', true) = 'ops');
  end if;
end $$;

-- 2. Alertas de Ops. Una regla por métrica, de un catálogo cerrado
--    (src/lib/ops-alerts.ts): Ops decide si está encendida y desde qué valor
--    avisa. El estado guarda si la alerta está disparada y cuándo se avisó,
--    para mandar un correo al entrar y otro al resolverse, no uno por corrida.
--    Sin org_id y sin RLS, igual que ops_operators y ops_audit_log: son tablas
--    de la plataforma, no de un negocio, y ninguna ruta fuera de Ops las lee.
create table if not exists ops_alert_rules (
  metric      text        primary key check (metric ~ '^[a-z0-9_]{3,40}$'),
  enabled     boolean     not null default true,
  threshold   numeric     not null check (threshold >= 0),
  updated_by  text,
  updated_at  timestamptz not null default now()
);
create table if not exists ops_alert_state (
  metric       text        primary key check (metric ~ '^[a-z0-9_]{3,40}$'),
  firing       boolean     not null default false,
  value        numeric,
  since        timestamptz,
  notified_at  timestamptz,
  checked_at   timestamptz not null default now()
);

-- 3. Métricas de las alertas, en UN solo lugar que leen la pantalla de Ops y
--    el cron que avisa. `security definer` y solo AGREGADOS (un número por
--    métrica, ninguna fila de ningún negocio): así el cron no necesita el
--    carril de Ops ni políticas nuevas en tablas de negocio (regla 30). Las
--    métricas de crons se calculan aparte, en código, porque dependen del
--    horario declarado en vercel.json.
create or replace function cord_ops_alert_metrics()
returns table (metric text, value numeric)
language sql stable security definer
set search_path = public, pg_temp
as $$
  -- Con menos de 20 entregas en el día el porcentaje es ruido: vale 0.
  select 'webhook_fail_pct_24h', case when count(*) >= 20
           then round(100.0 * count(*) filter (where not ok) / count(*), 1) else 0 end
    from webhook_deliveries where created_at >= now() - interval '24 hours' and not es_prueba
  union all
  select 'stripe_events_stuck', count(*)::numeric from stripe_events
   where processed_at is null and received_at < now() - interval '15 minutes'
  union all
  select 'workflow_failed_24h', count(*)::numeric from workflow_runs
   where status = 'failed' and coalesce(finished_at, updated_at) >= now() - interval '24 hours'
  union all
  select 'api_5xx_1h', count(*)::numeric from api_requests
   where status >= 500 and created_at >= now() - interval '1 hour'
  union all
  select 'disputes_needs_response', count(*)::numeric from cobro_disputas
   where status in ('needs_response', 'warning_needs_response')
  union all
  select 'payouts_failed_7d', count(*)::numeric from payouts
   where status = 'failed' and updated_at >= now() - interval '7 days'
  union all
  select 'integrations_error', count(*)::numeric from integracion_conexiones where estado = 'error'
  union all
  -- Componentes cuya ÚLTIMA muestra de las últimas 2 h falló.
  select 'health_failing', count(*)::numeric from (
    select distinct on (service) ok from health_checks
     where checked_at >= now() - interval '2 hours'
     order by service, checked_at desc
  ) latest where not ok
$$;
revoke all on function cord_ops_alert_metrics() from public;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'cord_app') then
    grant execute on function cord_ops_alert_metrics() to cord_app;
  end if;
end $$;
-- END ops-fase4

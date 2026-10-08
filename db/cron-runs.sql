-- Bitácora y reclamo por periodo de los crons (oct 2026).
-- Aditiva e idempotente: corre en cada build (scripts/migrate-cron-runs.mjs)
-- ANTES de que el código nuevo sirva tráfico, y su espejo vive en db/schema.sql.
--
-- Los crons se disparan desde dos relojes (vercel.json y cord-crons.yml). Cada
-- endpoint reclama (endpoint, periodo) con `insert … on conflict` antes de
-- trabajar (src/lib/cron-runs.ts): un segundo disparo del mismo periodo no
-- repite, y uno que quedó en `error` o colgado en `running` se recupera en la
-- corrida siguiente. Sin org_id: solo el carril de sistema la toca.
create table if not exists cron_runs (
  endpoint     text        not null,
  periodo      text        not null,
  estado       text        not null default 'running' check (estado in ('running', 'ok', 'error')),
  run_id       uuid,
  intentos     integer     not null default 1,
  started_at   timestamptz not null default now(),
  finished_at  timestamptz,
  resultado    jsonb,
  primary key (endpoint, periodo)
);
create index if not exists idx_cron_runs_started on cron_runs(started_at desc);
alter table cron_runs enable row level security;
alter table cron_runs force row level security;
-- Sin `drop policy` + `create policy`: corre en cada build y, entre las dos
-- llamadas (el driver HTTP no comparte transacción), la tabla quedaría sin
-- política un instante. Se crea solo si falta.
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'cron_runs' and policyname = 'system_cron_runs') then
    create policy system_cron_runs on cron_runs
      using (current_setting('app.scope', true) = 'system')
      with check (current_setting('app.scope', true) = 'system');
  end if;
end $$;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'cord_app') then
    grant select, insert, update, delete on cron_runs to cord_app;
  end if;
end $$;

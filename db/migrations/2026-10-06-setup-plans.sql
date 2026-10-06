-- BEGIN setup-plans
-- Configuración asistida (src/lib/setup/): un solo plan por propuesta, venga del
-- onboarding, de la app, del CLI o de un agente por MCP. Se propone, una persona
-- lo revisa en el navegador y solo entonces se aplica por los mismos caminos que
-- Ajustes. La entrada guarda referencias (sitio, descripción, nombre de archivo),
-- nunca el contenido de los archivos.
create table if not exists setup_plans (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references orgs(id) on delete cascade,
  origen       text not null check (origen in ('onboarding', 'app', 'cli', 'mcp')),
  estado       text not null default 'generando' check (estado in ('generando', 'propuesto', 'aplicado', 'descartado', 'fallido')),
  entrada      jsonb not null default '{}'::jsonb,
  propuesta    jsonb,
  descartado   jsonb not null default '[]'::jsonb,
  resultado    jsonb,
  creado_por   text,
  aplicado_por uuid references users(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  aplicado_at  timestamptz,
  expira_at    timestamptz not null default now() + interval '7 days'
);
create index if not exists idx_setup_plans_org on setup_plans(org_id, created_at desc);

alter table setup_plans enable row level security;
alter table setup_plans force row level security;
drop policy if exists rls_setup_plans on setup_plans;
create policy rls_setup_plans on setup_plans
  using (org_id = nullif(current_setting('app.org_id', true), '')::uuid)
  with check (org_id = nullif(current_setting('app.org_id', true), '')::uuid);

do $$ begin
  if exists (select 1 from pg_roles where rolname = 'cord_app') then
    grant select, insert, update, delete on setup_plans to cord_app;
  end if;
end $$;
-- END setup-plans

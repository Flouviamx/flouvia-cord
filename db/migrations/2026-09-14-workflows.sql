-- BEGIN workflows
create or replace function cord_resource_limit(p_plan text, p_resource text)
returns integer
language sql immutable
as $$
  select case p_resource
    when 'active_quotes' then case p_plan when 'free' then 5 when 'starter' then 50 else null end
    when 'products'      then case p_plan when 'free' then 50 when 'starter' then 500 else null end
    when 'clients'       then case p_plan when 'free' then 50 when 'starter' then 500 else null end
    when 'seats'         then case p_plan when 'free' then 1 when 'starter' then 1 else null end
    when 'active_workflows' then case p_plan when 'free' then 1 when 'starter' then 5 else null end
    else 0
  end
$$;

create or replace function cord_enforce_resource_limit()
returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_resource text;
  v_limit integer;
  v_used integer;
  v_old_active boolean := false;
  v_new_active boolean := true;
begin
  if tg_table_name = 'productos' then
    v_resource := 'products';
  elsif tg_table_name = 'clientes' then
    v_resource := 'clients';
  elsif tg_table_name = 'cotizaciones' then
    v_resource := 'active_quotes';
    v_new_active := new.status in ('draft','sent','viewed','approved');
    if tg_op = 'UPDATE' then
      v_old_active := old.status in ('draft','sent','viewed','approved');
    end if;
    if not v_new_active or v_old_active then return new; end if;
  elsif tg_table_name = 'org_members' then
    v_resource := 'seats';
    v_new_active := new.estado in ('activo','invitado');
    if tg_op = 'UPDATE' then
      v_old_active := old.estado in ('activo','invitado');
    end if;
    if not v_new_active or v_old_active then return new; end if;
  elsif tg_table_name = 'workflows' then
    v_resource := 'active_workflows';
    v_new_active := new.estado = 'active';
    if tg_op = 'UPDATE' then
      v_old_active := old.estado = 'active';
    end if;
    if not v_new_active or v_old_active then return new; end if;
  else
    raise exception 'cord_limit:unknown_resource';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(new.org_id::text || ':' || v_resource, 0));
  v_limit := cord_resource_limit(cord_effective_plan(new.org_id), v_resource);
  if v_limit is null then return new; end if;

  if v_resource = 'products' then
    select count(*) into v_used from productos where org_id = new.org_id;
  elsif v_resource = 'clients' then
    select count(*) into v_used from clientes where org_id = new.org_id;
  elsif v_resource = 'active_quotes' then
    select count(*) into v_used from cotizaciones
      where org_id = new.org_id and status in ('draft','sent','viewed','approved');
  elsif v_resource = 'active_workflows' then
    select count(*) into v_used from workflows
      where org_id = new.org_id and estado = 'active';
  else
    select count(*) into v_used from org_members
      where org_id = new.org_id and estado in ('activo','invitado');
  end if;

  if v_used >= v_limit then
    raise exception using
      errcode = '23514',
      message = 'cord_limit:' || v_resource || ':' || v_limit::text;
  end if;
  return new;
end
$$;

create unique index if not exists uq_domain_events_org_id_id on domain_events(org_id, id);

create table if not exists workflows (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null references orgs(id) on delete cascade,
  nombre             text not null check (length(nombre) between 1 and 120),
  estado             text not null default 'draft' check (estado in ('draft', 'active', 'paused')),
  definicion         jsonb not null default '{"trigger": null, "steps": []}'::jsonb,
  publicado          jsonb,
  trigger_publicado  text check (trigger_publicado is null or trigger_publicado ~ '^[a-z_]+\.[a-z_]+$'),
  version            int not null default 0 check (version >= 0),
  created_by         uuid references users(id) on delete set null,
  updated_by         uuid references users(id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  published_at       timestamptz,
  check (estado = 'draft' or (publicado is not null and trigger_publicado is not null)),
  unique (org_id, id)
);
create index if not exists idx_workflows_org on workflows(org_id, updated_at desc);
create index if not exists idx_workflows_trigger on workflows(org_id, trigger_publicado) where estado = 'active';

create table if not exists workflow_runs (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references orgs(id) on delete cascade,
  workflow_id   uuid not null,
  version       int not null check (version >= 0),
  publicado     jsonb not null,
  event_id      uuid not null,
  depth         smallint not null default 0 check (depth between 0 and 10),
  status        text not null default 'queued' check (status in ('queued', 'running', 'waiting', 'succeeded', 'failed', 'canceled')),
  run_at        timestamptz not null default now(),
  locked_until  timestamptz,
  attempts      int not null default 0 check (attempts >= 0),
  cursor        jsonb not null default '[]'::jsonb,
  log           jsonb not null default '[]'::jsonb,
  error         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  finished_at   timestamptz,
  unique (workflow_id, event_id),
  foreign key (org_id, workflow_id) references workflows(org_id, id) on delete cascade,
  foreign key (org_id, event_id) references domain_events(org_id, id) on delete cascade
);
create index if not exists idx_workflow_runs_due on workflow_runs(org_id, run_at) where status in ('queued', 'waiting', 'running');
create index if not exists idx_workflow_runs_workflow on workflow_runs(org_id, workflow_id, created_at desc, id desc);
create index if not exists idx_workflow_runs_event on workflow_runs(org_id, event_id);

alter table workflows enable row level security;
alter table workflows force row level security;
drop policy if exists rls_workflows on workflows;
create policy rls_workflows on workflows
  using (org_id = nullif(current_setting('app.org_id', true), '')::uuid)
  with check (org_id = nullif(current_setting('app.org_id', true), '')::uuid);

alter table workflow_runs enable row level security;
alter table workflow_runs force row level security;
drop policy if exists rls_workflow_runs on workflow_runs;
create policy rls_workflow_runs on workflow_runs
  using (org_id = nullif(current_setting('app.org_id', true), '')::uuid)
  with check (org_id = nullif(current_setting('app.org_id', true), '')::uuid);
drop policy if exists system_workflow_runs on workflow_runs;
create policy system_workflow_runs on workflow_runs for select
  using (current_setting('app.scope', true) = 'system');

drop trigger if exists trg_limit_workflows on workflows;
create trigger trg_limit_workflows before insert or update of estado on workflows
  for each row execute function cord_enforce_resource_limit();

do $$ begin
  if exists (select 1 from pg_roles where rolname = 'cord_app') then
    grant select, insert, update, delete on workflows to cord_app;
    grant select, insert, update, delete on workflow_runs to cord_app;
  end if;
end $$;
-- END workflows

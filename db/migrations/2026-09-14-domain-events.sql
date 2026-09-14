-- BEGIN domain-events
create table if not exists domain_events (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references orgs(id) on delete cascade,
  type        text not null check (type ~ '^[a-z_]+\.[a-z_]+$'),
  object      text not null,
  object_id   uuid,
  data        jsonb not null default '{}'::jsonb,
  actor       text not null,
  caused_by   uuid references domain_events(id) on delete set null,
  depth       smallint not null default 0 check (depth between 0 and 10),
  created_at  timestamptz not null default now()
);
create index if not exists idx_domain_events_org_created on domain_events(org_id, created_at desc, id desc);
create index if not exists idx_domain_events_org_object on domain_events(org_id, object, object_id, created_at desc);

create or replace function domain_events_append_only() returns trigger
language plpgsql as $$
begin
  raise exception 'domain_events es append-only';
end $$;
drop trigger if exists trg_domain_events_append_only on domain_events;
create trigger trg_domain_events_append_only before update on domain_events
  for each row execute function domain_events_append_only();

alter table domain_events enable row level security;
alter table domain_events force row level security;
drop policy if exists rls_domain_events on domain_events;
create policy rls_domain_events on domain_events
  using (org_id = nullif(current_setting('app.org_id', true), '')::uuid)
  with check (org_id = nullif(current_setting('app.org_id', true), '')::uuid);

do $$ begin
  if exists (select 1 from pg_roles where rolname = 'cord_app') then
    grant select, insert, delete on domain_events to cord_app;
  end if;
end $$;
-- END domain-events

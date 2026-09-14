-- BEGIN api-idempotency
create table if not exists api_idempotency (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references orgs(id) on delete cascade,
  key_id           uuid not null references api_keys(id) on delete cascade,
  idempotency_key  text not null check (length(idempotency_key) between 1 and 255),
  method           text not null,
  path             text not null,
  request_hash     text not null check (request_hash ~ '^[0-9a-f]{64}$'),
  status           int,
  response_body    text,
  created_at       timestamptz not null default now(),
  completed_at     timestamptz,
  unique (key_id, idempotency_key)
);
create index if not exists idx_api_idempotency_created on api_idempotency(created_at);

alter table api_idempotency enable row level security;
alter table api_idempotency force row level security;
drop policy if exists rls_api_idempotency on api_idempotency;
create policy rls_api_idempotency on api_idempotency
  using (org_id = nullif(current_setting('app.org_id', true), '')::uuid)
  with check (org_id = nullif(current_setting('app.org_id', true), '')::uuid);

do $$ begin
  if exists (select 1 from pg_roles where rolname = 'cord_app') then
    grant select, insert, update, delete on api_idempotency to cord_app;
  end if;
end $$;
-- END api-idempotency

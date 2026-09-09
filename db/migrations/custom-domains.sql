-- Custom customer subdomains. Additive; also embedded in db/schema.sql.
create table if not exists org_domains (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null unique references orgs(id) on delete cascade,
  hostname text not null unique check (hostname = lower(hostname) and length(hostname) <= 253),
  verification_token text not null,
  probe_secret text not null,
  status text not null default 'pending' check (status in ('pending','dns_pending','tls_pending','active','error')),
  records jsonb not null default '[]'::jsonb,
  provider_project text,
  provider_team text,
  provider_owned boolean not null default false,
  removing boolean not null default false,
  operation_token uuid,
  operation_expires_at timestamptz,
  last_checked_at timestamptz,
  verified_at timestamptz,
  error_code text,
  created_at timestamptz not null default now()
);
alter table org_domains enable row level security;
alter table org_domains force row level security;
drop policy if exists org_domains_tenant on org_domains;
create policy org_domains_tenant on org_domains
  using (org_id = nullif(current_setting('app.org_id', true), '')::uuid)
  with check (org_id = nullif(current_setting('app.org_id', true), '')::uuid);

-- Discovery returns identity only, never configuration/secrets or other orgs.
create or replace function cord_resolve_customer_domain(p_hostname text)
returns table(org_id uuid)
language sql stable security definer
set search_path = public, pg_temp
as $$
  select d.org_id from org_domains d
  where p_hostname is not null and p_hostname <> ''
    and d.hostname = p_hostname and not d.removing
  limit 1
$$;
revoke all on function cord_resolve_customer_domain(text) from public;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'cord_app') then
    grant select, insert, update, delete on org_domains to cord_app;
    grant execute on function cord_resolve_customer_domain(text) to cord_app;
  end if;
end $$;

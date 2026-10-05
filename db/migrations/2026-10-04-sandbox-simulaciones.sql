-- BEGIN sandbox-simulaciones
-- Resultados forzados del modo prueba (test helpers de la API). Solo para
-- organizaciones sandbox: la base lo exige con un trigger, no solo el código.
create table if not exists sandbox_simulaciones (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references orgs(id) on delete cascade,
  tipo         text not null check (tipo in ('fiscal_emision')),
  resultado    text not null check (resultado in ('exito', 'pac_caido', 'receptor_invalido', 'certificado_vencido', 'timbre_duplicado')),
  created_at   timestamptz not null default now(),
  consumido_at timestamptz
);
create unique index if not exists uq_sandbox_simulacion_pendiente
  on sandbox_simulaciones(org_id, tipo) where consumido_at is null;

create or replace function cord_assert_sandbox_org() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from orgs where id = new.org_id and sandbox_of is not null) then
    raise exception 'sandbox_simulaciones solo admite organizaciones de prueba';
  end if;
  return new;
end $$;
revoke all on function cord_assert_sandbox_org() from public;

drop trigger if exists trg_sandbox_simulaciones_solo_sandbox on sandbox_simulaciones;
create trigger trg_sandbox_simulaciones_solo_sandbox
  before insert or update on sandbox_simulaciones
  for each row execute function cord_assert_sandbox_org();

alter table sandbox_simulaciones enable row level security;
alter table sandbox_simulaciones force row level security;
drop policy if exists rls_sandbox_simulaciones on sandbox_simulaciones;
create policy rls_sandbox_simulaciones on sandbox_simulaciones
  using (org_id = nullif(current_setting('app.org_id', true), '')::uuid)
  with check (org_id = nullif(current_setting('app.org_id', true), '')::uuid);

do $$ begin
  if exists (select 1 from pg_roles where rolname = 'cord_app') then
    grant select, insert, update, delete on sandbox_simulaciones to cord_app;
  end if;
end $$;
-- END sandbox-simulaciones

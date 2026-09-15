-- Integraciones con CRMs (HubSpot): conexiones OAuth, vínculos de ids y cola de sincronización.

create table if not exists integracion_conexiones (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null references orgs(id) on delete cascade,
  proveedor          text not null check (proveedor in ('hubspot')),
  estado             text not null default 'activa' check (estado in ('activa', 'error', 'desconectada')),
  cuenta_externa     text not null check (cuenta_externa ~ '^[0-9]{1,20}$'),
  cuenta_nombre      text check (cuenta_nombre is null or length(cuenta_nombre) <= 200),
  scopes             text[] not null default '{}',
  access_token_enc   text,
  access_expires_at  timestamptz,
  refresh_token_enc  text,
  ajustes            jsonb not null default '{}'::jsonb,
  ultimo_error       text check (ultimo_error is null or length(ultimo_error) <= 500),
  ultimo_error_at    timestamptz,
  ultima_sync_at     timestamptz,
  conectada_por      uuid references users(id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  check (estado = 'desconectada' or refresh_token_enc is not null),
  check (estado <> 'desconectada' or (refresh_token_enc is null and access_token_enc is null)),
  unique (org_id, proveedor),
  unique (org_id, id)
);
create unique index if not exists uq_integracion_cuenta_activa
  on integracion_conexiones(proveedor, cuenta_externa) where estado <> 'desconectada';

create table if not exists integracion_oauth_estados (
  state_hash  text primary key check (state_hash ~ '^[a-f0-9]{64}$'),
  org_id      uuid not null references orgs(id) on delete cascade,
  user_id     uuid not null references users(id) on delete cascade,
  proveedor   text not null check (proveedor in ('hubspot')),
  expires_at  timestamptz not null,
  used_at     timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists idx_integracion_oauth_estados_exp on integracion_oauth_estados(expires_at);

create table if not exists integracion_vinculos (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null,
  conexion_id      uuid not null,
  objeto           text not null check (objeto in ('client', 'client_contact', 'quote')),
  local_id         uuid not null,
  externo_tipo     text not null check (externo_tipo in ('company', 'contact', 'deal')),
  externo_id       text not null check (externo_id ~ '^[0-9]{1,20}$'),
  huella           text check (huella is null or huella ~ '^[a-f0-9]{64}$'),
  sincronizado_at  timestamptz,
  created_at       timestamptz not null default now(),
  unique (conexion_id, objeto, local_id),
  unique (conexion_id, externo_tipo, externo_id),
  foreign key (org_id, conexion_id) references integracion_conexiones(org_id, id) on delete cascade
);
create index if not exists idx_integracion_vinculos_local on integracion_vinculos(org_id, objeto, local_id);

create table if not exists integracion_sync (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null,
  conexion_id   uuid not null,
  direccion     text not null check (direccion in ('salida', 'entrada')),
  objeto        text not null check (objeto in ('client', 'quote', 'company', 'contact')),
  clave         text not null check (clave ~ '^[0-9a-f-]{1,36}$'),
  status        text not null default 'queued' check (status in ('queued', 'running', 'succeeded', 'failed')),
  attempts      int not null default 0 check (attempts >= 0),
  run_at        timestamptz not null default now(),
  locked_until  timestamptz,
  error         text check (error is null or length(error) <= 500),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  finished_at   timestamptz,
  foreign key (org_id, conexion_id) references integracion_conexiones(org_id, id) on delete cascade
);
create unique index if not exists uq_integracion_sync_pendiente
  on integracion_sync(conexion_id, direccion, objeto, clave) where status = 'queued';
create index if not exists idx_integracion_sync_due on integracion_sync(org_id, run_at) where status in ('queued', 'running');
create index if not exists idx_integracion_sync_fin on integracion_sync(finished_at) where status in ('succeeded', 'failed');

alter table integracion_conexiones enable row level security;
alter table integracion_conexiones force row level security;
drop policy if exists rls_integracion_conexiones on integracion_conexiones;
create policy rls_integracion_conexiones on integracion_conexiones
  using (org_id = nullif(current_setting('app.org_id', true), '')::uuid)
  with check (org_id = nullif(current_setting('app.org_id', true), '')::uuid);

alter table integracion_oauth_estados enable row level security;
alter table integracion_oauth_estados force row level security;
drop policy if exists rls_integracion_oauth_estados on integracion_oauth_estados;
create policy rls_integracion_oauth_estados on integracion_oauth_estados
  using (org_id = nullif(current_setting('app.org_id', true), '')::uuid)
  with check (org_id = nullif(current_setting('app.org_id', true), '')::uuid);

alter table integracion_vinculos enable row level security;
alter table integracion_vinculos force row level security;
drop policy if exists rls_integracion_vinculos on integracion_vinculos;
create policy rls_integracion_vinculos on integracion_vinculos
  using (org_id = nullif(current_setting('app.org_id', true), '')::uuid)
  with check (org_id = nullif(current_setting('app.org_id', true), '')::uuid);

alter table integracion_sync enable row level security;
alter table integracion_sync force row level security;
drop policy if exists rls_integracion_sync on integracion_sync;
create policy rls_integracion_sync on integracion_sync
  using (org_id = nullif(current_setting('app.org_id', true), '')::uuid)
  with check (org_id = nullif(current_setting('app.org_id', true), '')::uuid);
drop policy if exists system_integracion_sync on integracion_sync;
create policy system_integracion_sync on integracion_sync for select
  using (current_setting('app.scope', true) = 'system');

create or replace function cord_resolve_integracion(p_proveedor text, p_cuenta text)
returns table(org_id uuid, conexion_id uuid)
language sql stable security definer
set search_path = public, pg_temp
as $$
  select c.org_id, c.id from integracion_conexiones c
   where p_proveedor is not null and p_cuenta is not null
     and c.proveedor = p_proveedor and c.cuenta_externa = p_cuenta and c.estado <> 'desconectada'
   limit 1
$$;
revoke all on function cord_resolve_integracion(text, text) from public;

do $$ begin
  if exists (select 1 from pg_roles where rolname = 'cord_app') then
    grant select, insert, update, delete on integracion_conexiones to cord_app;
    grant select, insert, update, delete on integracion_oauth_estados to cord_app;
    grant select, insert, update, delete on integracion_vinculos to cord_app;
    grant select, insert, update, delete on integracion_sync to cord_app;
    grant execute on function cord_resolve_integracion(text, text) to cord_app;
  end if;
end $$;
-- END integraciones

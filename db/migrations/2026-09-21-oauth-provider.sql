-- Cord como proveedor OAuth 2.0 (Zapier, Make, n8n).
--
-- Quien conecta una app externa autoriza en una pantalla de Cord en vez de
-- crear y pegar una llave. Un grant se materializa como una fila de `api_keys`
-- de vida corta (oauth_client_id no nulo): toda ruta que ya autentica por llave
-- (/api/v1, MCP) acepta el token sin cambios, y los webhooks que la app crea
-- sobreviven a la renovación porque el id de la llave no cambia.
--
-- Los tokens y los códigos viven solo como sha-256. Las llaves de OAuth no
-- cuentan contra el límite de llaves del plan: son conexiones, no credenciales
-- que el equipo administra a mano.

create table if not exists oauth_clients (
  client_id     text primary key check (client_id ~ '^cord_oc_[a-f0-9]{32}$'),
  slug          text not null unique check (slug ~ '^[a-z0-9-]{2,32}$'),
  nombre        text not null,
  dominio       text,
  secret_hash   text not null check (secret_hash ~ '^[a-f0-9]{64}$'),
  redirect_uris text[] not null check (cardinality(redirect_uris) between 1 and 10),
  created_at    timestamptz not null default now(),
  revoked_at    timestamptz
);

alter table api_keys add column if not exists oauth_client_id text references oauth_clients(client_id) on delete cascade;
alter table api_keys add column if not exists expires_at timestamptz;
create index if not exists idx_api_keys_oauth on api_keys(org_id, oauth_client_id) where oauth_client_id is not null;

create table if not exists oauth_grants (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null references orgs(id) on delete cascade,
  client_id          text not null references oauth_clients(client_id) on delete cascade,
  user_id            uuid not null references users(id) on delete cascade,
  api_key_id         uuid not null references api_keys(id) on delete cascade,
  scope              text not null check (scope in ('read', 'write')),
  refresh_hash       text not null unique check (refresh_hash ~ '^[a-f0-9]{64}$'),
  refresh_expires_at timestamptz not null,
  created_at         timestamptz not null default now(),
  refreshed_at       timestamptz,
  revoked_at         timestamptz
);
create index if not exists idx_oauth_grants_org on oauth_grants(org_id, created_at desc);

create table if not exists oauth_codes (
  code_hash      text primary key check (code_hash ~ '^[a-f0-9]{64}$'),
  client_id      text not null references oauth_clients(client_id) on delete cascade,
  org_id         uuid not null references orgs(id) on delete cascade,
  user_id        uuid not null references users(id) on delete cascade,
  scope          text not null check (scope in ('read', 'write')),
  redirect_uri   text not null,
  code_challenge text,
  expires_at     timestamptz not null,
  used_at        timestamptz,
  created_at     timestamptz not null default now()
);
create index if not exists idx_oauth_codes_exp on oauth_codes(expires_at);

alter table oauth_grants enable row level security;
alter table oauth_grants force row level security;
drop policy if exists rls_oauth_grants on oauth_grants;
create policy rls_oauth_grants on oauth_grants
  using (org_id = nullif(current_setting('app.org_id', true), '')::uuid)
  with check (org_id = nullif(current_setting('app.org_id', true), '')::uuid);

alter table oauth_codes enable row level security;
alter table oauth_codes force row level security;
drop policy if exists rls_oauth_codes on oauth_codes;
create policy rls_oauth_codes on oauth_codes
  using (org_id = nullif(current_setting('app.org_id', true), '')::uuid)
  with check (org_id = nullif(current_setting('app.org_id', true), '')::uuid);

-- Resolutores estrechos: el endpoint de token no tiene sesión ni organización,
-- así que la identidad sale del código o del refresh token y todo lo demás
-- vuelve a withOrgTx.
create or replace function cord_oauth_client(p_client_id text)
returns table (client_id text, slug text, nombre text, dominio text, secret_hash text, redirect_uris text[])
language sql stable security definer
set search_path = public, pg_temp
as $$
  select c.client_id, c.slug, c.nombre, c.dominio, c.secret_hash, c.redirect_uris
    from oauth_clients c
   where c.client_id = p_client_id and c.revoked_at is null
$$;

-- Consume el código en UNA sentencia: dos canjes simultáneos no pueden ganar
-- los dos. Un código vencido, usado o de otro cliente/redirect no devuelve nada.
create or replace function cord_oauth_consume_code(p_client_id text, p_code_hash text, p_redirect_uri text)
returns table (org_id uuid, user_id uuid, scope text, code_challenge text)
language sql volatile security definer
set search_path = public, pg_temp
as $$
  update oauth_codes c set used_at = now()
   where c.code_hash = p_code_hash and c.client_id = p_client_id
     and c.redirect_uri = p_redirect_uri
     and c.used_at is null and c.expires_at > now()
  returning c.org_id, c.user_id, c.scope, c.code_challenge
$$;

-- Crea la llave de vida corta y el grant que la renueva. Devuelve null si la
-- organización ya tiene 25 conexiones vivas de esa app.
create or replace function cord_oauth_issue(
  p_org_id uuid, p_user_id uuid, p_client_id text, p_scope text,
  p_access_hash text, p_access_prefix text, p_access_last4 text, p_access_ttl_s int,
  p_refresh_hash text, p_refresh_ttl_days int
)
returns uuid
language plpgsql volatile security definer
set search_path = public, pg_temp
as $$
declare
  v_nombre text;
  v_key uuid;
  v_grant uuid;
begin
  select c.nombre into v_nombre from oauth_clients c where c.client_id = p_client_id and c.revoked_at is null;
  if v_nombre is null then return null; end if;
  if (select count(*) from oauth_grants g
       where g.org_id = p_org_id and g.client_id = p_client_id
         and g.revoked_at is null and g.refresh_expires_at > now()) >= 25 then
    return null;
  end if;
  insert into api_keys (org_id, nombre, prefix, last4, hash, scope, mode, type, created_by, oauth_client_id, expires_at)
  values (p_org_id, v_nombre, p_access_prefix, p_access_last4, p_access_hash, p_scope, 'live', 'secret', 'oauth',
          p_client_id, now() + make_interval(secs => p_access_ttl_s))
  returning id into v_key;
  insert into oauth_grants (org_id, client_id, user_id, api_key_id, scope, refresh_hash, refresh_expires_at)
  values (p_org_id, p_client_id, p_user_id, v_key, p_scope, p_refresh_hash, now() + make_interval(days => p_refresh_ttl_days))
  returning id into v_grant;
  return v_grant;
end;
$$;

-- Rota el par de tokens de forma atómica. El refresh viejo deja de servir en la
-- misma sentencia que emite el nuevo.
create or replace function cord_oauth_refresh(
  p_client_id text, p_refresh_hash text,
  p_new_access_hash text, p_new_prefix text, p_new_last4 text, p_access_ttl_s int,
  p_new_refresh_hash text, p_refresh_ttl_days int
)
returns table (grant_id uuid, scope text)
language plpgsql volatile security definer
set search_path = public, pg_temp
as $$
declare
  v_grant uuid;
  v_key uuid;
  v_scope text;
begin
  update oauth_grants g
     set refresh_hash = p_new_refresh_hash,
         refreshed_at = now(),
         refresh_expires_at = now() + make_interval(days => p_refresh_ttl_days)
   where g.refresh_hash = p_refresh_hash and g.client_id = p_client_id
     and g.revoked_at is null and g.refresh_expires_at > now()
     and exists (select 1 from api_keys k where k.id = g.api_key_id and k.revoked_at is null)
  returning g.id, g.api_key_id, g.scope into v_grant, v_key, v_scope;
  if v_grant is null then return; end if;
  update api_keys k
     set hash = p_new_access_hash, prefix = p_new_prefix, last4 = p_new_last4,
         expires_at = now() + make_interval(secs => p_access_ttl_s)
   where k.id = v_key;
  grant_id := v_grant;
  scope := v_scope;
  return next;
end;
$$;

-- RFC 7009: revoca por refresh token o por access token del cliente que lo pide.
create or replace function cord_oauth_revoke(p_client_id text, p_token_hash text)
returns boolean
language plpgsql volatile security definer
set search_path = public, pg_temp
as $$
declare
  v_key uuid;
begin
  select g.api_key_id into v_key
    from oauth_grants g
    join api_keys k on k.id = g.api_key_id
   where g.client_id = p_client_id and g.revoked_at is null
     and (g.refresh_hash = p_token_hash or k.hash = p_token_hash)
   limit 1;
  if v_key is null then return false; end if;
  update oauth_grants set revoked_at = now() where api_key_id = v_key and revoked_at is null;
  update api_keys set revoked_at = now() where id = v_key and revoked_at is null;
  return true;
end;
$$;

revoke all on function cord_oauth_client(text) from public;
revoke all on function cord_oauth_consume_code(text, text, text) from public;
revoke all on function cord_oauth_issue(uuid, uuid, text, text, text, text, text, int, text, int) from public;
revoke all on function cord_oauth_refresh(text, text, text, text, text, int, text, int) from public;
revoke all on function cord_oauth_revoke(text, text) from public;

do $$ begin
  if exists (select 1 from pg_roles where rolname = 'cord_app') then
    grant select on oauth_clients to cord_app;
    grant select, insert, update, delete on oauth_grants to cord_app;
    grant select, insert, update, delete on oauth_codes to cord_app;
    grant execute on function cord_oauth_client(text) to cord_app;
    grant execute on function cord_oauth_consume_code(text, text, text) to cord_app;
    grant execute on function cord_oauth_issue(uuid, uuid, text, text, text, text, text, int, text, int) to cord_app;
    grant execute on function cord_oauth_refresh(text, text, text, text, text, int, text, int) to cord_app;
    grant execute on function cord_oauth_revoke(text, text) to cord_app;
  end if;
end $$;

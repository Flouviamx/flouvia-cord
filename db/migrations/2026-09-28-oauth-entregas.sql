-- 2026-09-28: entrega del código OAuth al complemento de Gmail.

-- Entrega del código a clientes que no pueden recibir un redirect propio (el
-- complemento de Gmail). Su regreso es /oauth/listo de Cord: el código se guarda
-- aquí contra el `state` que generó el cliente y él lo recoge con su secreto y
-- su verificador PKCE. Nunca pasa por el navegador.
create table if not exists oauth_entregas (
  state_hash   text primary key check (state_hash ~ '^[a-f0-9]{64}$'),
  client_id    text not null references oauth_clients(client_id) on delete cascade,
  code         text not null check (code ~ '^cord_ac_[a-f0-9]{64}$'),
  redirect_uri text not null,
  expires_at   timestamptz not null,
  created_at   timestamptz not null default now()
);
alter table oauth_entregas enable row level security;
alter table oauth_entregas force row level security;

create or replace function cord_oauth_entrega_guardar(p_state_hash text, p_client_id text, p_code text, p_redirect_uri text, p_ttl_s int)
returns void
language sql volatile security definer
set search_path = public, pg_temp
as $$
  delete from oauth_entregas where expires_at < now();
  insert into oauth_entregas (state_hash, client_id, code, redirect_uri, expires_at)
  values (p_state_hash, p_client_id, p_code, p_redirect_uri, now() + make_interval(secs => p_ttl_s))
  on conflict (state_hash) do nothing;
$$;

create or replace function cord_oauth_entrega_recoger(p_state_hash text, p_client_id text)
returns table (code text, redirect_uri text)
language sql volatile security definer
set search_path = public, pg_temp
as $$
  delete from oauth_entregas e
   where e.state_hash = p_state_hash and e.client_id = p_client_id and e.expires_at > now()
  returning e.code, e.redirect_uri
$$;

revoke all on function cord_oauth_entrega_guardar(text, text, text, text, int) from public;
revoke all on function cord_oauth_entrega_recoger(text, text) from public;

do $$ begin
  if exists (select 1 from pg_roles where rolname = 'cord_app') then
    grant execute on function cord_oauth_entrega_guardar(text, text, text, text, int) to cord_app;
    grant execute on function cord_oauth_entrega_recoger(text, text) to cord_app;
  end if;
end $$;


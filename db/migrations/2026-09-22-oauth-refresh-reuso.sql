-- Detección de reuso de refresh token (RFC 9700): guarda el hash anterior y,
-- fuera de la ventana de gracia, revoca el grant completo.
alter table oauth_grants add column if not exists refresh_prev_hash text;
alter table oauth_grants add column if not exists refresh_prev_at timestamptz;
create index if not exists idx_oauth_grants_prev on oauth_grants(refresh_prev_hash) where refresh_prev_hash is not null;

drop function if exists cord_oauth_refresh(text, text, text, text, text, int, text, int);
create or replace function cord_oauth_refresh(
  p_client_id text, p_refresh_hash text,
  p_new_access_hash text, p_new_prefix text, p_new_last4 text, p_access_ttl_s int,
  p_new_refresh_hash text, p_refresh_ttl_days int
)
returns table (grant_id uuid, scope text, replay boolean)
language plpgsql volatile security definer
set search_path = public, pg_temp
as $$
declare
  v_grant uuid;
  v_key uuid;
  v_scope text;
  v_org uuid;
begin
  update oauth_grants g
     set refresh_prev_hash = g.refresh_hash,
         refresh_prev_at = now(),
         refresh_hash = p_new_refresh_hash,
         refreshed_at = now(),
         refresh_expires_at = now() + make_interval(days => p_refresh_ttl_days)
   where g.refresh_hash = p_refresh_hash and g.client_id = p_client_id
     and g.revoked_at is null and g.refresh_expires_at > now()
     and exists (select 1 from api_keys k where k.id = g.api_key_id and k.revoked_at is null)
  returning g.id, g.api_key_id, g.scope into v_grant, v_key, v_scope;
  if v_grant is not null then
    update api_keys k
       set hash = p_new_access_hash, prefix = p_new_prefix, last4 = p_new_last4,
           expires_at = now() + make_interval(secs => p_access_ttl_s)
     where k.id = v_key;
    grant_id := v_grant; scope := v_scope; replay := false;
    return next;
    return;
  end if;

  -- Reuso de un refresh YA rotado (RFC 9700 §4.14.2). Dos causas posibles: el
  -- cliente no recibió la respuesta y reintenta, o alguien robó el token. Solo
  -- se distinguen por el tiempo, así que dentro de la ventana de gracia se
  -- rechaza sin castigar, y fuera de ella se revoca el grant COMPLETO: si hubo
  -- robo, el ladrón y el cliente legítimo se quedan los dos fuera y la persona
  -- vuelve a conectar la app.
  update oauth_grants g
     set revoked_at = now()
   where g.refresh_prev_hash = p_refresh_hash and g.client_id = p_client_id
     and g.revoked_at is null
     and g.refresh_prev_at < now() - interval '30 seconds'
  returning g.id, g.api_key_id, g.org_id into v_grant, v_key, v_org;
  if v_grant is not null then
    update api_keys set revoked_at = now() where id = v_key and revoked_at is null;
    insert into audit_log (org_id, actor, accion, entidad, entidad_id, detalle)
    values (v_org, 'system', 'oauth.refresh_reuso', 'oauth_grant', v_grant::text,
            'Se presentó un refresh token ya rotado; se revocó la conexión');
    grant_id := v_grant; scope := null; replay := true;
    return next;
  end if;
end;
$$;

-- BEGIN cli-logins
-- `cord login` por navegador (flujo de dispositivo, RFC 8628). La terminal
-- guarda el device code; aquí solo vive su sha256. Una persona con sesión
-- aprueba el user code y Cord crea una llave restringida de prueba que queda
-- cifrada hasta que la terminal la reclama UNA vez. Nadie consulta la tabla
-- directo: solo estas funciones, que resuelven el flujo sin abrir acceso.
create table if not exists cli_logins (
  id           uuid primary key default gen_random_uuid(),
  device_hash  text not null unique check (device_hash ~ '^[a-f0-9]{64}$'),
  user_code    text not null unique check (user_code ~ '^[A-Z0-9]{4}-[A-Z0-9]{4}$'),
  host         text check (host is null or length(host) <= 80),
  estado       text not null default 'pendiente' check (estado in ('pendiente', 'aprobado', 'rechazado', 'reclamado')),
  org_id       uuid references orgs(id) on delete cascade,
  api_key_id   uuid references api_keys(id) on delete set null,
  secret_enc   text,
  aprobado_por uuid references users(id) on delete set null,
  created_at   timestamptz not null default now(),
  expira_at    timestamptz not null default now() + interval '10 minutes',
  aprobado_at  timestamptz
);
alter table cli_logins enable row level security;
alter table cli_logins force row level security;

create or replace function cord_cli_login_start(p_device_hash text, p_user_code text, p_host text)
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from cli_logins where created_at < now() - interval '1 day';
  insert into cli_logins (device_hash, user_code, host) values (p_device_hash, p_user_code, left(p_host, 80));
end $$;

create or replace function cord_cli_login_find(p_user_code text)
returns table (host text, estado text, expira_at timestamptz)
language sql security definer set search_path = public as $$
  select host, estado, expira_at from cli_logins where user_code = upper(p_user_code) limit 1;
$$;

create or replace function cord_cli_login_decide(p_user_code text, p_aprobar boolean, p_org uuid, p_user uuid, p_key uuid, p_secret_enc text)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  update cli_logins set
    estado = case when p_aprobar then 'aprobado' else 'rechazado' end,
    org_id = case when p_aprobar then p_org end,
    api_key_id = case when p_aprobar then p_key end,
    secret_enc = case when p_aprobar then p_secret_enc end,
    aprobado_por = p_user,
    aprobado_at = now()
  where user_code = upper(p_user_code) and estado = 'pendiente' and expira_at > now()
  returning id into v_id;
  return v_id is not null;
end $$;

-- Reclamar entrega la llave una sola vez y la borra en el mismo UPDATE.
create or replace function cord_cli_login_claim(p_device_hash text)
returns table (estado text, secret_enc text, org_id uuid)
language plpgsql security definer set search_path = public as $$
declare r cli_logins;
begin
  select * into r from cli_logins c where c.device_hash = p_device_hash for update;
  if not found then return; end if;
  if r.estado = 'aprobado' then
    update cli_logins c set estado = 'reclamado', secret_enc = null where c.id = r.id;
    return query select 'aprobado'::text, r.secret_enc, r.org_id;
  elsif r.estado = 'pendiente' and r.expira_at <= now() then
    return query select 'vencido'::text, null::text, null::uuid;
  else
    return query select r.estado, null::text, r.org_id;
  end if;
end $$;

revoke all on function cord_cli_login_start(text, text, text) from public;
revoke all on function cord_cli_login_find(text) from public;
revoke all on function cord_cli_login_decide(text, boolean, uuid, uuid, uuid, text) from public;
revoke all on function cord_cli_login_claim(text) from public;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'cord_app') then
    grant execute on function cord_cli_login_start(text, text, text) to cord_app;
    grant execute on function cord_cli_login_find(text) to cord_app;
    grant execute on function cord_cli_login_decide(text, boolean, uuid, uuid, uuid, text) to cord_app;
    grant execute on function cord_cli_login_claim(text) to cord_app;
  end if;
end $$;
-- END cli-logins

-- 2026-10-07: endurecimiento de Cord Ops.
--
-- 1. Passkeys PROPIAS de Ops. Hasta hoy el login de Ops aceptaba cualquier fila
--    de `passkeys`, las mismas que registra la app con rpID `cordhq.app` y una
--    sesión normal como única prueba. Quien robara una `cord_session` de un
--    operador (o lograra un XSS en el apex) registraba su propia llave y entraba
--    a Ops. Ahora Ops verifica contra `ops_passkeys`, registradas con rpID
--    `ops.cordhq.app` y solo desde una sesión Ops recién autenticada: una
--    credencial de la app es criptográficamente inútil aquí.
create table if not exists ops_passkeys (
  id            text        primary key,
  operator_id   uuid        not null references ops_operators(user_id) on delete cascade,
  public_key    text        not null,
  counter       bigint      not null default 0,
  transports    text[]      not null default '{}',
  device_type   text,
  backed_up     boolean     not null default false,
  nombre        text        check (nombre is null or char_length(nombre) <= 80),
  created_at    timestamptz not null default now(),
  last_used_at  timestamptz
);
create index if not exists idx_ops_passkeys_operator on ops_passkeys(operator_id);
alter table ops_passkeys enable row level security;
alter table ops_passkeys force row level security;

-- Las sesiones Ops abiertas con una passkey de la app dejan de ser válidas.
delete from ops_sessions s
 where s.auth_method = 'passkey'
   and not exists (select 1 from ops_passkeys p where p.id = s.credential_id);
alter table ops_sessions drop constraint if exists ops_sessions_credential_id_fkey;
alter table ops_sessions add constraint ops_sessions_credential_id_fkey
  foreign key (credential_id) references ops_passkeys(id) on delete cascade;

-- El reto WebAuthn declara para qué se emitió: uno de login no registra llaves.
alter table ops_passkey_challenges add column if not exists purpose text not null default 'login';
alter table ops_passkey_challenges drop constraint if exists ops_passkey_challenges_purpose_check;
alter table ops_passkey_challenges add constraint ops_passkey_challenges_purpose_check
  check (purpose in ('login', 'register'));

-- 2. Bloqueo PROPIO de Ops, separado del login de la app. Antes compartían
--    `users.failed_login_count`: cinco intentos en el login normal bloqueaban
--    Ops, y acertar la contraseña reiniciaba el contador ANTES del TOTP, así
--    que con la contraseña en mano el TOTP se podía adivinar sin bloquearse
--    nunca. Dos contadores: el de contraseña lo puede mover cualquiera; el de
--    TOTP solo quien ya demostró la contraseña, y por eso bloquea más duro.
alter table ops_operators add column if not exists failed_password_count int not null default 0;
alter table ops_operators add column if not exists password_locked_until timestamptz;
alter table ops_operators add column if not exists failed_totp_count int not null default 0;
alter table ops_operators add column if not exists totp_locked_until timestamptz;
-- Último paso TOTP aceptado: un código observado no se puede repetir.
alter table ops_operators add column if not exists totp_last_step bigint;

-- 3. La bitácora privilegiada es de solo agregar, no por disciplina de código.
--    Única excepción: el `on delete set null` del operador, que solo vacía
--    actor_operator_id (la atribución sobrevive en actor_email).
create or replace function ops_audit_log_append_only() returns trigger
language plpgsql as $$
begin
  if tg_op = 'UPDATE' then
    if old.actor_operator_id is not null and new.actor_operator_id is null
       and row(new.id, new.actor_email, new.action, new.target_type, new.target_id,
               new.result, new.metadata, new.ip, new.user_agent, new.created_at)
           is not distinct from
           row(old.id, old.actor_email, old.action, old.target_type, old.target_id,
               old.result, old.metadata, old.ip, old.user_agent, old.created_at)
    then
      return new;
    end if;
  end if;
  raise exception 'ops_audit_log es de solo agregar' using errcode = '42501';
end $$;
drop trigger if exists trg_ops_audit_log_append_only on ops_audit_log;
create trigger trg_ops_audit_log_append_only
  before update or delete on ops_audit_log
  for each row execute function ops_audit_log_append_only();
drop trigger if exists trg_ops_audit_log_no_truncate on ops_audit_log;
create trigger trg_ops_audit_log_no_truncate
  before truncate on ops_audit_log
  for each statement execute function ops_audit_log_append_only();
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'cord_app') then
    revoke update, delete, truncate on ops_audit_log from cord_app;
  end if;
end $$;

-- 4. El carril de Ops observa; no inserta dentro de una organización ajena.
--    Las políticas `rls_*` de estas tablas no tenían WITH CHECK, así que
--    Postgres reutilizaba USING —que incluía `app.scope='ops'`— también para
--    INSERT: con withOpsTx se podía crear una API key o un webhook en cualquier
--    organización. Ahora el inquilino conserva su política completa y Ops recibe
--    políticas por comando: SELECT para todo lo que lee, UPDATE solo donde
--    revoca (api_keys, webhooks, oauth_grants). Borrar una organización sigue
--    funcionando: la cascada de llaves foráneas no evalúa RLS.
drop policy if exists "rls_clientes" on clientes;
create policy "rls_clientes" on clientes
  using (
    org_id = nullif(current_setting('app.org_id', true), '')::uuid
    or current_setting('app.scope', true) = 'system'
  )
  with check (
    org_id = nullif(current_setting('app.org_id', true), '')::uuid
    or current_setting('app.scope', true) = 'system'
  );

drop policy if exists "rls_productos" on productos;
create policy "rls_productos" on productos
  using (org_id = nullif(current_setting('app.org_id', true), '')::uuid)
  with check (org_id = nullif(current_setting('app.org_id', true), '')::uuid);

drop policy if exists "rls_api_keys" on api_keys;
create policy "rls_api_keys" on api_keys
  using (org_id = nullif(current_setting('app.org_id', true), '')::uuid)
  with check (org_id = nullif(current_setting('app.org_id', true), '')::uuid);

drop policy if exists "rls_webhooks" on webhooks;
create policy "rls_webhooks" on webhooks
  using (org_id = nullif(current_setting('app.org_id', true), '')::uuid)
  with check (org_id = nullif(current_setting('app.org_id', true), '')::uuid);

drop policy if exists "rls_sso_connections" on sso_connections;
create policy "rls_sso_connections" on sso_connections
  using (org_id = nullif(current_setting('app.org_id', true), '')::uuid)
  with check (org_id = nullif(current_setting('app.org_id', true), '')::uuid);

do $$
declare t text;
begin
  foreach t in array array[
    'clientes', 'productos', 'api_keys', 'webhooks', 'sso_connections',
    'payouts', 'connect_personas', 'connect_kyc_evidencia', 'oauth_grants', 'cli_logins'
  ] loop
    continue when to_regclass(t) is null;
    execute format('drop policy if exists %I on %I', 'ops_' || t, t);
    execute format(
      'create policy %I on %I for select using (current_setting(''app.scope'', true) = ''ops'')',
      'ops_' || t, t);
  end loop;
  foreach t in array array['api_keys', 'webhooks', 'oauth_grants'] loop
    continue when to_regclass(t) is null;
    execute format('drop policy if exists %I on %I', 'ops_revoke_' || t, t);
    execute format(
      'create policy %I on %I for update using (current_setting(''app.scope'', true) = ''ops'') with check (current_setting(''app.scope'', true) = ''ops'')',
      'ops_revoke_' || t, t);
  end loop;
end $$;

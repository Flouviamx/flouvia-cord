-- BEGIN ops-fase6
-- 2026-10-08: "ver como" de Cord Ops — la app de un negocio en SOLO LECTURA.
-- Aditiva e idempotente: corre en cada build (scripts/migrate-ops.mjs).
--
-- Ops vive en ops.cordhq.app y la app en cordhq.app: las cookies son host-only
-- y no se comparten (regla 26). Ops emite un token de UN SOLO USO (90 s, se
-- guarda su sha256) y el apex lo canjea por una cookie PROPIA de vista, nunca
-- por una sesión normal: el operador no se vuelve miembro de nada, no hereda
-- la sesión de nadie y toda escritura responde 403 en el middleware.
--
-- Tabla de Cord sobre el negocio: RLS forzada; Ops la crea, la lista y la
-- termina en su carril; el apex solo la toca por las funciones de abajo, que
-- reciben hashes y nunca un token crudo.
create table if not exists ops_view_sessions (
  id                  uuid        primary key default gen_random_uuid(),
  org_id              uuid        not null references orgs(id) on delete cascade,
  operator_id         uuid        references ops_operators(user_id) on delete set null,
  operator_email      text        not null,
  reason              text        not null check (char_length(btrim(reason)) between 3 and 300),
  handoff_hash        text        not null unique check (handoff_hash ~ '^[a-f0-9]{64}$'),
  handoff_expires_at  timestamptz not null,
  session_hash        text        unique check (session_hash is null or session_hash ~ '^[a-f0-9]{64}$'),
  redeemed_at         timestamptz,
  expires_at          timestamptz not null,
  ended_at            timestamptz,
  ended_by            text,
  created_at          timestamptz not null default now(),
  check (handoff_expires_at > created_at),
  check (expires_at > created_at),
  check (redeemed_at is null or session_hash is not null)
);
create index if not exists idx_ops_view_sessions_org on ops_view_sessions(org_id, created_at desc);
do $$ begin
  if not exists (select 1 from pg_class where oid = 'ops_view_sessions'::regclass and relrowsecurity and relforcerowsecurity) then
    alter table ops_view_sessions enable row level security;
    alter table ops_view_sessions force row level security;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'ops_view_sessions' and policyname = 'ops_view_sessions_select') then
    create policy ops_view_sessions_select on ops_view_sessions for select using (current_setting('app.scope', true) = 'ops');
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'ops_view_sessions' and policyname = 'ops_view_sessions_insert') then
    create policy ops_view_sessions_insert on ops_view_sessions for insert with check (current_setting('app.scope', true) = 'ops');
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'ops_view_sessions' and policyname = 'ops_view_sessions_update') then
    create policy ops_view_sessions_update on ops_view_sessions for update
      using (current_setting('app.scope', true) = 'ops') with check (current_setting('app.scope', true) = 'ops');
  end if;
end $$;

-- 2. Canje. Marcar "usado" y leer van en el MISMO update: dos pestañas con el
--    mismo enlace no pueden canjearlo dos veces. La vista dura lo que se fijó
--    al crearla, contado desde el canje y nunca más allá de su tope. Solo un
--    admin activo canjea, y el canje y la salida quedan en ops_audit_log.
create or replace function cord_ops_view_redeem(p_handoff_hash text, p_session_hash text, p_ttl_minutes int)
returns table (id uuid, org_id uuid, operator_email text, expires_at timestamptz)
language sql volatile security definer
set search_path = public, pg_temp
as $$
  with redeemed as (
    update ops_view_sessions v
       set redeemed_at = now(),
           session_hash = p_session_hash,
           expires_at = least(v.expires_at, now() + make_interval(mins => greatest(1, least(p_ttl_minutes, 60))))
     where v.handoff_hash = p_handoff_hash
       and v.redeemed_at is null
       and v.ended_at is null
       and v.handoff_expires_at > now()
       and p_session_hash ~ '^[a-f0-9]{64}$'
       and exists (select 1 from ops_operators o join users u on u.id = o.user_id
                    where o.user_id = v.operator_id and o.active and o.role = 'admin' and u.suspended_at is null)
    returning v.id, v.org_id, v.operator_id, v.operator_email, v.expires_at
  ), audited as (
    insert into ops_audit_log (actor_operator_id, actor_email, action, target_type, target_id, result, metadata)
    select r.operator_id, r.operator_email, 'ops.view_as_redeemed', 'organization', r.org_id::text, 'success',
           jsonb_build_object('view', r.id)
      from redeemed r
  )
  select r.id, r.org_id, r.operator_email, r.expires_at from redeemed r;
$$;

-- 3. Resolver la cookie de vista en cada request: solo una vista canjeada,
--    vigente y no terminada, de un operador que SIGUE siendo admin activo y sin
--    suspender: bajarlo de rol, desactivarlo o suspenderlo corta sus vistas. La app corre la vista con la identidad
--    del OPERADOR (sin membresía), nunca con la del dueño del negocio.
create or replace function cord_ops_view_resolve(p_session_hash text)
returns table (id uuid, org_id uuid, operator_id uuid, operator_email text, expires_at timestamptz)
language sql stable security definer
set search_path = public, pg_temp
as $$
  select v.id, v.org_id, v.operator_id, v.operator_email, v.expires_at
    from ops_view_sessions v
    join ops_operators o on o.user_id = v.operator_id and o.active and o.role = 'admin'
    join users u on u.id = o.user_id and u.suspended_at is null
   where v.session_hash = p_session_hash
     and v.redeemed_at is not null
     and v.ended_at is null
     and v.expires_at > now()
   limit 1;
$$;

-- 4. Salir de la vista desde la propia app.
create or replace function cord_ops_view_end(p_session_hash text)
returns void
language sql volatile security definer
set search_path = public, pg_temp
as $$
  with ended as (
    update ops_view_sessions set ended_at = now(), ended_by = 'operador'
     where session_hash = p_session_hash and ended_at is null
    returning id, org_id, operator_id, operator_email
  )
  insert into ops_audit_log (actor_operator_id, actor_email, action, target_type, target_id, result, metadata)
  select e.operator_id, e.operator_email, 'ops.view_as_ended', 'organization', e.org_id::text, 'success',
         jsonb_build_object('view', e.id, 'desde', 'app')
    from ended e;
$$;

revoke all on function cord_ops_view_redeem(text, text, int) from public;
revoke all on function cord_ops_view_resolve(text) from public;
revoke all on function cord_ops_view_end(text) from public;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'cord_app') then
    grant execute on function cord_ops_view_redeem(text, text, int) to cord_app;
    grant execute on function cord_ops_view_resolve(text) to cord_app;
    grant execute on function cord_ops_view_end(text) to cord_app;
  end if;
end $$;
-- END ops-fase6

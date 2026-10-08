-- BEGIN ops-fase5
-- 2026-10-08: cortesías de Cord Ops — días gratis y planes regalados.
-- Aditiva e idempotente: corre en cada build (scripts/migrate-ops.mjs).
--
-- Un regalo NO es evidencia de pago, y por eso no se escribe en orgs:
-- `billing_paid_through` y compañía las escribe solo una factura cobrada
-- (regla 17), y la reconciliación diaria borra cualquier sello que no la
-- tenga. El regalo vive aparte, con vencimiento, y da ACCESO; Stripe, cuando
-- aplica, solo deja de cobrar (prueba extendida o cupón sobre el precio base).
--
-- 1. Cortesías. Una sola viva por organización: para cambiarla se revoca y se
--    da otra. Tabla de Cord sobre el negocio: RLS forzada y solo el carril de
--    Ops la escribe; la app la lee con cord_access_grant().
create table if not exists ops_plan_grants (
  id                      uuid        primary key default gen_random_uuid(),
  org_id                  uuid        not null references orgs(id) on delete cascade,
  plan                    text        not null check (plan in ('starter', 'pro', 'scale', 'developer')),
  kind                    text        not null check (kind in ('dias', 'plan')),
  mechanism               text        not null check (mechanism in ('acceso', 'trial', 'cupon')),
  starts_at               timestamptz not null default now(),
  expires_at              timestamptz not null,
  status                  text        not null default 'active' check (status in ('active', 'expired', 'revoked')),
  reason                  text        not null check (char_length(btrim(reason)) between 3 and 300),
  operator_id             uuid        references ops_operators(user_id) on delete set null,
  operator_email          text        not null,
  stripe_subscription_id  text,
  stripe_coupon_id        text,
  -- Fin de periodo que ya había pagado antes de mover su cobro (mecanismo
  -- trial): revocar regresa el cobro AQUÍ, nunca antes. Sin esto, revocar
  -- cobraba de inmediato un periodo nuevo y perdía lo ya pagado.
  original_period_end     timestamptz,
  created_at              timestamptz not null default now(),
  revoked_at              timestamptz,
  revoked_by              text,
  check (expires_at > starts_at),
  check (status <> 'revoked' or revoked_at is not null)
);
create unique index if not exists uq_ops_plan_grants_active on ops_plan_grants(org_id) where status = 'active';
create index if not exists idx_ops_plan_grants_org on ops_plan_grants(org_id, created_at desc);
-- El `alter` solo si hace falta: toma ACCESS EXCLUSIVE aunque no cambie nada,
-- y cord_access_grant() lee esta tabla en cada request.
do $$ begin
  if not exists (select 1 from pg_class where oid = 'ops_plan_grants'::regclass and relrowsecurity and relforcerowsecurity) then
    alter table ops_plan_grants enable row level security;
    alter table ops_plan_grants force row level security;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'ops_plan_grants' and policyname = 'ops_plan_grants_select') then
    create policy ops_plan_grants_select on ops_plan_grants for select using (current_setting('app.scope', true) = 'ops');
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'ops_plan_grants' and policyname = 'ops_plan_grants_insert') then
    create policy ops_plan_grants_insert on ops_plan_grants for insert with check (current_setting('app.scope', true) = 'ops');
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'ops_plan_grants' and policyname = 'ops_plan_grants_update') then
    create policy ops_plan_grants_update on ops_plan_grants for update
      using (current_setting('app.scope', true) = 'ops') with check (current_setting('app.scope', true) = 'ops');
  end if;
end $$;

-- 2. El mejor acceso sin cobro vigente de una organización (o de su padre si
--    es sandbox): cortesía de Ops o promoción de The Cord Build. Lo leen
--    cord_effective_plan() y getEntitlementContext(), así las dos fuentes de
--    verdad no divergen (antes la promoción daba Scale en SQL y Gratis en TS).
create or replace function cord_access_grant(p_org uuid)
returns table (plan text, expires_at timestamptz, source text, mechanism text)
language sql stable security definer
set search_path = public, pg_temp
as $$
  with billing as (select coalesce(sandbox_of, id) as id from orgs where id = p_org),
  grants as (
    select g.plan, g.expires_at, 'ops'::text as source, g.mechanism
      from ops_plan_grants g join billing b on g.org_id = b.id
     where g.status = 'active' and g.starts_at <= now() and g.expires_at > now()
    union all
    select 'scale', e.expires_at, 'build', 'promo'
      from build_scale_entitlements e join billing b on e.org_id = b.id
     where e.status = 'active' and e.starts_at <= now() and e.expires_at > now()
  )
  select plan, expires_at, source, mechanism from grants
  order by case plan when 'developer' then 4 when 'scale' then 3 when 'pro' then 2 when 'starter' then 1 else 0 end desc,
           expires_at desc
  limit 1
$$;
revoke all on function cord_access_grant(uuid) from public;

-- 3. El plan efectivo suma la cortesía. Mismo contrato que antes para el
--    acceso pagado; solo cambia de dónde sale el acceso sin cobro.
create or replace function cord_effective_plan(p_org uuid)
returns text
language sql stable security definer
set search_path = public, pg_temp
as $$
  with requested as (
    select coalesce(sandbox_of, id) as billing_org_id
      from orgs where id = p_org
  ), billing as (
    select r.billing_org_id, case
      when lower(coalesce(o.plan, 'free')) in ('business', 'negocio') then 'pro'
      when lower(coalesce(o.plan, 'free')) in ('free', 'starter', 'pro', 'scale', 'developer')
        then lower(coalesce(o.plan, 'free'))
      else 'free'
    end as stored_plan,
    o.subscription_status, o.current_period_end, o.billing_paid_through,
    case
      when lower(coalesce(o.billing_paid_plan, 'free')) in ('business', 'negocio') then 'pro'
      when lower(coalesce(o.billing_paid_plan, 'free')) in ('free', 'starter', 'pro', 'scale', 'developer')
        then lower(coalesce(o.billing_paid_plan, 'free'))
      else 'free'
    end as paid_plan,
    o.stripe_subscription_id, o.stripe_customer_id
    from requested r join orgs o on o.id = r.billing_org_id
  ), access as (
    select billing_org_id, case
    when stored_plan <> 'free' and subscription_status = 'active'
      and current_period_end is not null and current_period_end > now()
      and billing_paid_through is not null and billing_paid_through >= current_period_end
      and (case paid_plan when 'developer' then 4 when 'scale' then 3 when 'pro' then 2 when 'starter' then 1 else 0 end)
          >= (case stored_plan when 'developer' then 4 when 'scale' then 3 when 'pro' then 2 when 'starter' then 1 else 0 end)
      and stripe_subscription_id is not null and stripe_customer_id is not null
      then stored_plan
    else 'free'
    end as paid_access
    from billing
  ), effective as (
    -- Acceso sin cobro: la promoción de The Cord Build o una cortesía de Ops
    -- vigente, el mejor de los dos (cord_access_grant). Da acceso; no es pago.
    select paid_access, coalesce((select g.plan from cord_access_grant(p_org) g), 'free') as promo_access
    from access
  )
  select case
    when (case paid_access when 'developer' then 4 when 'scale' then 3 when 'pro' then 2 when 'starter' then 1 else 0 end)
       >= (case promo_access when 'developer' then 4 when 'scale' then 3 when 'pro' then 2 when 'starter' then 1 else 0 end)
      then paid_access else promo_access end
  from effective
$$;
revoke all on function cord_effective_plan(uuid) from public;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'cord_app') then
    grant execute on function cord_access_grant(uuid) to cord_app;
    grant execute on function cord_effective_plan(uuid) to cord_app;
  end if;
end $$;
-- END ops-fase5

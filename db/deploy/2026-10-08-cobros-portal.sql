-- Portal del cliente, cobro agrupado, cobro automático y domiciliación
-- (oct 2026). Aditiva e idempotente; cada sentencia es espejo LITERAL de
-- db/schema.sql (sección "PORTAL DEL CLIENTE…"). Corre antes del build: el
-- código que lee estas columnas no llega a producción sin ellas.

alter table clientes add column if not exists portal_token text;

alter table clientes add column if not exists portal_token_at timestamptz;

create unique index if not exists uq_clientes_portal_token on clientes(portal_token) where portal_token is not null;

alter table clientes add column if not exists stripe_customer_id text;

alter table clientes add column if not exists stripe_customer_account text;

alter table clientes add column if not exists autopay_activo boolean not null default false;

alter table clientes add column if not exists autopay_payment_method_id text;

alter table clientes add column if not exists autopay_metodo jsonb;

alter table clientes add column if not exists autopay_consentimiento jsonb;

alter table clientes add column if not exists autopay_consentimiento_pendiente jsonb;

alter table clientes add column if not exists autopay_desactivado jsonb;

alter table orgs add column if not exists acepta_domiciliacion boolean not null default false;

alter table orgs add column if not exists cobro_automatico_permitido boolean not null default true;

alter table orgs add column if not exists stripe_capacidades jsonb not null default '{}'::jsonb;

alter table documentos_fiscales add column if not exists pago_en_proceso_pi text;

alter table documentos_fiscales add column if not exists pago_en_proceso_at timestamptz;

create table if not exists pagos_agrupados (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  cliente_id uuid references clientes(id) on delete set null,
  origen text not null check (origen in ('portal', 'automatico')),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  monto numeric not null check (monto > 0),
  stripe_payment_intent_id text,
  estado text not null default 'creado' check (estado in ('creado', 'procesando', 'pagado', 'fallido', 'cancelado')),
  metodo text,
  error_codigo text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists uq_pagos_agrupados_pi on pagos_agrupados(org_id, stripe_payment_intent_id) where stripe_payment_intent_id is not null;

create unique index if not exists uq_pagos_agrupados_automatico_vivo on pagos_agrupados(org_id, cliente_id, currency) where origen = 'automatico' and estado in ('creado', 'procesando');

create index if not exists idx_pagos_agrupados_cliente on pagos_agrupados(org_id, cliente_id, created_at desc);

create table if not exists pago_agrupado_documentos (
  pago_id uuid not null references pagos_agrupados(id) on delete cascade,
  org_id uuid not null references orgs(id) on delete cascade,
  documento_id uuid not null references documentos_fiscales(id) on delete cascade,
  monto numeric not null check (monto > 0),
  primary key (pago_id, documento_id)
);

create index if not exists idx_pago_agrupado_documentos_doc on pago_agrupado_documentos(org_id, documento_id);

create table if not exists cobro_automatico_estado (
  org_id uuid not null references orgs(id) on delete cascade,
  cliente_id uuid not null references clientes(id) on delete cascade,
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  intentos int not null default 0,
  primer_intento_at timestamptz,
  siguiente_at timestamptz,
  ultimo_codigo text,
  ultimo_at timestamptz,
  detenido_motivo text check (detenido_motivo is null or detenido_motivo in ('metodo_invalido', 'requiere_autenticacion', 'mandato_revocado', 'bloqueado', 'agotado')),
  updated_at timestamptz not null default now(),
  primary key (org_id, cliente_id, currency)
);

create table if not exists documento_reembolso_asignaciones (
  org_id uuid not null references orgs(id) on delete cascade,
  stripe_refund_id text not null,
  documento_id uuid not null references documentos_fiscales(id) on delete cascade,
  monto numeric not null check (monto > 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  created_at timestamptz not null default now(),
  primary key (org_id, stripe_refund_id, documento_id)
);

create index if not exists idx_documento_reembolso_asignaciones_doc on documento_reembolso_asignaciones(org_id, documento_id);

alter table pagos_agrupados enable row level security;

alter table pagos_agrupados force row level security;

drop policy if exists rls_pagos_agrupados on pagos_agrupados;

create policy rls_pagos_agrupados on pagos_agrupados
  using (org_id = nullif(current_setting('app.org_id', true), '')::uuid)
  with check (org_id = nullif(current_setting('app.org_id', true), '')::uuid);

drop policy if exists system_pagos_agrupados on pagos_agrupados;

create policy system_pagos_agrupados on pagos_agrupados
  for select using (current_setting('app.scope', true) = 'system');

alter table pago_agrupado_documentos enable row level security;

alter table pago_agrupado_documentos force row level security;

drop policy if exists rls_pago_agrupado_documentos on pago_agrupado_documentos;

create policy rls_pago_agrupado_documentos on pago_agrupado_documentos
  using (org_id = nullif(current_setting('app.org_id', true), '')::uuid)
  with check (org_id = nullif(current_setting('app.org_id', true), '')::uuid);

alter table cobro_automatico_estado enable row level security;

alter table cobro_automatico_estado force row level security;

drop policy if exists rls_cobro_automatico_estado on cobro_automatico_estado;

create policy rls_cobro_automatico_estado on cobro_automatico_estado
  using (org_id = nullif(current_setting('app.org_id', true), '')::uuid)
  with check (org_id = nullif(current_setting('app.org_id', true), '')::uuid);

drop policy if exists system_cobro_automatico_estado on cobro_automatico_estado;

create policy system_cobro_automatico_estado on cobro_automatico_estado
  for select using (current_setting('app.scope', true) = 'system');

alter table documento_reembolso_asignaciones enable row level security;

alter table documento_reembolso_asignaciones force row level security;

drop policy if exists rls_documento_reembolso_asignaciones on documento_reembolso_asignaciones;

create policy rls_documento_reembolso_asignaciones on documento_reembolso_asignaciones
  using (org_id = nullif(current_setting('app.org_id', true), '')::uuid)
  with check (org_id = nullif(current_setting('app.org_id', true), '')::uuid);

create or replace function cord_resolve_portal(p_token text)
returns table(cliente_id uuid, org_id uuid)
language sql stable security definer
set search_path = public, pg_temp
as $$
  select c.id, c.org_id from clientes c
   where p_token is not null and length(p_token) >= 32
     and c.portal_token = p_token
   limit 1
$$;

revoke all on function cord_resolve_portal(text) from public;

do $$ begin
  if exists (select 1 from pg_roles where rolname = 'cord_app') then
    grant execute on function cord_resolve_portal(text) to cord_app;
    grant select, insert, update, delete on pagos_agrupados, pago_agrupado_documentos, cobro_automatico_estado, documento_reembolso_asignaciones to cord_app;
  end if;
end $$;

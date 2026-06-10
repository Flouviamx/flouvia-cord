-- ============================================================
-- Trato — schema multi-tenant (Supabase / PostgreSQL)
-- PK de relación: org_id (NO email_cliente como el portal de flouvia-web).
-- Cada negocio que se registra es una org; todo cuelga de ahí.
-- Patrón RLS: org_id = current_setting('app.org_id', TRUE)::uuid
-- (el backend setea el valor antes de cada query, igual que en flouvia-web)
-- ============================================================

-- ── Organizaciones (un negocio = una org; v1: 1 usuario Clerk por org) ──
create table orgs (
  id                  uuid        default gen_random_uuid() primary key,
  clerk_user_id       text        not null unique,   -- v1: dueño único; multi-usuario en fase 2 con Clerk Organizations
  nombre              text        not null,
  logo_url            text,
  rfc                 text,
  razon_social        text,
  regimen_fiscal      text,
  cp_fiscal           text,
  quote_prefix        text        not null default 'COT',  -- folio: COT-0001…
  moneda              text        not null default 'MXN',
  iva_pct             numeric     not null default 16,
  plan                text        not null default 'free', -- 'free' | 'basico' | 'pro'
  stripe_customer_id  text,
  stripe_subscription_id text,
  created_at          timestamptz default now()
);

-- ── Catálogo de productos de cada org ──
create table productos (
  id            uuid        default gen_random_uuid() primary key,
  org_id        uuid        not null references orgs(id) on delete cascade,
  sku           text,
  nombre        text        not null,
  descripcion   text,
  precio_lista  numeric     not null default 0,
  unidad        text        not null default 'pieza',
  activo        boolean     not null default true,
  created_at    timestamptz default now()
);
create index on productos(org_id, activo);

-- ── Clientes de cada org (a quién se cotiza) ──
create table clientes (
  id                uuid        default gen_random_uuid() primary key,
  org_id            uuid        not null references orgs(id) on delete cascade,
  empresa           text        not null,
  contacto          text,
  email             text,
  telefono          text,
  rfc               text,
  terminos_default  text        not null default 'contado',  -- 'contado' | 'net30' | 'net60'
  limite_credito    numeric,
  created_at        timestamptz default now()
);
create index on clientes(org_id, empresa);

-- ── Cotizaciones ──
create table cotizaciones (
  id            uuid        default gen_random_uuid() primary key,
  org_id        uuid        not null references orgs(id) on delete cascade,
  cliente_id    uuid        references clientes(id) on delete set null,
  folio         text        not null,                -- COT-0001 (prefix de la org + secuencia)
  status        text        not null default 'draft',
  -- draft | sent | viewed | approved | rejected | expired | paid | invoiced
  subtotal      numeric     not null default 0,
  descuento     numeric     not null default 0,
  iva           numeric     not null default 0,
  total         numeric     not null default 0,
  moneda        text        not null default 'MXN',
  terminos      text        not null default 'contado', -- 'contado' | 'net30' | 'net60'
  vigencia      date,                                 -- fecha de expiración
  public_token  text        not null unique default encode(gen_random_bytes(16), 'hex'), -- /q/{token}
  notas         text,
  created_at    timestamptz default now(),
  sent_at       timestamptz,
  approved_at   timestamptz
);
create index on cotizaciones(org_id, status, created_at desc);
create index on cotizaciones(public_token);

-- ── Líneas de cada cotización ──
create table cotizacion_items (
  id                uuid        default gen_random_uuid() primary key,
  cotizacion_id     uuid        not null references cotizaciones(id) on delete cascade,
  producto_id       uuid        references productos(id) on delete set null,
  descripcion       text        not null,             -- línea libre permitida (sin producto)
  cantidad          numeric     not null default 1,
  precio_unitario   numeric     not null default 0,   -- precio de lista al momento de cotizar
  precio_negociado  numeric,                          -- null = sin negociar (usa el de lista)
  descuento_pct     numeric     not null default 0,
  orden             int         not null default 0
);
create index on cotizacion_items(cotizacion_id, orden);

-- ── Timeline de eventos (alimenta "tu cliente vio la cotización" + activity feed) ──
create table eventos (
  id              uuid        default gen_random_uuid() primary key,
  org_id          uuid        not null references orgs(id) on delete cascade,
  cotizacion_id   uuid        references cotizaciones(id) on delete cascade,
  tipo            text        not null,
  -- created | sent | viewed | approved | rejected | expired | paid | invoiced | comment
  detalle         text,
  created_at      timestamptz default now()
);
create index on eventos(org_id, created_at desc);
create index on eventos(cotizacion_id, created_at desc);

-- ── Facturas CFDI timbradas (fase 4 — reusa el PAC de la app de Shopify) ──
create table facturas_cfdi (
  id              uuid        default gen_random_uuid() primary key,
  org_id          uuid        not null references orgs(id) on delete cascade,
  cotizacion_id   uuid        not null references cotizaciones(id) on delete cascade,
  uuid_sat        text,
  xml_url         text,
  pdf_url         text,
  status          text        not null default 'pending', -- pending | stamped | cancelled | error
  created_at      timestamptz default now()
);
create index on facturas_cfdi(org_id, created_at desc);

-- ============================================================
-- Trato — schema multi-tenant (Neon / PostgreSQL)
-- PK de relación: org_id (NO email_cliente como el portal de flouvia-web).
-- Cada negocio que se registra es una org; todo cuelga de ahí.
-- Patrón RLS: org_id = current_setting('app.org_id', TRUE)::uuid
-- (el backend setea el valor antes de cada query, igual que en flouvia-web)
-- ============================================================

-- Extensión para gen_random_bytes() (tokens públicos). gen_random_uuid() ya es nativo.
create extension if not exists pgcrypto;

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

-- ── Personalización de marca y PDF (jun 2026) ──
-- Se aplican con `alter ... if not exists` para que db:migrate siga siendo re-ejecutable.
alter table orgs add column if not exists color_marca text not null default '#0a192f';
alter table orgs add column if not exists email_contacto text;
alter table orgs add column if not exists telefono text;
alter table orgs add column if not exists direccion text;
alter table orgs add column if not exists pdf_mensaje text;
alter table orgs add column if not exists pdf_condiciones text;
alter table orgs add column if not exists pdf_mostrar_lista boolean not null default true;

-- Plantilla del documento PDF (jun 2026): clasico | minimal | detallado.
-- logo_url ya existe arriba; ahora también guarda data URLs de logos subidos.
alter table orgs add column if not exists pdf_template text not null default 'clasico';

-- Presencia en vivo del link público (jun 2026): última vez que el cliente tuvo
-- /q/[token] abierto. El vendedor ve "lo está viendo ahora" si fue hace <30s.
alter table cotizaciones add column if not exists viewer_last_seen timestamptz;

-- Tareas / recordatorios (CRM ligero, jun 2026).
create table if not exists tareas (
  id            uuid        default gen_random_uuid() primary key,
  org_id        uuid        not null references orgs(id) on delete cascade,
  cotizacion_id uuid        references cotizaciones(id) on delete set null,
  titulo        text        not null,
  due_date      date,
  done          boolean     not null default false,
  created_at    timestamptz default now()
);
create index if not exists idx_tareas_org on tareas(org_id, done, due_date);

-- ── Fase enterprise (jun 2026) ──────────────────────────────────────────────
-- 1) Listas de precio por nivel de cliente (descuento automático).
alter table clientes add column if not exists nivel text not null default 'estandar'; -- estandar | plata | oro | distribuidor
alter table clientes add column if not exists descuento_pct numeric not null default 0; -- % de descuento automático del nivel

-- 2) Flujos de aprobación: umbrales por org + estado de aprobación por cotización.
alter table orgs add column if not exists aprob_descuento_max numeric not null default 0; -- % de descuento que dispara aprobación (0 = sin tope)
alter table orgs add column if not exists aprob_monto_max numeric not null default 0;     -- total que dispara aprobación (0 = sin tope)
alter table cotizaciones add column if not exists aprob_estado text;  -- null | pendiente | aprobada | rechazada
alter table cotizaciones add column if not exists aprob_motivo text;  -- por qué requirió aprobación

-- 3) Tesorería: tasa de interés moratorio mensual de la org.
alter table orgs add column if not exists interes_moratorio_pct numeric not null default 0; -- % mensual compuesto sobre saldo vencido

-- 4) Audit log inmutable.
create table if not exists audit_log (
  id          uuid        default gen_random_uuid() primary key,
  org_id      uuid        not null references orgs(id) on delete cascade,
  actor       text,                       -- usuario (demo: 'demo-user'); Clerk en fase 2
  accion      text        not null,       -- p. ej. 'cotizacion.aprobada'
  entidad     text,                       -- 'cotizacion' | 'org' | 'cliente' | 'producto'
  entidad_id  text,
  detalle     text,                       -- descripción legible / antes→después
  ip          text,
  created_at  timestamptz default now()
);
create index if not exists idx_audit_org on audit_log(org_id, created_at desc);

-- ── Superpoderes de configuración (jun 2026) ────────────────────────────────
-- Defaults de cotización (los usa el editor /nueva y el POST de cotizaciones).
alter table orgs add column if not exists vigencia_default_dias int not null default 30; -- días de vigencia por default
alter table orgs add column if not exists terminos_default text not null default 'contado'; -- contado | net30 | net60
-- Retenciones e impuestos avanzados (servicios / CFDI) + leyenda legal del PDF.
alter table orgs add column if not exists retencion_isr_pct numeric not null default 0; -- % retención de ISR
alter table orgs add column if not exists retencion_iva_pct numeric not null default 0; -- % retención de IVA
alter table orgs add column if not exists texto_legal text; -- leyenda legal default (va al PDF)
-- Marca: presencia en línea.
alter table orgs add column if not exists sitio_web text;
alter table orgs add column if not exists whatsapp text; -- número para el botón de WhatsApp
-- Fiscales SAT (alimentan CFDI 4.0 a futuro).
alter table orgs add column if not exists regimen_fiscal text;  -- código c_RegimenFiscal (ej. 601)
alter table orgs add column if not exists uso_cfdi text;        -- código c_UsoCFDI default (ej. G03)
alter table orgs add column if not exists cp_fiscal text;       -- lugar de expedición (CP)
alter table orgs add column if not exists serie_folio text;     -- serie de folio (ej. A, COT)

-- ── Equipo y roles (multi-usuario por org, jun 2026) ────────────────────────
-- Membresía de usuarios Clerk a una org + permisos por sección (custom).
-- El owner se siembra como miembro rol='owner' (permisos totales, override).
-- Invitación por TOKEN (link): clerk_user_id queda null hasta que la persona
-- inicia sesión y acepta en /unirse/{token}.
create table if not exists org_members (
  id            uuid        default gen_random_uuid() primary key,
  org_id        uuid        not null references orgs(id) on delete cascade,
  clerk_user_id text,                                  -- null mientras está invitado
  email         text,                                  -- correo de invitación (display)
  nombre        text,                                  -- nombre para mostrar (opcional)
  rol           text        not null default 'miembro', -- owner | admin | vendedor | lectura | miembro
  permisos      jsonb       not null default '{}'::jsonb, -- { cotizar:true, aprobar:false, ... }
  estado        text        not null default 'invitado', -- invitado | activo | revocado
  token         text        unique,                    -- token del link de invitación
  invited_by    text,
  created_at    timestamptz default now(),
  joined_at     timestamptz
);
create index if not exists idx_members_user on org_members(clerk_user_id) where clerk_user_id is not null;
create index if not exists idx_members_org on org_members(org_id);
create unique index if not exists uq_members_org_user on org_members(org_id, clerk_user_id) where clerk_user_id is not null;

-- Sembrar al owner existente de cada org como miembro 'owner' (idempotente).
insert into org_members (org_id, clerk_user_id, rol, estado, joined_at)
select id, clerk_user_id, 'owner', 'activo', now() from orgs
where clerk_user_id is not null
on conflict do nothing;

-- ── Centro de mando Enterprise — Ajustes ampliados (jun 2026) ───────────────
-- General: localización del negocio.
alter table orgs add column if not exists zona_horaria text not null default 'America/Mexico_City';
alter table orgs add column if not exists idioma text not null default 'es-MX';
-- Branding: identidad del portal de cliente (/q/{token}).
alter table orgs add column if not exists color_secundario text;     -- acento secundario del portal
alter table orgs add column if not exists portal_bienvenida text;    -- mensaje de bienvenida en el link público
-- Notificaciones: matriz evento → canal (jsonb) + webhook de Slack.
alter table orgs add column if not exists notif_prefs jsonb not null default '{}'::jsonb;
alter table orgs add column if not exists slack_webhook_url text;
-- Integraciones: qué conectores están activados (jsonb, maqueta que persiste).
alter table orgs add column if not exists integraciones jsonb not null default '{}'::jsonb;
-- Facturación/CFDI: estado del CSD (maqueta — el archivo real llega con el PAC).
alter table orgs add column if not exists csd_estado text;           -- null | cargado | vencido
alter table orgs add column if not exists csd_nombre text;           -- nombre del .cer cargado (display)
alter table orgs add column if not exists csd_subido_at timestamptz;

-- ── Developers — API keys (REAL, con hash) ──────────────────────────────────
-- La clave en claro se muestra UNA sola vez al crearla; en DB sólo vive el hash
-- sha-256. `prefix` (sk_live_xxxx) y `last4` son lo único legible después.
create table if not exists api_keys (
  id          uuid        default gen_random_uuid() primary key,
  org_id      uuid        not null references orgs(id) on delete cascade,
  nombre      text        not null,                 -- etiqueta ('Producción', 'Zapier'…)
  prefix      text        not null,                 -- parte visible ('sk_live_a1b2c3')
  last4       text        not null,                 -- últimos 4 (display)
  hash        text        not null,                 -- sha-256(clave completa)
  scope       text        not null default 'read',  -- read | write (maqueta)
  created_by  text,
  created_at  timestamptz default now(),
  last_used_at timestamptz,
  revoked_at  timestamptz
);
create index if not exists idx_apikeys_org on api_keys(org_id, created_at desc);
-- Modo sandbox/test (jun 2026): las llaves sk_test_ no tocan datos reales y NO
-- requieren plan Negocio (libres para probar). sk_live_ sí están gated.
alter table api_keys add column if not exists mode text not null default 'live';  -- live | test

-- ── Seguridad de la organización (jun 2026) ─────────────────────────────────
alter table orgs add column if not exists require_2fa boolean not null default false;     -- exigir 2FA a todo el equipo
alter table orgs add column if not exists session_timeout_min int not null default 0;     -- minutos de inactividad (0 = sin límite)
alter table orgs add column if not exists invite_domains text;                             -- dominios permitidos para invitar (coma-sep); null = cualquiera

-- ── Plantillas de mensaje reutilizables (jun 2026) ──────────────────────────
-- Para WhatsApp/correo/notas al enviar cotizaciones. Variables: {cliente} {folio}
-- {total} {link} {vigencia} {empresa}.
create table if not exists plantillas_mensaje (
  id          uuid        default gen_random_uuid() primary key,
  org_id      uuid        not null references orgs(id) on delete cascade,
  nombre      text        not null,
  canal       text        not null default 'whatsapp',  -- whatsapp | email | nota
  cuerpo      text        not null,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);
create index if not exists idx_plantillas_org on plantillas_mensaje(org_id, canal);

-- ── TRATO Elements — embed del cotizador en sitios de terceros ───────────────
-- Allowlist de dominios autorizados a embeber /embed/[token] vía <iframe>. Se usa
-- para el header CSP `frame-ancestors` (anti-clickjacking). Lista separada por
-- comas o saltos de línea (ej. "cliente-a.com, app.cliente-b.com"). Vacío =
-- framing abierto (modo "Powered by Trato", útil para demo y plan gratis).
alter table orgs add column if not exists embed_domains text not null default '';

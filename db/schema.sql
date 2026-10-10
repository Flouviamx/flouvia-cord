-- ============================================================
-- Cord — schema multi-tenant (Neon / PostgreSQL)
-- PK de relación: org_id (NO email_cliente como el portal de flouvia-web).
-- Cada negocio que se registra es una org; todo cuelga de ahí.
-- Patrón RLS: org_id = current_setting('app.org_id', TRUE)::uuid
-- (el backend setea el valor antes de cada query, igual que en flouvia-web)
-- ============================================================

-- Extensión para gen_random_bytes() (tokens públicos). gen_random_uuid() ya es nativo.
create extension if not exists pgcrypto;

-- ── Custom Auth (Fase 2) ──
create table users (
  id            uuid        default gen_random_uuid() primary key,
  email         text        not null unique,
  first_name    text,
  last_name     text,
  password_hash text,       -- Argon2id hash
  totp_secret   text,       -- opcional
  totp_enabled  boolean     not null default false,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);
-- Tokens de reseteo de contraseña (15 minutos de validez)
create table if not exists password_reset_tokens (
  id            text        primary key, -- token seguro
  user_id       uuid        not null references users(id) on delete cascade,
  expires_at    timestamptz not null,
  created_at    timestamptz default now()
);
create index if not exists idx_reset_token_user on password_reset_tokens(user_id);

create table sessions (
  id            text        primary key, -- token generado criptográficamente
  user_id       uuid        not null references users(id) on delete cascade,
  expires_at    timestamptz not null,
  ip            text,
  user_agent    text,
  created_at    timestamptz default now()
);

-- Cuentas OAuth vinculadas a un usuario (Google, Apple, etc.)
create table if not exists oauth_accounts (
  id                text        primary key default gen_random_uuid()::text,
  user_id           uuid        not null references users(id) on delete cascade,
  provider          text        not null, -- 'google' | 'apple'
  provider_user_id  text        not null,
  email             text,
  created_at        timestamptz default now(),
  unique (provider, provider_user_id)
);
create index if not exists idx_oauth_user on oauth_accounts(user_id);

-- Credenciales de Passkeys / WebAuthn (biometría)
create table if not exists passkeys (
  id                text        primary key, -- credentialID en base64url
  user_id           uuid        not null references users(id) on delete cascade,
  public_key        text        not null,    -- COSE public key en base64url
  counter           bigint      not null default 0,
  device_type       text        not null default 'singleDevice',
  backed_up         boolean     not null default false,
  transports        text[],
  name              text,                   -- nombre descriptivo del dispositivo
  created_at        timestamptz default now(),
  last_used_at      timestamptz
);
create index if not exists idx_passkeys_user on passkeys(user_id);

-- ── Organizaciones (un negocio = una org) ──
create table orgs (
  id                  uuid        default gen_random_uuid() primary key,
  owner_id            uuid        references users(id) on delete set null, -- v1: dueño único
  nombre              text        not null,
  logo_url            text,
  rfc                 text,              -- v1 (MX) -> En el futuro abstraer a tax_id
  razon_social        text,
  regimen_fiscal      text,
  cp_fiscal           text,
  country_code        text        not null default 'MX', -- ISO 3166-1 alpha-2
  fiscal_metadata     jsonb       not null default '{}'::jsonb, -- Datos específicos del país
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
  terminos_default  text        not null default 'contado',  -- 'contado' | 'net<N>' (src/lib/payment-terms.ts)
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
  moneda        text        not null default 'MXN', -- Obsoleto, usar base_currency a futuro
  base_currency text        not null default 'MXN', -- Moneda de presentación (ej. USD)
  fiscal_currency text      not null default 'MXN', -- Moneda contable/fiscal (ej. MXN)
  fx_rate       numeric     not null default 1,     -- Tipo de cambio aplicado
  fx_rate_source text       not null default 'spot',-- 'spot' | 'buffer' | 'forward'
  fx_locked_until timestamptz,                      -- Fecha de expiración de cobertura
  terminos      text        not null default 'contado', -- 'contado' | 'net<N>' (src/lib/payment-terms.ts)
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
-- (Legado / Específico de México)
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

-- ── Documentos Fiscales Globales (Abstracción B2B Internacional) ──
create table if not exists documentos_fiscales (
  id              uuid        default gen_random_uuid() primary key,
  org_id          uuid        not null references orgs(id) on delete cascade,
  cotizacion_id   uuid        not null references cotizaciones(id) on delete cascade,
  country_code    text        not null default 'MX', -- MX, US, ES, CO
  document_type   text        not null,              -- 'invoice', 'cfdi_40', 'dian_einvoice'
  fiscal_id       text,                              -- UUID SAT o identificador externo
  status          text        not null default 'pending', -- pending | issued | cancelled | error
  provider        text        not null default 'cord',
  provider_document_id text,
  invoice_number  text,
  currency        text,                              -- divisa de subtotal/tax_total/total
  ledger_currency text,                              -- divisa contable del emisor
  fx_rate         numeric,                           -- currency -> ledger_currency
  ledger_total    numeric,                           -- total convertido al ledger
  subtotal        numeric,
  tax_total       numeric,
  total           numeric,
  issuer_snapshot jsonb       not null default '{}'::jsonb,
  recipient_snapshot jsonb    not null default '{}'::jsonb,
  line_items_snapshot jsonb   not null default '[]'::jsonb,
  idempotency_key text,
  schema_version  text        not null default 'cord.invoice.v1',
  provider_data   jsonb,                             -- Data cruda del PAC/Stripe Tax/Avalara
  pdf_url         text,
  xml_url         text,
  issued_at       timestamptz,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);
create index if not exists idx_doc_fiscales_org on documentos_fiscales(org_id, created_at desc);

-- ── Personalización de marca y PDF (jun 2026) ──
-- Se aplican con `alter ... if not exists` para que db:migrate siga siendo re-ejecutable.
alter table orgs add column if not exists parent_org_id uuid references orgs(id) on delete set null;
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

-- Datos fiscales del RECEPTOR (por cliente) para CFDI 4.0 nominativo. Sin ellos
-- emit.ts cae a defaults (público en general / CP y uso del emisor). Capturarlos
-- permite timbrar a un RFC específico. Catálogos SAT en src/lib/sat.ts.
alter table clientes add column if not exists regimen_fiscal text; -- c_RegimenFiscal (ej. 601, 626)
alter table clientes add column if not exists uso_cfdi text;       -- c_UsoCFDI (ej. G03)
alter table clientes add column if not exists cp_fiscal text;      -- código postal del domicilio fiscal del receptor

-- Origen del cliente: 'app' (alta manual) | 'embed' (find-or-create desde
-- Cord Elements con una publishable key — ver createCotizacion en
-- src/lib/cotizaciones.ts). Los creados por 'embed' NUNCA se actualizan
-- automáticamente después (una pk_ solo puede CREAR, jamás alterar un
-- cliente existente) — este campo es para que el negocio los identifique y
-- revise en su CRM, no un gate funcional.
alter table clientes add column if not exists origen text not null default 'app';

-- 2) Flujos de aprobación: umbrales por org + estado de aprobación por cotización.
alter table orgs add column if not exists aprob_descuento_max numeric not null default 0; -- % de descuento que dispara aprobación (0 = sin tope)
alter table orgs add column if not exists aprob_monto_max numeric not null default 0;     -- total que dispara aprobación (0 = sin tope)
alter table orgs add column if not exists aprob_margen_min numeric not null default 0;    -- % de margen bruto mínimo; por debajo dispara aprobación (0 = sin tope)
alter table cotizaciones add column if not exists aprob_estado text;  -- null | pendiente | aprobada | rechazada
alter table cotizaciones add column if not exists aprob_motivo text;  -- por qué requirió aprobación

-- 2b) Costo de producto para auditoría de márgenes.
alter table productos add column if not exists costo numeric not null default 0;
alter table cotizacion_items add column if not exists costo_unitario numeric not null default 0; -- snapshot del costo al cotizar

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
alter table orgs add column if not exists terminos_default text not null default 'contado'; -- contado | net<N> (src/lib/payment-terms.ts)
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
-- Membresía de usuarios a una org + permisos por sección (custom).
-- El owner se siembra como miembro rol='owner' (permisos totales, override).
-- Invitación por TOKEN (link): user_id queda null hasta que la persona
-- inicia sesión y acepta en /unirse/{token}.
create table if not exists org_members (
  id            uuid        default gen_random_uuid() primary key,
  org_id        uuid        not null references orgs(id) on delete cascade,
  user_id       uuid        references users(id) on delete cascade, -- null mientras está invitado
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
create index if not exists idx_members_user on org_members(user_id) where user_id is not null;
create index if not exists idx_members_org on org_members(org_id);
create unique index if not exists uq_members_org_user on org_members(org_id, user_id) where user_id is not null;

-- Sembrar al owner existente de cada org como miembro 'owner' (idempotente).
insert into org_members (org_id, user_id, rol, estado, joined_at)
select id, owner_id, 'owner', 'activo', now() from orgs
where owner_id is not null
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
alter table orgs add column if not exists slack_channel text;
alter table orgs add column if not exists slack_team text;
-- Microsoft Teams: URL del flujo de Power Automate ("Workflows" en el canal).
-- Los conectores O365 clásicos de Teams están retirados; la URL vigente es la
-- del flujo, no un webhook del canal.
alter table orgs add column if not exists teams_webhook_url text;
alter table orgs add column if not exists teams_graph_access_enc text;
alter table orgs add column if not exists teams_graph_refresh_enc text;
alter table orgs add column if not exists teams_graph_expira timestamptz;
alter table orgs add column if not exists teams_graph_usuario text;
alter table orgs add column if not exists teams_graph_estado text;
alter table orgs add column if not exists teams_team_id text;
alter table orgs add column if not exists teams_team_nombre text;
alter table orgs add column if not exists teams_channel_id text;
alter table orgs add column if not exists teams_channel_nombre text;
-- WhatsApp Business (Cloud API): número emisor, token CIFRADO y la plantilla
-- aprobada por Meta con la que se inicia la conversación.
alter table orgs add column if not exists whatsapp_phone_id text;
alter table orgs add column if not exists whatsapp_token_enc text;
alter table orgs add column if not exists whatsapp_plantilla text;
alter table orgs add column if not exists whatsapp_plantilla_idioma text;
-- Mercado Pago: segundo riel de cobro, para los países donde Stripe no abre
-- cuentas conectadas. Tokens CIFRADOS (son credenciales de dinero).
alter table orgs add column if not exists mp_user_id text;
alter table orgs add column if not exists mp_access_token_enc text;
alter table orgs add column if not exists mp_refresh_token_enc text;
alter table orgs add column if not exists mp_token_expira timestamptz;
alter table orgs add column if not exists mp_charges_enabled boolean not null default false;
-- Integraciones: qué conectores están activados (jsonb, maqueta que persiste).
alter table orgs add column if not exists integraciones jsonb not null default '{}'::jsonb;
-- Facturación/CFDI: estado del CSD. REAL (jun 2026) vía Facturapi Organizations
-- (multi-tenant): cada org de Cord = una organización en Facturapi con SU CSD.
alter table orgs add column if not exists csd_estado text;           -- null | cargado | vencido
alter table orgs add column if not exists csd_nombre text;           -- nombre del .cer cargado (display)
alter table orgs add column if not exists csd_subido_at timestamptz;
alter table orgs add column if not exists facturapi_org_id text;     -- id de la organización en Facturapi
alter table orgs add column if not exists facturapi_live_key text;   -- llave LIVE de esa organización (para timbrar bajo su RFC)

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
alter table api_keys add column if not exists type text not null default 'secret'; -- secret | publishable

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

-- ── CORD Elements — embed del cotizador en sitios de terceros ───────────────
-- Allowlist de dominios autorizados a embeber /embed/[token] vía <iframe>. Se usa
-- para el header CSP `frame-ancestors` (anti-clickjacking). Lista separada por
-- comas o saltos de línea (ej. "cliente-a.com, app.cliente-b.com"). Vacío =
-- framing abierto (modo "Powered by Cord", útil para demo y plan gratis).
alter table orgs add column if not exists embed_domains text not null default '';

-- ── Webhooks salientes (Developers, jun 2026) ───────────────────────────────
-- Cada org puede registrar URLs que reciben eventos de Cord (quote.sent,
-- quote.viewed, quote.approved, quote.rejected, quote.paid, invoice.stamped).
-- La entrega es POST JSON firmado con HMAC-sha256 (header X-Cord-Signature).
-- `eventos` vacío = recibe TODOS. Guardamos el resultado de la última entrega
-- para diagnóstico (last_status/last_error/last_delivery_at).
create table if not exists webhooks (
  id              uuid        default gen_random_uuid() primary key,
  org_id          uuid        not null references orgs(id) on delete cascade,
  url             text        not null,
  eventos         jsonb       not null default '[]'::jsonb,  -- [] = todos
  secret          text        not null,                       -- whsec_… (firma HMAC)
  activo          boolean     not null default true,
  created_at      timestamptz default now(),
  last_status     int,
  last_error      text,
  last_delivery_at timestamptz
);
create index if not exists idx_webhooks_org on webhooks(org_id);

-- ── Log de entregas de webhooks (Developers PRO, jun 2026) ──────────────────
-- Cada INTENTO de entrega de un webhook queda registrado para diagnóstico y
-- "reintentar" (replay). Guardamos el payload exacto que se envió para poder
-- re-disparar la misma entrega tal cual. `request_body`/`response_body` se
-- truncan en el motor. En la UI mostramos las últimas ~100 por endpoint.
create table if not exists webhook_deliveries (
  id            uuid        default gen_random_uuid() primary key,
  org_id        uuid        not null references orgs(id) on delete cascade,
  webhook_id    uuid        not null references webhooks(id) on delete cascade,
  evento        text        not null,
  status        int,                                   -- HTTP status (null = sin respuesta)
  ok            boolean     not null default false,    -- 2xx
  error         text,                                  -- 'timeout', 'HTTP 500', 'error de red'…
  intento       int         not null default 1,        -- 1 = primer envío, 2 = reintento auto
  es_prueba     boolean     not null default false,    -- disparada con "Enviar prueba"
  duracion_ms   int,
  request_body  text,                                  -- JSON enviado (para replay)
  response_body text,                                  -- respuesta del receptor (truncada)
  created_at    timestamptz default now()
);
create index if not exists idx_wh_deliveries on webhook_deliveries(webhook_id, created_at desc);
create index if not exists idx_wh_deliveries_org on webhook_deliveries(org_id, created_at desc);

-- ── Log de requests del API pública (Developers PRO, jun 2026) ──────────────
-- Bitácora de cada llamada autenticada a /api/v1/* y /api/mcp para que el dev
-- vea su tráfico (método, ruta, status, latencia) estilo "Logs" de Stripe. Se
-- escribe best-effort desde withApiAuth; nunca frena la respuesta.
create table if not exists api_requests (
  id          uuid        default gen_random_uuid() primary key,
  org_id      uuid        not null references orgs(id) on delete cascade,
  key_id      uuid        references api_keys(id) on delete set null,
  metodo      text        not null,                    -- GET | POST | …
  ruta        text        not null,                    -- /v1/cotizaciones
  status      int         not null,
  duracion_ms int,
  mode        text,                                    -- live | test (de la llave)
  ip          text,
  created_at  timestamptz default now()
);
create index if not exists idx_api_requests on api_requests(org_id, created_at desc);

-- ════════════════════════════════════════════════════════════════════════════
-- FASE 3 — nuevas secciones de configuración (jun 2026)
-- ════════════════════════════════════════════════════════════════════════════

-- ── Portal del cliente — personaliza la página pública /q ────────────────────
-- (color_marca y portal_bienvenida ya existen.) Banner = línea superior; los
-- toggles controlan el chat/contraoferta y el branding "Powered by Cord".
alter table orgs add column if not exists portal_banner text;                              -- aviso superior en /q (null = sin banner)
alter table orgs add column if not exists portal_mostrar_chat boolean not null default true; -- permitir comentarios/contraoferta del cliente
alter table orgs add column if not exists portal_powered boolean not null default true;     -- mostrar "enviado vía Cord" + watermark (gated por plan)

-- ── Correo (Resend) — remitente y plantilla del correo al cliente ────────────
-- El "from" usa el dominio verificado en Resend; aquí personalizamos el NOMBRE
-- visible, el reply-to, el párrafo de intro y la firma del correo transaccional.
alter table orgs add column if not exists email_from_name text;     -- nombre visible del remitente (default = nombre del negocio)
alter table orgs add column if not exists email_reply_to text;      -- responder-a (default = email_contacto)
alter table orgs add column if not exists email_intro text;         -- párrafo de intro del correo de cotización
alter table orgs add column if not exists email_firma text;         -- firma/pie del correo

-- ── Impuestos — catálogo de tasas reutilizables (perfiles) ───────────────────
-- IVA / IEPS / retenciones / exento. El perfil marcado `es_default` de tipo
-- 'iva' sincroniza orgs.iva_pct (así el editor lo usa sin refactor). Las
-- retenciones default sincronizan retencion_iva_pct/retencion_isr_pct.
create table if not exists impuestos (
  id          uuid        default gen_random_uuid() primary key,
  org_id      uuid        not null references orgs(id) on delete cascade,
  nombre      text        not null,                       -- 'IVA 16%', 'Frontera 8%', 'Ret. IVA 10.667%'…
  tipo        text        not null default 'iva',         -- iva | ieps | ret_iva | ret_isr | exento
  tasa        numeric     not null default 0,             -- porcentaje (0–100)
  es_default  boolean     not null default false,         -- aplica a cotizaciones nuevas
  activo      boolean     not null default true,
  created_at  timestamptz default now()
);
create index if not exists idx_impuestos_org on impuestos(org_id, tipo);

-- ── Stripe Billing — suscripciones + medidores de uso (jun 2026) ─────────────
-- Estado de la suscripción que el webhook (/api/stripe/webhook) sincroniza en
-- tiempo real cuando el cliente cambia de plan, paga o se le rechaza el cobro.
alter table orgs add column if not exists subscription_status text;          -- trialing|active|past_due|canceled|null
alter table orgs add column if not exists billing_cycle text;                -- mensual|anual
alter table orgs add column if not exists current_period_end timestamptz;    -- fin del ciclo actual

-- Consumo del periodo (mes UTC 'YYYY-MM'). Lo incrementa reportUsage() en cada
-- uso de IA/CFDI/API/usuario y se muestra en /app/ajustes/plan. El excedente
-- sobre la cuota incluida (INCLUDED en src/lib/billing.ts) lo cobra Stripe vía
-- meter events; aquí sólo llevamos el contador para la UI y los topes duros.
create table if not exists uso_periodo (
  org_id     uuid        not null references orgs(id) on delete cascade,
  periodo    text        not null,                 -- 'YYYY-MM' (UTC)
  ia         int         not null default 0,       -- armados con IA (Claude)
  cfdi       int         not null default 0,       -- facturas electrónicas emitidas
  api        int         not null default 0,       -- llamadas a la API pública
  usuarios   int         not null default 0,       -- usuarios extra activos
  updated_at timestamptz not null default now(),
  primary key (org_id, periodo)
);
-- Tope duro de Gratis: cotizaciones ENVIADAS al mes (distinto de "activas",
-- que es un stock reciclable — cerrar un trato libera cupo). Sin meter de
-- Stripe: solo Gratis tiene número (INCLUDED.envios en src/lib/billing.ts);
-- el resto de los planes queda sin tope.
alter table uso_periodo add column if not exists envios int not null default 0;
-- Documentos comerciales del mes; los fiscales cuentan en `cfdi`.
alter table uso_periodo add column if not exists docs int not null default 0;

-- Telemetría interna de proveedores que pueden generar costo variable. Nunca
-- guarda prompts, correos, payloads, tokens ni secretos: solo proveedor,
-- operación, unidades y conteos técnicos agregables para Cord Ops.
create table if not exists external_usage_events (
  id            uuid        default gen_random_uuid() primary key,
  org_id        uuid        not null references orgs(id) on delete cascade,
  provider      text        not null,
  category      text        not null,
  operation     text        not null,
  units         int         not null default 1 check (units >= 0),
  input_tokens  int         not null default 0 check (input_tokens >= 0),
  output_tokens int         not null default 0 check (output_tokens >= 0),
  status        text        not null default 'success' check (status in ('success','failure','skipped')),
  metadata      jsonb       not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);
alter table external_usage_events alter column org_id set not null;
create index if not exists idx_external_usage_org_created on external_usage_events(org_id, created_at desc);
create index if not exists idx_external_usage_provider_created on external_usage_events(provider, created_at desc);
alter table external_usage_events enable row level security;
drop policy if exists "rls_external_usage_events" on external_usage_events;
create policy "rls_external_usage_events" on external_usage_events
  using (org_id = nullif(current_setting('app.org_id', true), '')::uuid);
alter table external_usage_events force row level security;

-- Idempotencia del webhook de Stripe: si un event.id ya se procesó, se ignora.
create table if not exists stripe_events (
  id          text        primary key,             -- evt_…
  type        text,
  received_at timestamptz not null default now()
);
alter table stripe_events add column if not exists claimed_at timestamptz;
alter table stripe_events add column if not exists processed_at timestamptz;
alter table stripe_events add column if not exists claim_token text;
alter table stripe_events add column if not exists attempt_count int not null default 0;
alter table stripe_events add column if not exists last_error text;
create index if not exists idx_stripe_events_processing on stripe_events(processed_at, claimed_at);

-- The Cord Build — inventario público de diez posiciones. El navegador nunca
-- decide precio ni disponibilidad: el endpoint toma ambos de esta tabla y
-- adquiere una reserva atómica antes de crear el PaymentIntent. La expiración
-- recupera intentos abandonados; sólo el webhook firmado cambia a `paid`.
create table if not exists build_positions (
  position_id              text primary key check (position_id ~ '^([0][1-9]|10)$'),
  tier                     text not null,
  amount_cents             int not null check (amount_cents > 0),
  currency                 text not null default 'mxn' check (currency = 'mxn'),
  status                   text not null default 'available' check (status in ('available','reserved','paid')),
  request_id               uuid unique,
  hold_token               uuid unique,
  hold_expires_at          timestamptz,
  stripe_payment_intent_id text unique,
  paid_at                  timestamptz,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);
create index if not exists idx_build_positions_status on build_positions(status, hold_expires_at);

-- The Cord Build / Flow — subasta pública verificable. `build_positions`
-- conserva las columnas del primer experimento de compra a precio fijo para no
-- destruir cobros existentes, pero la subasta usa su propio ledger append-only.
-- El cliente sólo propone una oferta: el depósito, el mínimo siguiente y el
-- liderazgo se resuelven en servidor y se concilian únicamente por webhook.
create table if not exists build_auction (
  id                    text primary key default 'cord-flow-2026',
  status                text not null default 'live' check (status in ('draft','live','closed','cancelled')),
  starts_at             timestamptz not null default now(),
  ends_at               timestamptz not null default (now() + interval '7 days'),
  hard_ends_at          timestamptz not null default (now() + interval '14 days'),
  anti_snipe_minutes    int not null default 10 check (anti_snipe_minutes between 0 and 60),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  check (ends_at > starts_at),
  check (hard_ends_at >= ends_at)
);
insert into build_auction (id) values ('cord-flow-2026') on conflict (id) do nothing;
alter table build_auction drop column if exists deposit_percent;

alter table build_positions add column if not exists auction_status text not null default 'open';
alter table build_positions add column if not exists starting_offer_cents int;
alter table build_positions add column if not exists min_increment_cents int;
alter table build_positions add column if not exists bid_deposit_cents int;
alter table build_positions add column if not exists current_offer_cents int;
alter table build_positions add column if not exists current_bid_id uuid;
alter table build_positions add column if not exists current_brand_name text;
alter table build_positions add column if not exists current_logo_url text;
alter table build_positions add column if not exists current_website_url text;
alter table build_positions add column if not exists bid_count int not null default 0;
-- Siembra de posiciones. Va DESPUÉS de agregar las columnas de subasta y trae
-- sus valores iniciales: una vez que starting/min/deposit son NOT NULL, Postgres
-- valida la fila propuesta antes de resolver `on conflict`, y la siembra sin
-- esas columnas rompía cualquier re-ejecución de db:migrate en producción.
-- `do update` solo toca tier y monto: nunca pisa una subasta en curso.
insert into build_positions (position_id, tier, amount_cents, starting_offer_cents, min_increment_cents, bid_deposit_cents) values
  ('01', 'Presenting Partner', 5000000, 5000000, 250000, 500000),
  ('02', 'Flow Partner', 2000000, 2000000, 100000, 200000),
  ('03', 'Flow Partner', 2000000, 2000000, 100000, 200000),
  ('04', 'Flow Partner', 2000000, 2000000, 100000, 200000),
  ('05', 'Flow Partner', 750000, 750000, 50000, 100000),
  ('06', 'Founding Partner', 750000, 750000, 50000, 100000),
  ('07', 'Founding Partner', 750000, 750000, 50000, 100000),
  ('08', 'Founding Partner', 750000, 750000, 50000, 100000),
  ('09', 'Founding Partner', 750000, 750000, 50000, 100000),
  ('10', 'Founding Partner', 750000, 750000, 50000, 100000)
on conflict (position_id) do update
set tier = excluded.tier, amount_cents = excluded.amount_cents, updated_at = now();
update build_positions
   set starting_offer_cents = coalesce(starting_offer_cents, amount_cents),
       min_increment_cents = coalesce(min_increment_cents,
         case when position_id = '01' then 250000
              when position_id in ('02','03','04') then 100000
              else 50000 end),
       bid_deposit_cents = coalesce(bid_deposit_cents,
         case when position_id = '01' then 500000
              when position_id in ('02','03','04') then 200000
              else 100000 end),
       auction_status = case when status = 'paid' then 'closed' else auction_status end;
alter table build_positions alter column starting_offer_cents set not null;
alter table build_positions alter column min_increment_cents set not null;
alter table build_positions alter column bid_deposit_cents set not null;
alter table build_positions drop constraint if exists build_positions_auction_status_check;
alter table build_positions add constraint build_positions_auction_status_check
  check (auction_status in ('open','closed','paused'));
alter table build_positions drop constraint if exists build_positions_starting_offer_check;
alter table build_positions add constraint build_positions_starting_offer_check check (starting_offer_cents > 0);
alter table build_positions drop constraint if exists build_positions_min_increment_check;
alter table build_positions add constraint build_positions_min_increment_check check (min_increment_cents > 0);
alter table build_positions drop constraint if exists build_positions_bid_deposit_check;
alter table build_positions add constraint build_positions_bid_deposit_check check (bid_deposit_cents > 0);

create table if not exists build_bids (
  id                         uuid primary key,
  auction_id                 text not null references build_auction(id),
  position_id                text not null references build_positions(position_id),
  request_id                 uuid not null unique,
  brand_name                 text not null check (char_length(brand_name) between 2 and 80),
  contact_email              text not null,
  website_url                text,
  logo_url                   text,
  offer_amount_cents         int not null check (offer_amount_cents > 0),
  deposit_amount_cents       int not null check (deposit_amount_cents > 0),
  currency                   text not null default 'mxn' check (currency = 'mxn'),
  status                     text not null default 'pending' check (status in (
    'pending','leading','outbid_refunding','outbid','stale_refunding','stale',
    'won','failed','rejected_refunding','rejected'
  )),
  stripe_payment_intent_id   text unique,
  stripe_refund_id           text unique,
  balance_payment_intent_id  text unique,
  balance_paid_at            timestamptz,
  moderation_status          text not null default 'pending' check (moderation_status in ('pending','approved','rejected')),
  terms_version              text not null default 'cord-flow-2026-08-29',
  terms_accepted_at          timestamptz not null default now(),
  confirmed_at               timestamptz,
  outbid_at                  timestamptz,
  refunded_at                timestamptz,
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now()
);
alter table build_bids add column if not exists logo_url text;
alter table build_bids add column if not exists balance_payment_intent_id text;
alter table build_bids add column if not exists balance_paid_at timestamptz;
create unique index if not exists idx_build_bids_balance_intent
  on build_bids(balance_payment_intent_id) where balance_payment_intent_id is not null;
create index if not exists idx_build_bids_position_history on build_bids(position_id, created_at desc);
create index if not exists idx_build_bids_public_history on build_bids(created_at desc)
  where status in ('leading','outbid_refunding','outbid','won');

-- Serializa pagos concurrentes por posición. Devuelve el PaymentIntent cuyo
-- depósito debe reembolsarse; Stripe se llama después con idempotencia y el
-- resultado vuelve al ledger. Un pago viejo nunca puede desplazar una oferta
-- más alta porque el mínimo se recalcula dentro del lock.
create or replace function cord_settle_build_bid(
  p_bid_id uuid,
  p_payment_intent_id text,
  p_paid_amount int,
  p_currency text
) returns table(outcome text, refund_bid_id uuid, refund_payment_intent_id text)
language plpgsql
as $$
declare
  v_bid build_bids%rowtype;
  v_pos build_positions%rowtype;
  v_auction build_auction%rowtype;
  v_minimum int;
  v_previous build_bids%rowtype;
begin
  select * into v_bid from build_bids where id = p_bid_id for update;
  if not found then raise exception 'build bid not found'; end if;
  if v_bid.stripe_payment_intent_id is distinct from p_payment_intent_id
     or v_bid.deposit_amount_cents <> p_paid_amount
     or v_bid.currency <> lower(p_currency) then
    raise exception 'build bid payment mismatch';
  end if;

  if v_bid.status = 'leading' or v_bid.status = 'won' then
    return query select 'accepted'::text, null::uuid, null::text;
    return;
  elsif v_bid.status in ('stale_refunding','stale','rejected_refunding','rejected') then
    return query select 'stale'::text, v_bid.id, v_bid.stripe_payment_intent_id;
    return;
  elsif v_bid.status not in ('pending','failed') then
    return query select 'ignored'::text, null::uuid, null::text;
    return;
  end if;

  select * into v_auction from build_auction where id = v_bid.auction_id for update;
  select * into v_pos from build_positions where position_id = v_bid.position_id for update;
  if v_auction.status <> 'live' or v_pos.auction_status <> 'open'
     or now() > v_auction.ends_at + interval '15 minutes' then
    update build_bids set status = 'stale_refunding', confirmed_at = now(), updated_at = now()
     where id = v_bid.id;
    return query select 'stale'::text, v_bid.id, v_bid.stripe_payment_intent_id;
    return;
  end if;

  v_minimum := case when v_pos.current_bid_id is null
    then v_pos.starting_offer_cents
    else v_pos.current_offer_cents + v_pos.min_increment_cents end;
  if v_bid.offer_amount_cents < v_minimum then
    update build_bids set status = 'stale_refunding', confirmed_at = now(), updated_at = now()
     where id = v_bid.id;
    return query select 'stale'::text, v_bid.id, v_bid.stripe_payment_intent_id;
    return;
  end if;

  if v_pos.current_bid_id is not null then
    select * into v_previous from build_bids where id = v_pos.current_bid_id for update;
    update build_bids set status = 'outbid_refunding', outbid_at = now(), updated_at = now()
     where id = v_previous.id and status = 'leading';
  end if;

  update build_bids set status = 'leading', confirmed_at = coalesce(confirmed_at, now()), updated_at = now()
   where id = v_bid.id;
  update build_positions
     set current_bid_id = v_bid.id, current_offer_cents = v_bid.offer_amount_cents,
         current_brand_name = v_bid.brand_name, current_logo_url = v_bid.logo_url,
         current_website_url = v_bid.website_url, bid_count = bid_count + 1, updated_at = now()
   where position_id = v_bid.position_id;

  if v_auction.ends_at - now() <= make_interval(mins => v_auction.anti_snipe_minutes)
     and v_auction.ends_at < v_auction.hard_ends_at then
    update build_auction
       set ends_at = least(hard_ends_at, now() + make_interval(mins => anti_snipe_minutes)), updated_at = now()
     where id = v_auction.id;
  end if;

  return query select 'accepted'::text,
    case when v_previous.id is null then null else v_previous.id end,
    case when v_previous.id is null then null else v_previous.stripe_payment_intent_id end;
end;
$$;
revoke all on function cord_settle_build_bid(uuid, text, int, text) from public;

-- El premio de Scale no nace con la garantía. Sólo un saldo final conciliado
-- por webhook crea el derecho, y sus seis meses empiezan al vincularlo a una
-- organización cuyo owner/miembro coincide con el correo de la oferta.
create table if not exists build_scale_entitlements (
  id               uuid primary key default gen_random_uuid(),
  bid_id           uuid not null unique references build_bids(id) on delete restrict,
  contact_email    text not null,
  org_id           uuid references orgs(id) on delete restrict,
  plan             text not null default 'scale' check (plan = 'scale'),
  duration_months  int not null default 6 check (duration_months = 6),
  status           text not null default 'pending' check (status in ('pending','active','expired','revoked')),
  starts_at        timestamptz,
  expires_at       timestamptz,
  activated_at     timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  check ((status = 'active' and org_id is not null and starts_at is not null and expires_at is not null)
      or status <> 'active')
);
create index if not exists idx_build_scale_entitlements_org
  on build_scale_entitlements(org_id, expires_at) where status = 'active';
alter table build_scale_entitlements enable row level security;
alter table build_scale_entitlements no force row level security;
revoke all on table build_scale_entitlements from public;

create or replace function cord_settle_build_balance(
  p_bid_id uuid,
  p_payment_intent_id text,
  p_paid_amount int,
  p_currency text
) returns text
language plpgsql
as $$
declare
  v_bid build_bids%rowtype;
  v_pos build_positions%rowtype;
  v_auction build_auction%rowtype;
  v_expected int;
begin
  select * into v_bid from build_bids where id = p_bid_id for update;
  if not found then raise exception 'build winning bid not found'; end if;
  select * into v_auction from build_auction where id = v_bid.auction_id for update;
  select * into v_pos from build_positions where position_id = v_bid.position_id for update;

  v_expected := v_bid.offer_amount_cents - v_bid.deposit_amount_cents;
  if v_bid.balance_payment_intent_id is distinct from p_payment_intent_id
     or v_expected <> p_paid_amount
     or v_bid.currency <> lower(p_currency) then
    raise exception 'build balance payment mismatch';
  end if;
  if v_bid.status = 'won' then return 'accepted'; end if;
  if v_auction.status <> 'closed' or v_bid.status <> 'leading'
     or v_pos.current_bid_id is distinct from v_bid.id then
    raise exception 'build bid is not the closed auction winner';
  end if;

  update build_bids
     set status = 'won', balance_paid_at = now(), updated_at = now()
   where id = v_bid.id;
  update build_positions
     set status = 'paid', auction_status = 'closed', paid_at = now(), updated_at = now()
   where position_id = v_bid.position_id and current_bid_id = v_bid.id;
  insert into build_scale_entitlements (bid_id, contact_email)
    values (v_bid.id, lower(v_bid.contact_email))
    on conflict (bid_id) do nothing;
  return 'accepted';
end;
$$;

create or replace function cord_activate_build_scale(p_bid_id uuid, p_org_id uuid)
returns table(starts_at timestamptz, expires_at timestamptz)
language plpgsql volatile security definer
set search_path = public, pg_temp
as $$
declare
  v_entitlement build_scale_entitlements%rowtype;
  v_now timestamptz := now();
begin
  select * into v_entitlement from build_scale_entitlements where bid_id = p_bid_id for update;
  if not found then raise exception 'build scale entitlement not found'; end if;
  if v_entitlement.status = 'active' then
    return query select v_entitlement.starts_at, v_entitlement.expires_at;
    return;
  end if;
  if v_entitlement.status <> 'pending' then raise exception 'build scale entitlement unavailable'; end if;
  if not exists (
    select 1
      from users u
      left join org_members m on m.user_id = u.id and m.org_id = p_org_id and m.estado = 'activo'
      join orgs o on o.id = p_org_id
     where lower(u.email) = lower(v_entitlement.contact_email)
       and (o.owner_id = u.id or m.user_id is not null)
  ) then
    raise exception 'build entitlement email does not belong to organization';
  end if;

  update build_scale_entitlements
     set org_id = p_org_id, status = 'active', starts_at = v_now,
         expires_at = v_now + interval '6 months', activated_at = v_now, updated_at = v_now
   where id = v_entitlement.id
   returning build_scale_entitlements.starts_at, build_scale_entitlements.expires_at
        into starts_at, expires_at;
  return next;
end;
$$;

revoke all on function cord_settle_build_balance(uuid, text, int, text) from public;
revoke all on function cord_activate_build_scale(uuid, uuid) from public;

create table if not exists platform_health (
  key             text primary key,
  last_success_at timestamptz,
  last_alert_at   timestamptz,
  metadata        jsonb not null default '{}'::jsonb,
  updated_at      timestamptz not null default now()
);

-- Disponibilidad pública demostrable. Son muestras sintéticas de plataforma,
-- no datos de clientes ni métricas inventadas. El cron autenticado escribe por
-- el carril de sistema; la página pública solo agrega estas filas.
create table if not exists health_checks (
  id          bigint generated always as identity primary key,
  service     text        not null check (service in ('database', 'stripe', 'public_link', 'api', 'app', 'fiscal', 'email', 'ai', 'payments_webhook')),
  ok          boolean     not null,
  latency_ms  int         not null check (latency_ms >= 0 and latency_ms <= 60000),
  checked_at  timestamptz not null default now()
);
create index if not exists idx_health_checks_service_checked
  on health_checks(service, checked_at desc);
create index if not exists idx_health_checks_checked
  on health_checks(checked_at desc);
-- La tabla ya existe en producción con la lista corta de servicios: el check
-- inline de arriba solo aplica a instalaciones nuevas. Estas dos líneas lo
-- amplían en caliente (sondas de API, app, fiscal, correo, IA y pagos).
alter table health_checks drop constraint if exists health_checks_service_check;
alter table health_checks add constraint health_checks_service_check
  check (service in ('database', 'stripe', 'public_link', 'api', 'app', 'fiscal', 'email', 'ai', 'payments_webhook'));

-- Incidentes públicos redactados manualmente desde Cord Ops. No se siembran
-- incidentes: una fila existe solo cuando un operador documenta un hecho real.
create table if not exists status_incidents (
  id           uuid        primary key default gen_random_uuid(),
  status       text        not null default 'investigating'
                           check (status in ('investigating', 'identified', 'monitoring', 'resolved')),
  severity     text        not null default 'minor'
                           check (severity in ('minor', 'major', 'critical')),
  title_es     text        not null check (char_length(title_es) between 3 and 160),
  title_en     text        not null check (char_length(title_en) between 3 and 160),
  summary_es   text        not null check (char_length(summary_es) between 3 and 4000),
  summary_en   text        not null check (char_length(summary_en) between 3 and 4000),
  started_at   timestamptz not null,
  resolved_at  timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  check ((status = 'resolved' and resolved_at is not null) or (status <> 'resolved' and resolved_at is null)),
  check (resolved_at is null or resolved_at >= started_at)
);
create index if not exists idx_status_incidents_public
  on status_incidents(status, started_at desc);

-- ── Stripe Connect Custom (Onboarding API MX) ────────────────────────────────
alter table orgs add column if not exists stripe_payouts_enabled boolean not null default false;
alter table orgs add column if not exists stripe_details_submitted boolean not null default false;
alter table orgs add column if not exists stripe_disabled_reason text;
alter table orgs add column if not exists stripe_requirements jsonb;
alter table orgs add column if not exists stripe_person_id text;
alter table orgs add column if not exists stripe_business_type text;
alter table orgs add column if not exists checkout_v2 boolean not null default false;
alter table orgs add column if not exists fee_enabled boolean not null default false;
alter table orgs add column if not exists fee_plan text not null default 'legacy_zero';
alter table orgs add column if not exists fee_terms_version text;
alter table orgs add column if not exists fee_terms_accepted_at timestamptz;
-- Las organizaciones existentes conservan 0%. Las creadas después de esta
-- migración nacen en el checkout propio, pero la comisión solo se activa al
-- aceptar sus términos en onboarding/configuración.
alter table orgs alter column checkout_v2 set default true;
alter table orgs alter column fee_plan set default 'standard_mx';
-- Una org con comisión activa necesita método único para calcularla; corrige
-- cualquier estado intermedio creado durante el rollout.
update orgs set checkout_v2 = true where fee_enabled is true and checkout_v2 is false;

-- ── Interés moratorio mensual (jun 2026) ──────────────────────────────────────
-- El cron /api/cron/intereses corre el día 1 de cada mes. Por cada cotización
-- vencida cuya org tenga interes_moratorio_pct > 0, registra el cargo mensual.
-- Constraint único (cotizacion_id, periodo) garantiza idempotencia: correr el
-- cron dos veces en el mismo mes no duplica el cargo.
create table if not exists intereses_moratorios (
  id              uuid        primary key default gen_random_uuid(),
  org_id          uuid        not null references orgs(id) on delete cascade,
  cotizacion_id   uuid        not null references cotizaciones(id) on delete cascade,
  periodo         text        not null,        -- 'YYYY-MM' del mes en que se aplica
  tasa_pct        numeric     not null,        -- snapshot de orgs.interes_moratorio_pct
  saldo_base      numeric     not null,        -- cotizaciones.total en el momento del cargo
  monto           numeric     not null,        -- saldo_base * tasa_pct / 100
  dias_vencido    int         not null,        -- días de atraso al momento del cron
  created_at      timestamptz not null default now(),
  unique (cotizacion_id, periodo)
);
create index if not exists idx_intereses_org on intereses_moratorios(org_id, periodo);

-- ════════════════════════════════════════════════════════════════════════════
-- RLS — Row Level Security (defensa en profundidad a nivel de base de datos)
-- ════════════════════════════════════════════════════════════════════════════
-- El backend usa withOrgTx(orgId, ...queries) en src/lib/db.ts para emitir
-- SELECT set_config('app.org_id', $1, true) antes de cada batch de queries.
-- Esto garantiza que, aunque hubiera un bug en el código, la base de datos
-- rechazaría cualquier fila que no pertenezca al org_id activo.
--
-- orgs / org_members se fuerzan en una segunda ventana mediante
-- db/cord-force-bootstrap-rls.sql, después de observar el rol cord_app 48 h.
--
-- Los links públicos resuelven únicamente (cotización, organización) mediante
-- cord_resolve_public_quote(). No existe una política RLS basada en el token.
--
-- nullif(..., '') convierte string vacío → NULL, evitando error de cast ::uuid.
-- NULL::uuid = NULL → "org_id = NULL" nunca es TRUE → fail-closed.
-- ════════════════════════════════════════════════════════════════════════════

alter table orgs               enable row level security;
alter table org_members        enable row level security;
alter table productos          enable row level security;
alter table clientes           enable row level security;
alter table cotizaciones       enable row level security;
alter table cotizacion_items   enable row level security;
alter table eventos            enable row level security;
alter table facturas_cfdi      enable row level security;
alter table documentos_fiscales enable row level security;
alter table tareas             enable row level security;
alter table audit_log          enable row level security;
alter table api_keys           enable row level security;
alter table webhooks           enable row level security;
alter table webhook_deliveries enable row level security;
alter table api_requests       enable row level security;
alter table plantillas_mensaje enable row level security;
alter table impuestos          enable row level security;
alter table uso_periodo        enable row level security;
alter table intereses_moratorios enable row level security;

drop policy if exists "rls_orgs" on orgs;
create policy "rls_orgs" on orgs
  using (
    id = nullif(current_setting('app.org_id', true), '')::uuid
    or sandbox_of = nullif(current_setting('app.org_id', true), '')::uuid
    or owner_id = nullif(current_setting('app.user_id', true), '')::uuid
  )
  with check (
    id = nullif(current_setting('app.org_id', true), '')::uuid
    or sandbox_of = nullif(current_setting('app.org_id', true), '')::uuid
    or owner_id = nullif(current_setting('app.user_id', true), '')::uuid
  );

drop policy if exists "rls_org_members" on org_members;
create policy "rls_org_members" on org_members
  using (
    org_id = nullif(current_setting('app.org_id', true), '')::uuid
    or user_id = nullif(current_setting('app.user_id', true), '')::uuid
  )
  with check (
    org_id = nullif(current_setting('app.org_id', true), '')::uuid
    or user_id = nullif(current_setting('app.user_id', true), '')::uuid
  );

create policy "rls_productos" on productos
  using (org_id = nullif(current_setting('app.org_id', true), '')::uuid);

create policy "rls_clientes" on clientes
  using (org_id = nullif(current_setting('app.org_id', true), '')::uuid);

drop policy if exists "rls_cotizaciones" on cotizaciones;
create policy "rls_cotizaciones" on cotizaciones
  using (org_id = nullif(current_setting('app.org_id', true), '')::uuid)
  with check (org_id = nullif(current_setting('app.org_id', true), '')::uuid);

drop policy if exists "rls_cotizaciones_public_select" on cotizaciones;

drop policy if exists "rls_cotizacion_items" on cotizacion_items;
create policy "rls_cotizacion_items" on cotizacion_items
  using (cotizacion_id in (
    select id from cotizaciones
    where org_id = nullif(current_setting('app.org_id', true), '')::uuid
  ))
  with check (cotizacion_id in (
    select id from cotizaciones
    where org_id = nullif(current_setting('app.org_id', true), '')::uuid
  ));

create policy "rls_eventos" on eventos
  using (org_id = nullif(current_setting('app.org_id', true), '')::uuid);

create policy "rls_facturas_cfdi" on facturas_cfdi
  using (org_id = nullif(current_setting('app.org_id', true), '')::uuid);

create policy "rls_documentos_fiscales" on documentos_fiscales
  using (org_id = nullif(current_setting('app.org_id', true), '')::uuid);

create policy "rls_tareas" on tareas
  using (org_id = nullif(current_setting('app.org_id', true), '')::uuid);

create policy "rls_audit_log" on audit_log
  using (org_id = nullif(current_setting('app.org_id', true), '')::uuid);

create policy "rls_api_keys" on api_keys
  using (org_id = nullif(current_setting('app.org_id', true), '')::uuid);

create policy "rls_webhooks" on webhooks
  using (org_id = nullif(current_setting('app.org_id', true), '')::uuid);

create policy "rls_webhook_deliveries" on webhook_deliveries
  using (org_id = nullif(current_setting('app.org_id', true), '')::uuid);

create policy "rls_api_requests" on api_requests
  using (org_id = nullif(current_setting('app.org_id', true), '')::uuid);

create policy "rls_plantillas_mensaje" on plantillas_mensaje
  using (org_id = nullif(current_setting('app.org_id', true), '')::uuid);

create policy "rls_impuestos" on impuestos
  using (org_id = nullif(current_setting('app.org_id', true), '')::uuid);

create policy "rls_uso_periodo" on uso_periodo
  using (org_id = nullif(current_setting('app.org_id', true), '')::uuid);

create policy "rls_intereses_moratorios" on intereses_moratorios
  using (org_id = nullif(current_setting('app.org_id', true), '')::uuid);

-- ── Sistema de Versiones de Cotización (jun 2026) ───────────────────────────
-- Número de versión actual (V1, V2, V3…). Empieza en 1.
alter table cotizaciones add column if not exists version int not null default 1;

-- Snapshot inmutable de cada versión enviada.
create table if not exists cotizacion_versiones (
  id              uuid      primary key default gen_random_uuid(),
  cotizacion_id   uuid      not null references cotizaciones(id) on delete cascade,
  org_id          uuid      not null references orgs(id) on delete cascade,
  version         int       not null,        -- 1, 2, 3…
  subtotal        numeric   not null,
  iva             numeric   not null,
  total           numeric   not null,
  items           jsonb     not null,         -- snapshot completo de las líneas
  notas           text,
  created_at      timestamptz default now(),
  unique (cotizacion_id, version)
);
create index if not exists idx_versiones_cot on cotizacion_versiones(cotizacion_id, version);

-- RLS
alter table cotizacion_versiones enable row level security;
create policy "rls_cotizacion_versiones" on cotizacion_versiones
  using (org_id = nullif(current_setting('app.org_id', true), '')::uuid);

-- ════════════════════════════════════════════════════════════════════════════
-- FASE 4 — MCP (Model Context Protocol) & Gobernanza de IA
-- ════════════════════════════════════════════════════════════════════════════

-- ── MCP Servers (Outbound) ──────────────────────────────────────────────────
-- Catálogo de servidores externos que la org ha conectado (CRMs, DBs, etc.)
create table if not exists mcp_servers (
  id              uuid        default gen_random_uuid() primary key,
  org_id          uuid        not null references orgs(id) on delete cascade,
  nombre          text        not null,
  url_sse         text        not null,
  auth_token      text,                       -- Token/clave de acceso (idealmente encriptado)
  activo          boolean     not null default true,
  created_at      timestamptz default now()
);
create index if not exists idx_mcp_servers_org on mcp_servers(org_id, activo);

alter table mcp_servers enable row level security;
create policy "rls_mcp_servers" on mcp_servers
  using (org_id = nullif(current_setting('app.org_id', true), '')::uuid);

-- ── Gobernanza: Agentes de IA ───────────────────────────────────────────────
create table if not exists agentes_ia (
  id              uuid        default gen_random_uuid() primary key,
  org_id          uuid        not null references orgs(id) on delete cascade,
  nombre          text        not null,       -- ej: 'Asistente Ventas', 'Analista Datos'
  descripcion     text,
  activo          boolean     not null default true,
  created_at      timestamptz default now()
);
create index if not exists idx_agentes_ia_org on agentes_ia(org_id, activo);

alter table agentes_ia enable row level security;
create policy "rls_agentes_ia" on agentes_ia
  using (org_id = nullif(current_setting('app.org_id', true), '')::uuid);

-- ── Gobernanza: Permisos de Agentes ─────────────────────────────────────────
-- Dicta qué herramientas específicas del catálogo Inbound o Outbound
-- (mcp_servers) tiene permitido usar cada agente.
create table if not exists agentes_permisos (
  id              uuid        default gen_random_uuid() primary key,
  org_id          uuid        not null references orgs(id) on delete cascade,
  agente_id       uuid        not null references agentes_ia(id) on delete cascade,
  tipo_recurso    text        not null,       -- 'inbound' (local) | 'outbound' (remoto)
  recurso_id      text,                       -- uuid de mcp_servers si es outbound, o null si es inbound
  herramientas    jsonb       not null default '[]'::jsonb, -- Array de nombres de herramientas permitidas (ej. ["leer_cotizaciones"]) o ["*"]
  created_at      timestamptz default now(),
  unique (agente_id, tipo_recurso, recurso_id)
);
create index if not exists idx_agentes_permisos_org on agentes_permisos(org_id);

alter table agentes_permisos enable row level security;
create policy "rls_agentes_permisos" on agentes_permisos
  using (org_id = nullif(current_setting('app.org_id', true), '')::uuid);

-- ── Cotizaciones Comentarios (Hilos de negociación por línea) ──
create table if not exists cotizacion_comentarios (
  id              uuid        default gen_random_uuid() primary key,
  org_id          uuid        not null references orgs(id) on delete cascade,
  cotizacion_id   uuid        not null references cotizaciones(id) on delete cascade,
  item_id         uuid        references cotizacion_items(id) on delete cascade,
  autor_tipo      text        not null default 'cliente', -- 'cliente' | 'usuario'
  autor_nombre    text        not null,
  contenido       text        not null,
  created_at      timestamptz default now()
);
create index if not exists idx_cotizacion_comentarios_org on cotizacion_comentarios(org_id);
create index if not exists idx_cotizacion_comentarios_item on cotizacion_comentarios(item_id);

alter table cotizacion_comentarios enable row level security;
create policy "rls_cotizacion_comentarios" on cotizacion_comentarios
  using (org_id = nullif(current_setting('app.org_id', true), '')::uuid);

-- ── Cotizaciones Firmas (Firmas legales nativas e inmutables) ──
create table if not exists cotizacion_firmas (
  id              uuid        default gen_random_uuid() primary key,
  org_id          uuid        not null references orgs(id) on delete cascade,
  cotizacion_id   uuid        not null references cotizaciones(id) on delete cascade,
  firmante_nombre text        not null,
  firmante_email  text,
  firmante_ip     text,
  user_agent      text,
  snapshot_hash   text        not null, -- SHA-256 del payload de la cotización
  firmado_en      timestamptz default now()
);
create index if not exists idx_cotizacion_firmas_org on cotizacion_firmas(org_id);
create index if not exists idx_cotizacion_firmas_cotizacion on cotizacion_firmas(cotizacion_id);

alter table cotizacion_firmas enable row level security;
create policy "rls_cotizacion_firmas" on cotizacion_firmas
  using (org_id = nullif(current_setting('app.org_id', true), '')::uuid);

-- ════════════════════════════════════════════════════════════════════════════
-- FASE 5 — AI Agent Workflows (Cobranza y Flujo de Caja)
-- ════════════════════════════════════════════════════════════════════════════

-- 1) Fecha y método de pago
alter table cotizaciones add column if not exists paid_at timestamptz;
alter table cotizaciones add column if not exists payment_method text;
-- 1b) PaymentIntent reutilizable del pago en línea (Connect Custom, jul 2026).
--     Evita crear un PI + customer nuevos (y una CLABE SPEI distinta) en cada
--     recarga de /q/[token]/pay: el endpoint payment-intent lo reutiliza.
alter table cotizaciones add column if not exists stripe_payment_intent_id text;
-- 2) Hilos de negociación del agente de cobranza
create table if not exists cobranza_conversaciones (
  id              uuid        default gen_random_uuid() primary key,
  org_id          uuid        not null references orgs(id) on delete cascade,
  cotizacion_id   uuid        not null references cotizaciones(id) on delete cascade,
  autor_tipo      text        not null default 'agente_ia', -- 'agente_ia' | 'cliente' | 'usuario'
  mensaje         text        not null,
  canal           text        not null default 'email',     -- 'email' | 'whatsapp'
  message_id      text,                                     -- ID del correo para threading
  created_at      timestamptz default now()
);
create index if not exists idx_cobranza_conversaciones_org on cobranza_conversaciones(org_id);
create index if not exists idx_cobranza_conversaciones_cot on cobranza_conversaciones(cotizacion_id, created_at asc);

alter table cobranza_conversaciones enable row level security;
create policy "rls_cobranza_conversaciones" on cobranza_conversaciones
  using (org_id = nullif(current_setting('app.org_id', true), '')::uuid);

-- 3) Planes de pago negociados por la IA
create table if not exists planes_pago_negociados (
  id              uuid        default gen_random_uuid() primary key,
  org_id          uuid        not null references orgs(id) on delete cascade,
  cotizacion_id   uuid        not null references cotizaciones(id) on delete cascade,
  cuotas          int         not null,
  frecuencia      text        not null default 'mensual',  -- 'semanal' | 'quincenal' | 'mensual'
  monto_cuota     numeric     not null,
  estado          text        not null default 'activo',   -- 'propuesto' | 'activo' | 'completado' | 'incumplido'
  created_at      timestamptz default now()
);
create index if not exists idx_planes_pago_org on planes_pago_negociados(org_id);
create index if not exists idx_planes_pago_cot on planes_pago_negociados(cotizacion_id);

alter table planes_pago_negociados enable row level security;
create policy "rls_planes_pago_negociados" on planes_pago_negociados
  using (org_id = nullif(current_setting('app.org_id', true), '')::uuid);

-- ── Opt-in: cobranza autónoma con IA (jun 2026) ──
-- El cron /api/cron/cobranza SOLO procesa orgs con este flag en true. Evita
-- mandar correos de cobranza autónomos sin consentimiento explícito del negocio.
alter table orgs add column if not exists ai_cobranza_activa boolean not null default false;

-- ── Aprobación parcial por línea (jun 2026) ──
-- false = el cliente excluyó esta línea al aprobar el link público. Default true
-- para que toda cotización existente / aprobación total quede como "incluida".
alter table cotizacion_items add column if not exists aprobado boolean not null default true;

-- ── FIX (jun 2026): columnas que vivían SOLO en el CREATE TABLE ──
-- Las tablas creadas antes de agregar estas columnas al CREATE nunca las
-- recibían (el migrate ignora "already exists"). Se re-declaran como ALTER
-- idempotente para que existan en TODAS las bases. Crítico: createCotizacion
-- inserta en base_currency/fx_* y emit.ts (facturación) lee orgs.country_code.
alter table cotizaciones add column if not exists base_currency   text        not null default 'MXN';
alter table cotizaciones add column if not exists fiscal_currency text        not null default 'MXN';
alter table cotizaciones add column if not exists fx_rate         numeric     not null default 1;
alter table cotizaciones add column if not exists fx_rate_source  text        not null default 'spot';
alter table cotizaciones add column if not exists fx_locked_until timestamptz;
alter table orgs         add column if not exists country_code    text        not null default 'MX';


-- Agregado: FORCE ROW LEVEL SECURITY
alter table productos force row level security;
alter table clientes force row level security;
alter table cotizaciones force row level security;
alter table cotizacion_items force row level security;
alter table eventos force row level security;
alter table facturas_cfdi force row level security;
alter table documentos_fiscales force row level security;
alter table tareas force row level security;
alter table audit_log force row level security;
alter table api_keys force row level security;
alter table webhooks force row level security;
alter table webhook_deliveries force row level security;
alter table api_requests force row level security;
alter table plantillas_mensaje force row level security;
alter table impuestos force row level security;
alter table uso_periodo force row level security;
alter table intereses_moratorios force row level security;
alter table cotizacion_versiones force row level security;
alter table mcp_servers force row level security;
alter table agentes_ia force row level security;
alter table agentes_permisos force row level security;
alter table cotizacion_comentarios force row level security;
alter table cotizacion_firmas force row level security;
alter table cobranza_conversaciones force row level security;
alter table planes_pago_negociados force row level security;

-- ════════════════════════════════════════════════════════════════════════════
-- Precios por volumen + Promesas de pago (jun 2026)
-- ════════════════════════════════════════════════════════════════════════════

-- 1) Matriz de precios por volumen por producto.
-- jsonb = array de niveles ordenados por cantidad mínima ascendente:
--   [{"min": 500, "precio": 90}, {"min": 2000, "precio": 75}]
-- El precio_lista base aplica cuando la cantidad es menor al primer nivel.
-- El editor de cotizaciones aplica el precio del nivel que corresponda a la
-- cantidad de cada línea (sobre él se calcula el descuento por nivel de cliente).
alter table productos add column if not exists precios_volumen jsonb not null default '[]'::jsonb;
-- Existencias de la tienda conectada: null = el producto no controla inventario.
alter table productos add column if not exists existencias numeric;
alter table productos add column if not exists existencias_at timestamptz;


-- 2) Promesas de pago — el cliente prometió pagar en una fecha. Útil para
-- comercializadoras con cartera de crédito. Feature de seguimiento manual en
-- Cobranza (no automatiza nada; solo registra el compromiso para dar seguimiento).
create table if not exists promesas_pago (
  id              uuid        default gen_random_uuid() primary key,
  org_id          uuid        not null references orgs(id) on delete cascade,
  cotizacion_id   uuid        not null references cotizaciones(id) on delete cascade,
  fecha_promesa   date        not null,
  monto           numeric,                                  -- null = el saldo completo
  nota            text,
  estado          text        not null default 'pendiente', -- 'pendiente' | 'cumplida' | 'incumplida'
  created_at      timestamptz default now()
);
create index if not exists idx_promesas_pago_org on promesas_pago(org_id, fecha_promesa);
create index if not exists idx_promesas_pago_cot on promesas_pago(cotizacion_id, created_at desc);

alter table promesas_pago enable row level security;
create policy "rls_promesas_pago" on promesas_pago
  using (org_id = nullif(current_setting('app.org_id', true), '')::uuid);
alter table promesas_pago force row level security;

-- ── Cotizaciones: IVA incluido (jul 2026) ──
alter table cotizaciones add column if not exists iva_incluido boolean not null default false;
alter table cotizacion_versiones add column if not exists iva_incluido boolean not null default false;


alter table orgs add column if not exists iva_incluido_defecto boolean not null default false;

-- ── Entorno de PRUEBA real, tipo Stripe (jul 2026) ───────────────────────────
-- Cada org puede tener UNA org "sandbox" espejo (sandbox_of → org padre). La
-- sandbox es una org COMPLETA: todo el RLS, queries y features existentes
-- funcionan sin cambios. El toggle "Entorno de prueba" (cookie cord_test_mode,
-- leída por el middleware) hace que getActiveOrgId() resuelva la sandbox en vez
-- de la org real; las llaves sk_test_ también operan sobre ella. Los datos de
-- prueba y los reales NUNCA se mezclan (aislamiento por org_id + RLS).
alter table orgs add column if not exists sandbox_of uuid references orgs(id) on delete cascade;
create unique index if not exists idx_orgs_sandbox_of on orgs(sandbox_of) where sandbox_of is not null;

-- ── Stripe Connect y Transferencias (jul 2026) ──────────────────────────────
alter table orgs add column if not exists stripe_account_id text;
alter table orgs add column if not exists stripe_account_type text;
alter table orgs add column if not exists stripe_charges_enabled boolean not null default false;
alter table orgs add column if not exists acepta_tarjeta boolean not null default true;
alter table orgs add column if not exists acepta_transferencia boolean not null default false;
alter table orgs add column if not exists banco_nombre text;
alter table orgs add column if not exists banco_clabe text;
alter table orgs add column if not exists banco_clabe_enc text;
alter table orgs add column if not exists banco_clabe_last4 text;
alter table orgs add column if not exists facturapi_live_key_enc text;
alter table users add column if not exists totp_secret_enc text;
alter table sessions add column if not exists reauthenticated_at timestamptz;
update sessions set reauthenticated_at = created_at where reauthenticated_at is null;
alter table webhooks add column if not exists secret_enc text;
alter table webhooks add column if not exists secret_prev_enc text;
alter table webhooks alter column secret drop not null;
-- Los administradores conservan acceso a configuración de cobros. Otros roles
-- no heredan el permiso por tener "ajustes"; solo se migra a quien ya operó
-- Connect recientemente, con base en evidencia del audit log.
update org_members m
   set permisos = coalesce(m.permisos, '{}'::jsonb) || '{"cobros_config":true}'::jsonb
 where m.rol = 'admin'
    or exists (
        select 1 from audit_log a
         where a.org_id = m.org_id
           and a.actor = m.user_id::text
           and a.created_at >= now() - interval '90 days'
           and (a.accion like 'billing.%' or a.accion like 'cord_pagos.%')
    );
alter table orgs add column if not exists banco_beneficiario text;
alter table orgs add column if not exists cobro_spei_auto boolean not null default false;

-- ── Verificación de identidad "continúa en tu teléfono" (jul 2026) ──────────
-- Sesión efímera que vincula un dispositivo móvil (sin sesión de Clerk) a la
-- cuenta de Stripe Connect de una org, para tomar fotos de identificación +
-- selfie con la cámara REAL del teléfono en vez de la webcam de escritorio
-- (mejor calidad, cámara trasera, patrón "escanea el QR y sigue en tu celular"
-- de Stripe Identity). El token es la única credencial: aleatorio, expira a
-- los 10 minutos, y no es reutilizable una vez completado.
create table if not exists identity_capture_sessions (
  id                uuid        default gen_random_uuid() primary key,
  token             text        not null unique,
  org_id            uuid        not null references orgs(id) on delete cascade,
  stripe_account_id text        not null,
  person_id         text,                                    -- null = doc a nivel cuenta (persona física)
  is_company_doc    boolean     not null default false,
  captured          jsonb       not null default '{}'::jsonb, -- {front:true, back:true, selfie:true}
  status            text        not null default 'pending',   -- pending | completed
  created_at        timestamptz not null default now(),
  expires_at        timestamptz not null
);
alter table identity_capture_sessions alter column token drop not null;
alter table identity_capture_sessions add column if not exists token_hash text;
create unique index if not exists uq_identity_capture_token_hash on identity_capture_sessions(token_hash) where token_hash is not null;
create index if not exists idx_ics_org on identity_capture_sessions(org_id, created_at desc);

alter table identity_capture_sessions enable row level security;
drop policy if exists "rls_identity_capture_sessions" on identity_capture_sessions;
create policy "rls_identity_capture_sessions" on identity_capture_sessions
  using (
    org_id = nullif(current_setting('app.org_id', true), '')::uuid
    or token_hash = nullif(current_setting('app.capture_token_hash', true), '')
  );
drop policy if exists "system_identity_capture_sessions" on identity_capture_sessions;
create policy "system_identity_capture_sessions" on identity_capture_sessions
  using (current_setting('app.scope', true) = 'system')
  with check (current_setting('app.scope', true) = 'system');
alter table identity_capture_sessions force row level security;

-- ── Depósitos a la cuenta del negocio (payouts) (ago 2026) ──────────────────
--
-- Los depósitos sólo existían como una línea en `audit_log`: no había tabla, no
-- había historial, y el widget "próximo depósito" dependía de una llamada en
-- vivo al proveedor en cada carga de /app/cobros. Un negocio no podía responder
-- "¿qué cobros trae este depósito?", que es LA pregunta de la conciliación
-- bancaria, ni ver qué le habían depositado el mes pasado.
--
-- La fuente sigue siendo el proveedor: esta tabla se llena desde los webhooks
-- `payout.*` (con el mismo claim idempotente que el resto) y es reconstruible.
-- `stripe_payout_id` es único para que un reintento del webhook no duplique.
create table if not exists payouts (
  id                 uuid        default gen_random_uuid() primary key,
  org_id             uuid        not null references orgs(id) on delete cascade,
  stripe_account_id  text        not null,
  stripe_payout_id   text        not null unique,
  amount_cents       bigint      not null,
  currency           text        not null,
  -- paid | pending | in_transit | canceled | failed
  status             text        not null,
  arrival_date       date,
  metodo             text,                     -- standard | instant
  tipo_destino       text,                     -- bank_account | card
  destino_last4      text,
  failure_code       text,
  failure_message    text,
  -- NOTA: la conciliación depósito → cobros (qué cobros trae cada depósito, vía
  -- balance transactions) NO está construida todavía. Las columnas para
  -- guardarla se agregarán EN EL MISMO CAMBIO que las escriba: una columna que
  -- nadie llena aparenta una capacidad que no existe, y la siguiente persona
  -- que lea este schema creería que el desglose ya está ahí (regla 15).
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index if not exists idx_payouts_org on payouts(org_id, arrival_date desc nulls last, created_at desc);
create index if not exists idx_payouts_status on payouts(org_id, status);

alter table payouts enable row level security;
drop policy if exists "rls_payouts" on payouts;
create policy "rls_payouts" on payouts
  using (org_id = nullif(current_setting('app.org_id', true), '')::uuid)
  with check (org_id = nullif(current_setting('app.org_id', true), '')::uuid);
-- El webhook resuelve la organización con una función security definer y vuelve
-- a withOrgTx, pero los crons de conciliación barren cross-org.
drop policy if exists "system_payouts" on payouts;
create policy "system_payouts" on payouts
  using (current_setting('app.scope', true) = 'system')
  with check (current_setting('app.scope', true) = 'system');
drop policy if exists "ops_payouts" on payouts;
create policy "ops_payouts" on payouts
  using (current_setting('app.scope', true) = 'ops');
alter table payouts force row level security;

-- Frecuencia de depósito elegida por el negocio. Espejo de
-- `settings.payouts.schedule` del proveedor: se guarda para poder pintar la
-- pantalla sin una llamada en vivo, pero la fuente sigue siendo él.
alter table orgs add column if not exists payout_interval text;      -- daily | weekly | monthly | manual
alter table orgs add column if not exists payout_delay_days int;
alter table orgs add column if not exists payout_weekly_anchor text; -- monday…sunday
alter table orgs add column if not exists payout_monthly_anchor int; -- 1..31

-- ── Personas de KYC de Connect (UBO, directores, representante) (ago 2026) ──
--
-- ESPEJO de las Person del proveedor de pagos, no la fuente de verdad. El
-- proveedor manda: cada escritura va primero a su API y esta tabla se rellena
-- con SU respuesta, nunca con lo que mandó el cliente. Es RECONSTRUIBLE en
-- cualquier momento con `reconcilePersons(orgId)` (src/lib/connect-personas.ts).
--
-- Existe por tres cosas que el proveedor no puede dar:
--   · un ancla con FK para la captura móvil (identity_capture_sessions.persona_id
--     guardaba un person_id de TEXTO LIBRE, sin nada en Postgres contra qué
--     validar que fuera de esta organización);
--   · lecturas baratas en el sondeo del wizard, que corre cada 2.5 s;
--   · un nombre que mostrar en Cord Ops sin autenticarse como la cuenta ajena.
--
-- NINGUNA decisión de producto se toma desde aquí: el gate de cobros sigue
-- leyendo `charges_enabled` del proveedor. Una divergencia es una etiqueta vieja
-- durante segundos, nunca un permiso mal concedido.
--
-- NUNCA se guardan aquí: id_number, id_number_secondary, ssn_last_4, dob,
-- domicilio personal, nationality, ni imágenes o file ids de documentos. Esos
-- datos viajan directo al proveedor y Cord los olvida — es lo que promete el
-- propio aviso del alta.
create table if not exists connect_personas (
  id                 uuid        default gen_random_uuid() primary key,
  org_id             uuid        not null references orgs(id) on delete cascade,
  stripe_account_id  text        not null,
  stripe_person_id   text,                        -- null = borrador local, aún no enviado

  -- Espejo de relationship.*
  es_representante   boolean     not null default false,
  es_dueno           boolean     not null default false,
  es_director        boolean     not null default false,
  es_ejecutivo       boolean     not null default false,
  porcentaje         numeric(5,2),                -- relationship.percent_ownership
  puesto             text,                        -- relationship.title

  -- Etiqueta para la lista. No es un dato de KYC.
  nombre_visible     text        not null default '',

  -- Espejo recortado de verification.* y requirements
  verificacion       text        not null default 'unverified', -- unverified | pending | verified
  verif_detalle      text,                        -- verification.details
  verif_codigo       text,                        -- verification.details_code
  doc_codigo         text,                        -- verification.document.details_code
  requisitos         jsonb       not null default '{}'::jsonb,

  orden              int         not null default 0,
  synced_at          timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create unique index if not exists uq_connect_personas_stripe
  on connect_personas(org_id, stripe_person_id) where stripe_person_id is not null;
-- El proveedor admite UN representante por cuenta; el índice lo vuelve
-- imposible de violar también del lado de Cord.
create unique index if not exists uq_connect_personas_representante
  on connect_personas(org_id) where es_representante;
create index if not exists idx_connect_personas_org
  on connect_personas(org_id, orden, created_at);

alter table connect_personas enable row level security;
drop policy if exists "rls_connect_personas" on connect_personas;
create policy "rls_connect_personas" on connect_personas
  using (org_id = nullif(current_setting('app.org_id', true), '')::uuid)
  with check (org_id = nullif(current_setting('app.org_id', true), '')::uuid);
-- Cord Ops mira todas las organizaciones a propósito, y sólo lee (carril withOpsTx).
drop policy if exists "ops_connect_personas" on connect_personas;
create policy "ops_connect_personas" on connect_personas
  using (current_setting('app.scope', true) = 'ops');
alter table connect_personas force row level security;

-- La captura móvil deja de apuntar a un person_id de texto libre. La columna
-- vieja se conserva mientras haya sesiones vivas creadas con el modelo anterior.
alter table identity_capture_sessions
  add column if not exists persona_id uuid references connect_personas(id) on delete cascade;
-- Huellas de lo YA subido en ESTA sesión. El proveedor auto-rechaza un archivo
-- reenviado ("Duplicate uploads fail automatically"), así que mandar dos veces el
-- mismo byte a byte —o el frente otra vez como reverso— quema un intento y
-- devuelve un rechazo que el usuario no entiende. Es un digest, no la imagen, y
-- muere con la fila a los minutos.
alter table identity_capture_sessions
  add column if not exists hashes jsonb not null default '{}'::jsonb;

-- ── Cadena de custodia y anti-abuso del enlace de captura ───────────────────
--
-- El token es una credencial PORTADORA que viaja en la URL: quien la intercepte
-- —por encima del hombro, por una captura de pantalla reenviada por chat, por el
-- historial del navegador— puede subir SUS documentos a la cuenta conectada de
-- otro negocio. Lo único que lo acotaba era un TTL de 10 minutos.
--
-- `device_hash` liga el PRIMER uso a los siguientes mediante una cookie propia.
-- No se puede atar nada en la emisión: el flujo legítimo es a propósito de dos
-- dispositivos (el escritorio genera el QR, el teléfono lo escanea) y el segundo
-- es desconocido al acuñar.
--
-- `ip_*` y `user_agent` son FORENSES, jamás autorización: las operadoras rotan
-- la IP a media sesión (CGNAT, salto Wi-Fi↔LTE), así que atar a IP garantiza
-- bloquear al usuario legítimo, y el user-agent se copia en un segundo.
alter table identity_capture_sessions add column if not exists created_by        text;
alter table identity_capture_sessions add column if not exists first_used_at     timestamptz;
alter table identity_capture_sessions add column if not exists usable_until      timestamptz;
alter table identity_capture_sessions add column if not exists closed_at         timestamptz;
alter table identity_capture_sessions add column if not exists intentos          int not null default 0;
alter table identity_capture_sessions add column if not exists intentos_fallidos int not null default 0;
alter table identity_capture_sessions add column if not exists device_hash       text;
alter table identity_capture_sessions add column if not exists device_reclamos   int not null default 0;
alter table identity_capture_sessions add column if not exists ip_primera        text;
alter table identity_capture_sessions add column if not exists ip_ultima         text;
alter table identity_capture_sessions add column if not exists user_agent        text;
-- Pista documental resuelta AL ACUÑAR el enlace (p. ej. 'pasaporte'): evita que
-- Cord PERSISTA el país de residencia de la persona sólo para pintar un texto.
-- Es transitoria, igual que la fila.
alter table identity_capture_sessions add column if not exists doc_hint          text;
-- El `delete` del cron barría la tabla entera por seq scan.
create index if not exists idx_ics_expira on identity_capture_sessions(expires_at);
create index if not exists idx_ics_persona on identity_capture_sessions(persona_id);

-- ── Evidencia de KYC (ago 2026) ────────────────────────────────────────────
--
-- Cord recolecta el KYC en su propia interfaz (Connect Custom), así que es Cord
-- quien responde de QUÉ envió, CUÁNDO y DESDE DÓNDE. Esa evidencia no puede
-- vivir en `identity_capture_sessions` (se borra a los minutos) ni en
-- `connect_personas` (es un espejo reconstruible del proveedor). Vive aquí, y
-- sobrevive a las dos.
--
-- NUNCA se guarda aquí: los bytes, ninguna miniatura, el `file_…` del proveedor
-- (es un handle recuperable con la llave de la plataforma, o sea un puntero a la
-- foto de la identificación), el número del documento, la fecha de nacimiento,
-- el domicilio, ni un hash PERCEPTUAL — ese describe el contenido de la imagen
-- mucho más que uno criptográfico.
--
-- La columna `metricas` es lo que convierte esta tabla en algo más que un
-- registro de cumplimiento: guarda lo que Cord MIDIÓ de la foto junto al
-- veredicto que después dio el proveedor. Ese par es el único dataset con el que
-- se pueden calibrar los umbrales de captura con evidencia en vez de con
-- intuición.
create table if not exists connect_kyc_evidencia (
  id                  uuid        default gen_random_uuid() primary key,
  org_id              uuid        not null references orgs(id) on delete cascade,
  stripe_account_id   text        not null,

  -- `persona_id` es la FK viva; `stripe_person_id` se denormaliza a propósito
  -- para que la evidencia sobreviva al borrado del espejo.
  persona_id          uuid        references connect_personas(id) on delete set null,
  stripe_person_id    text,
  alcance             text        not null,   -- persona | individual | company | cuenta

  -- Qué se envió y con qué propósito. Los propósitos NO son intercambiables.
  parte               text        not null,   -- front | back | address | documents.<tipo>
  proposito           text        not null,   -- identity_document | additional_verification | account_requirement
  tipo_documento      text,                   -- pasaporte | id_nacional | licencia | residencia (DECLARADO)

  -- Forma técnica del archivo, no su contenido.
  sha256              text        not null,
  bytes               int         not null,
  mime                text        not null,
  ancho               int,
  alto                int,

  -- Métricas de calidad medidas en el cliente: números, nunca píxeles.
  metricas            jsonb       not null default '{}'::jsonb,

  -- Cadena de custodia. `capture_session_id` va SIN FK a propósito: la sesión
  -- efímera se borra a los minutos y esta fila se queda.
  origen              text        not null,   -- captura_movil | escritorio
  capture_session_id  uuid,
  emitido_por         text,                   -- user_id que acuñó el enlace
  subido_por          text,                   -- user_id si vino de escritorio; null desde el teléfono
  ip                  text,
  user_agent          text,

  -- Veredicto del proveedor. Llega DESPUÉS, por webhook.
  estado              text        not null default 'enviado', -- enviado | pendiente | verificado | rechazado
  codigo_proveedor    text,
  detalle_proveedor   text,
  resuelto_at         timestamptz,

  created_at          timestamptz not null default now()
);
create index if not exists idx_kyc_evid_org     on connect_kyc_evidencia(org_id, created_at desc);
create index if not exists idx_kyc_evid_persona on connect_kyc_evidencia(org_id, persona_id, created_at desc);
-- El dedupe SIEMPRE va acotado a la organización: un índice global de `sha256`
-- sería un oráculo cross-tenant ("¿alguien más subió este archivo?").
create index if not exists idx_kyc_evid_sha     on connect_kyc_evidencia(org_id, sha256);
create index if not exists idx_kyc_evid_abierta on connect_kyc_evidencia(org_id, stripe_person_id, created_at desc)
  where estado in ('enviado', 'pendiente');
create index if not exists idx_kyc_evid_retencion on connect_kyc_evidencia(created_at);

alter table connect_kyc_evidencia enable row level security;
drop policy if exists "rls_connect_kyc_evidencia" on connect_kyc_evidencia;
create policy "rls_connect_kyc_evidencia" on connect_kyc_evidencia
  using (org_id = nullif(current_setting('app.org_id', true), '')::uuid)
  with check (org_id = nullif(current_setting('app.org_id', true), '')::uuid);
-- El webhook cierra la fila con el veredicto y el cron de retención la purga:
-- ambos barren cross-org por el carril de sistema.
drop policy if exists "system_connect_kyc_evidencia" on connect_kyc_evidencia;
create policy "system_connect_kyc_evidencia" on connect_kyc_evidencia
  using (current_setting('app.scope', true) = 'system')
  with check (current_setting('app.scope', true) = 'system');
-- Cord Ops mira todas las organizaciones a propósito, y sólo lee.
drop policy if exists "ops_connect_kyc_evidencia" on connect_kyc_evidencia;
create policy "ops_connect_kyc_evidencia" on connect_kyc_evidencia
  using (current_setting('app.scope', true) = 'ops');
alter table connect_kyc_evidencia force row level security;

-- ── Cobros parciales: anticipo / saldo / cuotas (jul 2026) ──────────────────
-- Una cotización puede cobrarse en varias "rebanadas": anticipo + saldo (si el
-- vendedor pidió un % de anticipo), cuotas negociadas por el agente de cobranza,
-- o una sola fila tipo 'total' (creada de forma perezosa por payment-intent.ts
-- para el pago simple). Cada fila = un cobro pagable con su PROPIO PaymentIntent
-- de Stripe (crucial para SPEI: cada cobro conserva su CLABE estable).
-- La cotización pasa a 'paid' solo cuando NO quedan cobros 'pendiente'.
create table if not exists cotizacion_cobros (
  id            uuid        default gen_random_uuid() primary key,
  org_id        uuid        not null references orgs(id) on delete cascade,
  cotizacion_id uuid        not null references cotizaciones(id) on delete cascade,
  tipo          text        not null,             -- 'total' | 'anticipo' | 'saldo' | 'cuota'
  numero_cuota  int         not null default 0,   -- > 0 solo para tipo='cuota' (NOT NULL para que el unique aplique)
  monto         numeric     not null,
  status        text        not null default 'pendiente', -- 'pendiente' | 'pagado' | 'cancelado'
  stripe_payment_intent_id text,
  payment_method text,                            -- 'tarjeta' | 'spei' (al pagarse)
  paid_at       timestamptz,
  vence         date,                             -- null = pagable de inmediato
  created_at    timestamptz default now(),
  unique (cotizacion_id, tipo, numero_cuota)
);
create index if not exists idx_cotizacion_cobros_cot on cotizacion_cobros(cotizacion_id);
create index if not exists idx_cotizacion_cobros_org on cotizacion_cobros(org_id);
create index if not exists idx_cotizacion_cobros_pi on cotizacion_cobros(stripe_payment_intent_id);

alter table cotizacion_cobros enable row level security;
drop policy if exists "rls_cotizacion_cobros" on cotizacion_cobros;
create policy "rls_cotizacion_cobros" on cotizacion_cobros
  using (org_id = nullif(current_setting('app.org_id', true), '')::uuid)
  with check (org_id = nullif(current_setting('app.org_id', true), '')::uuid);
alter table cotizacion_cobros force row level security;
alter table cotizacion_cobros add column if not exists payment_failed_at timestamptz;
alter table cotizacion_cobros add column if not exists payment_error_code text;
alter table cotizacion_cobros add column if not exists metodo_pago text;
-- Mercado Pago: la preferencia con la que se cobró y el pago que la saldó. El
-- unique del pago es lo que hace idempotente el webhook, que Mercado Pago
-- reenvía varias veces por diseño.
alter table cotizacion_cobros add column if not exists mp_preference_id text;
alter table cotizacion_cobros add column if not exists mp_payment_id text;
alter table cotizacion_cobros add column if not exists mp_preference_at timestamptz;
create unique index if not exists uq_cobros_mp_payment on cotizacion_cobros(org_id, mp_payment_id)
  where mp_payment_id is not null;
alter table cotizacion_cobros add column if not exists application_fee_cents int;
alter table cotizacion_cobros add column if not exists stripe_fee_cents int;
alter table cotizacion_cobros add column if not exists fee_base_cents int;
alter table cotizacion_cobros add column if not exists fee_iva_cents int;
alter table cotizacion_cobros add column if not exists fee_total_cents int;
alter table cotizacion_cobros add column if not exists neto_cents int;
alter table cotizacion_cobros add column if not exists stripe_charge_id text;
alter table cotizacion_cobros add column if not exists stripe_balance_transaction_id text;
alter table cotizacion_cobros add column if not exists stripe_application_fee_id text;
alter table cotizacion_cobros add column if not exists reembolsado_cents int not null default 0;
alter table cotizacion_cobros add column if not exists reembolso_status text;
alter table cotizacion_cobros add column if not exists refunded_at timestamptz;
create unique index if not exists idx_cotizacion_cobros_org_payment_intent
  on cotizacion_cobros(org_id, stripe_payment_intent_id) where stripe_payment_intent_id is not null;

-- BEGIN quote-payment-attempts
-- One durable creation per predecessor, shared by competing payment methods.
-- Do not delete an unresolved attempt: the provider may already have created it.
create unique index if not exists uq_cotizacion_cobros_org_id_id
  on cotizacion_cobros(org_id, id);
create table if not exists cotizacion_pago_intentos (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id),
  cobro_id uuid not null,
  predecessor text not null,
  request_hash text not null check (request_hash ~ '^[0-9a-f]{64}$'),
  stripe_payment_intent_id text,
  created_at timestamptz not null default now(),
  unique (org_id, cobro_id, predecessor),
  foreign key (org_id, cobro_id) references cotizacion_cobros(org_id, id)
);
alter table cotizacion_pago_intentos enable row level security;
alter table cotizacion_pago_intentos force row level security;
drop policy if exists rls_cotizacion_pago_intentos on cotizacion_pago_intentos;
create policy rls_cotizacion_pago_intentos on cotizacion_pago_intentos
  using (org_id = nullif(current_setting('app.org_id', true), '')::uuid)
  with check (org_id = nullif(current_setting('app.org_id', true), '')::uuid);
-- END quote-payment-attempts


create table if not exists comisiones (
  id                            uuid primary key default gen_random_uuid(),
  org_id                        uuid not null references orgs(id) on delete cascade,
  cobro_id                      uuid references cotizacion_cobros(id) on delete set null,
  stripe_payment_intent_id      text not null,
  stripe_charge_id              text,
  stripe_balance_transaction_id text,
  stripe_application_fee_id     text,
  metodo_pago                   text not null,
  moneda                        text not null default 'MXN',
  monto_cents                   int not null,
  fee_base_cents                int not null default 0,
  fee_iva_cents                 int not null default 0,
  fee_total_cents               int not null default 0,
  stripe_fee_cents              int,
  neto_vendedor_cents           int,
  status                        text not null default 'pending',
  refunded_cents                int not null default 0,
  created_at                    timestamptz not null default now(),
  updated_at                    timestamptz not null default now(),
  unique (org_id, stripe_payment_intent_id)
);
create index if not exists idx_comisiones_org_created on comisiones(org_id, created_at desc);
alter table comisiones enable row level security;
drop policy if exists "rls_comisiones" on comisiones;
create policy "rls_comisiones" on comisiones
  using (org_id = nullif(current_setting('app.org_id', true), '')::uuid)
  with check (org_id = nullif(current_setting('app.org_id', true), '')::uuid);
drop policy if exists "system_comisiones" on comisiones;
create policy "system_comisiones" on comisiones
  using (current_setting('app.scope', true) = 'system')
  with check (current_setting('app.scope', true) = 'system');
alter table comisiones force row level security;

-- % de anticipo requerido por cotización (null = sin anticipo, pago normal).
alter table cotizaciones add column if not exists anticipo_pct numeric;
-- Default del negocio: pre-llena el editor en cotizaciones nuevas (Ajustes › Cotizaciones).
alter table orgs add column if not exists anticipo_default_pct numeric;

-- ── Cobros recurrentes: igualas / retainers mensuales (jul 2026) ─────────────
-- Una cotización marcada `es_recurrente` (solo términos = contado, mutuamente
-- excluyente con anticipo) NO se materializa como un cobro único: al autorizarla
-- el cliente, se crea una Subscription de Stripe sobre la CUENTA CONECTADA del
-- vendedor (dinero directo a su banco) que cobra el total
-- automáticamente cada mes con la tarjeta guardada. Cada suscripción vive en
-- cotizacion_suscripciones (una por cotización).
alter table cotizaciones add column if not exists es_recurrente boolean default false;

create table if not exists cotizacion_suscripciones (
  id            uuid        default gen_random_uuid() primary key,
  org_id        uuid        not null references orgs(id) on delete cascade,
  cotizacion_id uuid        not null references cotizaciones(id) on delete cascade,
  cliente_id    uuid        references clientes(id) on delete set null,
  -- Todos los objetos de Stripe viven en la cuenta CONECTADA del vendedor.
  stripe_account_id      text not null,
  stripe_subscription_id text,
  stripe_customer_id     text,
  stripe_price_id        text,
  stripe_product_id      text,
  monto        numeric     not null,               -- monto mensual (misma escala que cotizacion_cobros.monto: unidades, no centavos)
  moneda       text        not null default 'MXN',
  intervalo    text        not null default 'month',
  -- 'incomplete' (creada, aún sin autorizar) | 'active' | 'past_due' | 'canceled'
  estado       text        not null default 'incomplete',
  current_period_end   timestamptz,
  cancel_at_period_end boolean not null default false,
  created_at   timestamptz default now(),
  unique (cotizacion_id)                            -- una suscripción por cotización
);
alter table cotizacion_suscripciones add column if not exists application_fee_percent numeric;
create index if not exists idx_cotizacion_suscripciones_cot on cotizacion_suscripciones(cotizacion_id);
create index if not exists idx_cotizacion_suscripciones_org on cotizacion_suscripciones(org_id);
create index if not exists idx_cotizacion_suscripciones_sub on cotizacion_suscripciones(stripe_subscription_id);

alter table cotizacion_suscripciones enable row level security;
drop policy if exists "rls_cotizacion_suscripciones" on cotizacion_suscripciones;
create policy "rls_cotizacion_suscripciones" on cotizacion_suscripciones
  using (org_id = nullif(current_setting('app.org_id', true), '')::uuid)
  with check (org_id = nullif(current_setting('app.org_id', true), '')::uuid);
alter table cotizacion_suscripciones force row level security;

-- ── Reembolsos y contracargos de Cord Pagos (ago 2026) ─────────────────────
-- El nonce de reembolso es de un solo uso, vive pocos minutos y se persiste
-- únicamente como sha256. Evita doble clic y replays incluso entre instancias.
create table if not exists refund_nonces (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references orgs(id) on delete cascade,
  cobro_id         uuid not null references cotizacion_cobros(id) on delete cascade,
  nonce_hash       text not null unique,
  max_amount_cents int not null check (max_amount_cents > 0),
  expires_at       timestamptz not null,
  consumed_at      timestamptz,
  created_by       uuid references users(id) on delete set null,
  created_at       timestamptz not null default now()
);
create index if not exists idx_refund_nonces_lookup on refund_nonces(org_id, cobro_id, expires_at);
alter table refund_nonces enable row level security;
drop policy if exists "rls_refund_nonces" on refund_nonces;
create policy "rls_refund_nonces" on refund_nonces
  using (org_id = nullif(current_setting('app.org_id', true), '')::uuid)
  with check (org_id = nullif(current_setting('app.org_id', true), '')::uuid);
alter table refund_nonces force row level security;

create table if not exists cobro_reembolsos (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null references orgs(id) on delete cascade,
  cobro_id           uuid not null references cotizacion_cobros(id) on delete cascade,
  stripe_refund_id   text unique,
  mp_refund_id       text unique,
  amount_cents       int not null check (amount_cents > 0),
  currency           text not null default 'MXN',
  status             text not null default 'pending',
  reason             text,
  manual             boolean not null default false,
  failure_reason     text,
  requested_by       uuid references users(id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index if not exists idx_cobro_reembolsos_org on cobro_reembolsos(org_id, created_at desc);
create index if not exists idx_cobro_reembolsos_cobro on cobro_reembolsos(cobro_id);
alter table cobro_reembolsos enable row level security;
drop policy if exists "rls_cobro_reembolsos" on cobro_reembolsos;
create policy "rls_cobro_reembolsos" on cobro_reembolsos
  using (org_id = nullif(current_setting('app.org_id', true), '')::uuid)
  with check (org_id = nullif(current_setting('app.org_id', true), '')::uuid);
alter table cobro_reembolsos force row level security;

create table if not exists cobro_disputas (
  id                    uuid primary key default gen_random_uuid(),
  org_id                uuid not null references orgs(id) on delete cascade,
  cobro_id              uuid references cotizacion_cobros(id) on delete set null,
  stripe_dispute_id     text not null unique,
  stripe_charge_id      text,
  amount_cents          int not null default 0,
  currency              text not null default 'MXN',
  reason                text,
  status                text not null,
  evidence_due_at       timestamptz,
  evidence_draft        jsonb not null default '{}'::jsonb,
  evidence_submitted_at timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index if not exists idx_cobro_disputas_org on cobro_disputas(org_id, status, created_at desc);
alter table cobro_disputas enable row level security;
drop policy if exists "rls_cobro_disputas" on cobro_disputas;
create policy "rls_cobro_disputas" on cobro_disputas
  using (org_id = nullif(current_setting('app.org_id', true), '')::uuid)
  with check (org_id = nullif(current_setting('app.org_id', true), '')::uuid);
alter table cobro_disputas force row level security;

-- Borrador mensual para facturar la comisión de la plataforma. El cron solo
-- cierra el periodo y alerta; el timbrado definitivo requiere revisión humana.
create table if not exists comision_invoice_batches (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid references orgs(id) on delete restrict,
  periodo        text not null,
  currency       text not null default 'MXN',
  fee_base_cents bigint not null default 0,
  fee_iva_cents  bigint not null default 0,
  total_cents    bigint not null default 0,
  status         text not null default 'draft',
  facturapi_id   text,
  fiscal_uuid    text,
  provider_data  jsonb not null default '{}'::jsonb,
  invoice_error  text,
  issued_at      timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
alter table comision_invoice_batches add column if not exists org_id uuid references orgs(id) on delete restrict;
alter table comision_invoice_batches add column if not exists fiscal_uuid text;
alter table comision_invoice_batches add column if not exists provider_data jsonb not null default '{}'::jsonb;
alter table comision_invoice_batches add column if not exists invoice_error text;
alter table comision_invoice_batches add column if not exists issued_at timestamptz;
alter table comision_invoice_batches drop constraint if exists comision_invoice_batches_periodo_key;
create unique index if not exists idx_comision_invoice_batches_org_periodo
  on comision_invoice_batches(org_id, periodo) where org_id is not null;
alter table comision_invoice_batches enable row level security;
drop policy if exists "system_comision_invoice_batches" on comision_invoice_batches;
create policy "system_comision_invoice_batches" on comision_invoice_batches
  using (current_setting('app.scope', true) = 'system')
  with check (current_setting('app.scope', true) = 'system');
alter table comision_invoice_batches force row level security;

-- ── Desempeño por vendedor (jul 2026) ─────────────────────────────────────
-- Quién creó cada cotización (clerk_user_id) — antes no se guardaba, así que
-- no había forma de atribuir cierres/cobros a un miembro del equipo. Nullable:
-- las cotizaciones creadas vía API key (M2M, sin sesión) o de antes de este
-- campo simplemente no tienen vendedor asignado ("Sin asignar" en el reporte).
alter table cotizaciones add column if not exists creado_por text;
create index if not exists idx_cotizaciones_creado_por on cotizaciones(org_id, creado_por) where creado_por is not null;



-- ─────────────────────────────────────────────────────────────────────────────
-- KITS DE COTIZACIÓN (jul 2026) — paquetes pre-armados de líneas para insertar de
-- un clic en el editor. Pura conveniencia de captura: al insertarse se vuelven
-- cotizacion_items normales, indistinguibles de las que se agregarían a mano
-- (no hay ninguna referencia desde cotizacion_items hacia un kit). Mismo patrón
-- que cédulas: RLS directa por org_id + FORCE, sin carril public_token (no hay
-- vista pública de un kit).
create table if not exists kits (
  id          uuid        default gen_random_uuid() primary key,
  org_id      uuid        not null references orgs(id) on delete cascade,
  nombre      text        not null,
  descripcion text,
  activo      boolean     not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists idx_kits_org on kits(org_id, activo, nombre);

-- Precio de combo (opcional, jul 2026): precio TOTAL fijo para una unidad del
-- kit, distinto a la suma de precios de lista de sus líneas. null = sin precio
-- de combo (comportamiento original — cada línea conserva su precio de lista/
-- descuento normal). Cuando se inserta un kit con precio de combo, el editor
-- prorratea ese total entre las líneas de catálogo (ver `insertKit` en
-- nueva.astro) y fija cada `negociado` como override — las líneas libres no
-- participan del prorrateo (no tienen precio de catálogo contra qué repartir).
alter table kits add column if not exists precio_combo numeric;

-- producto_id nullable = renglón de línea libre dentro del kit (ej. "mano de
-- obra de instalación"); org_id denormalizado para RLS sin JOIN (mismo patrón
-- que cedula_filas/cedula_valores).
create table if not exists kit_items (
  id          uuid        default gen_random_uuid() primary key,
  kit_id      uuid        not null references kits(id) on delete cascade,
  org_id      uuid        not null references orgs(id) on delete cascade,
  producto_id uuid        references productos(id) on delete set null,
  descripcion text        not null,
  cantidad    numeric     not null default 1,
  orden       int         not null default 0
);
create index if not exists idx_kit_items_kit on kit_items(kit_id, orden);
create index if not exists idx_kit_items_org on kit_items(org_id);

alter table kits      enable row level security;
alter table kit_items enable row level security;

create policy "rls_kits" on kits
  using (org_id = nullif(current_setting('app.org_id', true), '')::uuid);
create policy "rls_kit_items" on kit_items
  using (org_id = nullif(current_setting('app.org_id', true), '')::uuid);

alter table kits      force row level security;
alter table kit_items force row level security;

-- ── Suscriptores del Blog (landing, jul 2026) ───────────────────────────────
-- Tabla standalone (NO multi-tenant, sin org_id): recoge emails de visitantes
-- del blog público que se suscriben al newsletter desde BlogCTA.
-- El endpoint /api/blog/subscribe inserta aquí (ON CONFLICT do nothing).
-- Sin RLS: no es dato de tenant, es un lead de marketing.
create table if not exists blog_subscribers (
  id          uuid        default gen_random_uuid() primary key,
  email       text        not null unique,
  created_at  timestamptz default now()
);

-- Doble opt-in y espejo mínimo de Resend Marketing. Neon conserva la evidencia
-- del consentimiento; Resend gobierna los Broadcasts, segmentos y supresiones.
alter table blog_subscribers add column if not exists locale text not null default 'es';
alter table blog_subscribers add column if not exists status text not null default 'pending';
alter table blog_subscribers add column if not exists confirmation_token_hash text;
alter table blog_subscribers add column if not exists confirmation_expires_at timestamptz;
alter table blog_subscribers add column if not exists confirmation_sent_at timestamptz;
alter table blog_subscribers add column if not exists confirmed_at timestamptz;
alter table blog_subscribers add column if not exists unsubscribed_at timestamptz;
alter table blog_subscribers add column if not exists resend_contact_id text;
alter table blog_subscribers add column if not exists resend_synced_at timestamptz;
alter table blog_subscribers add column if not exists resend_updated_at timestamptz;
alter table blog_subscribers add column if not exists updated_at timestamptz not null default now();

do $$ begin
  alter table blog_subscribers add constraint blog_subscribers_locale_check
    check (locale in ('es', 'en'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table blog_subscribers add constraint blog_subscribers_status_check
    check (status in ('pending', 'confirmed', 'unsubscribed'));
exception when duplicate_object then null; end $$;

create unique index if not exists uq_blog_subscribers_confirmation_token
  on blog_subscribers(confirmation_token_hash)
  where confirmation_token_hash is not null;
create index if not exists idx_blog_subscribers_status
  on blog_subscribers(status, locale, created_at desc);

-- ════════════════════════════════════════════════════════════════════════════
-- OUTBOX de webhooks salientes — durabilidad real (jul 2026)
-- ════════════════════════════════════════════════════════════════════════════
-- Antes, dispatchQuoteEvent entregaba EN LÍNEA con 2 intentos y 300ms fijos: si
-- la invocación serverless moría a media entrega, el evento se perdía sin dejar
-- rastro (no había fila "pendiente" en ningún lado). Ahora cada evento se
-- ENCOLA primero — una fila por evento lógico × endpoint suscrito — y solo
-- DESPUÉS se intenta entregar. Si la función muere, el cron de sweep
-- (/api/cron/webhooks) recupera el trabajo pendiente sin que nadie tenga que
-- reintentar a mano. `payload` son los bytes EXACTOS que se firman: nunca se
-- re-serializan en un reintento (la firma dejaría de cuadrar y el receptor
-- perdería la capacidad de deduplicar por event_id).
create table if not exists webhook_events (
  id             uuid        default gen_random_uuid() primary key,
  org_id         uuid        not null references orgs(id) on delete cascade,
  webhook_id     uuid        not null references webhooks(id) on delete cascade,
  event_id       text        not null,                    -- evt_… público, MISMO valor para los N endpoints de un evento
  evento         text        not null,
  payload        text        not null,                    -- JSON exacto (inmutable, ya incluye el event_id)
  dedupe_key     text,                                     -- idempotencia del PRODUCTOR (null = sin dedupe)
  estado         text        not null default 'pending',   -- pending | delivering | succeeded | failed | canceled
  intentos       int         not null default 0,
  next_retry_at  timestamptz not null default now(),
  lease_id       uuid,
  lease_until    timestamptz,
  last_status    int,
  last_error     text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  delivered_at   timestamptz
);

-- Índice del SWEEPER: PARCIAL, así que se mantiene diminuto aunque la tabla
-- acumule millones de filas 'succeeded'/'canceled' con el tiempo.
create index if not exists idx_wh_events_due on webhook_events (next_retry_at)
  where estado in ('pending', 'delivering');
create index if not exists idx_wh_events_hook on webhook_events(webhook_id, created_at desc);
create index if not exists idx_wh_events_org  on webhook_events(org_id, created_at desc);

-- Idempotencia de ENQUEUE: reintentar dispatchQuoteEvent con el mismo
-- dedupe_key (ej. el mismo pago de Stripe reprocesado) no duplica el fan-out
-- hacia un mismo endpoint. Parcial porque dedupe_key es opcional.
create unique index if not exists uq_wh_events_dedupe
  on webhook_events(webhook_id, dedupe_key) where dedupe_key is not null;

alter table webhook_events enable row level security;
-- El sweeper (cron cross-org) usa el carril de sistema app.scope='system' (ver
-- withSystemTx en db.ts) SOLO para el claim de filas de varias orgs a la vez;
-- el resto de las queries sobre una fila ya reclamada corren agrupadas por
-- org_id vía withOrgTx normal, como cualquier otra tabla.
create policy "rls_webhook_events" on webhook_events
  using (
    org_id = nullif(current_setting('app.org_id', true), '')::uuid
    or current_setting('app.scope', true) = 'system'
  );
alter table webhook_events force row level security;

-- ── Salud del endpoint: racha de fallos → auto-desactivación (jul 2026) ─────
-- La racha cuenta MENSAJES agotados (los 11 intentos de un evento fallaron),
-- no intentos sueltos — si contara intentos, un mal minuto desactivaría el
-- endpoint. Ver settle()/runSweep() en src/lib/webhook-delivery.ts.
alter table webhooks add column if not exists fallos_consecutivos int not null default 0;
alter table webhooks add column if not exists deshabilitado_at    timestamptz;
alter table webhooks add column if not exists deshabilitado_motivo text;
alter table webhooks add column if not exists aviso_fallos_at     timestamptz;  -- throttle del correo de aviso (1×/24h)

-- ── Rotación de secreto con ventana de solape (jul 2026) ────────────────────
-- Durante la ventana, la firma V1 lleva AMBOS secretos (nuevo y viejo) para que
-- un consumidor que todavía no actualizó su código siga verificando sin tocar
-- nada. secret_prev_expira = null → sin rotación en curso.
alter table webhooks add column if not exists secret_prev         text;
alter table webhooks add column if not exists secret_prev_expira  timestamptz;
alter table webhooks add column if not exists secret_rotado_at    timestamptz;

-- ── Trazabilidad log ↔ outbox ────────────────────────────────────────────────
-- Cada intento HTTP (webhook_deliveries) queda ligado al mensaje del outbox
-- que lo originó, y lleva su propio event_id copiado (para no tener que hacer
-- JOIN solo para mostrar el id en la UI).
alter table webhook_deliveries add column if not exists message_id uuid references webhook_events(id) on delete set null;
alter table webhook_deliveries add column if not exists event_id   text;
create index if not exists idx_wh_deliveries_msg on webhook_deliveries(message_id);

-- ── Idempotencia de tools MCP de escritura (jul 2026) ───────────────────────
-- Un cliente MCP puede reintentar una llamada (timeout, red inestable) sin
-- saber si la anterior sí llegó a ejecutarse — sin esto, `crear_cotizacion_
-- borrador` crea una cotización DUPLICADA por cada reintento. La tool acepta
-- un `idempotency_key` opcional (mismo patrón que Stripe: el CLIENTE lo
-- genera y lo repite en un reintento); la llave está scoped a la API key
-- (`key_id`), no solo a la org — dos integraciones distintas de la misma org
-- podrían coincidir en un idempotency_key trivial ("1") sin pisarse. Se
-- guarda la respuesta COMPLETA ya serializada: un replay devuelve EXACTO lo
-- que se devolvió la primera vez, sin tener que reconstruirla del estado
-- actual (que pudo cambiar desde entonces).
create table if not exists mcp_idempotency (
  id               uuid        default gen_random_uuid() primary key,
  org_id           uuid        not null references orgs(id) on delete cascade,
  key_id           uuid        not null references api_keys(id) on delete cascade,
  idempotency_key  text        not null,
  tool             text        not null,
  response         jsonb       not null,
  created_at       timestamptz not null default now()
);
create unique index if not exists uq_mcp_idem on mcp_idempotency(key_id, idempotency_key);

alter table mcp_idempotency enable row level security;
create policy "rls_mcp_idempotency" on mcp_idempotency
  using (org_id = nullif(current_setting('app.org_id', true), '')::uuid);
alter table mcp_idempotency force row level security;

-- ── Resolutores estrechos para webhooks bajo un rol NOBYPASSRLS ────────────
-- Solo revelan un org_id a partir de identificadores firmados del procesador.
-- Toda lectura/escritura posterior debe volver a withOrgTx(org_id, ...).
create or replace function cord_resolve_org_for_connected_account(p_account text)
returns uuid
language sql stable security definer
set search_path = public, pg_temp
as $$
  select id from orgs
   where p_account is not null and p_account <> '' and stripe_account_id = p_account
   limit 1
$$;

create or replace function cord_demo_org_id()
returns uuid
language sql stable security definer
set search_path = public, pg_temp
as $$
  select id from orgs where rfc = 'FERR010203XYZ' limit 1
$$;

create or replace function cord_resolve_public_quote(p_token text)
returns table(id uuid, org_id uuid)
language sql stable security definer
set search_path = public, pg_temp
as $$
  select c.id, c.org_id from cotizaciones c
   where p_token is not null and p_token <> '' and c.public_token = p_token
   limit 1
$$;

create or replace function cord_pending_payment_count()
returns bigint
language sql stable security definer
set search_path = public, pg_temp
as $$
  select count(*) from cotizacion_cobros
   where status = 'pendiente' and stripe_payment_intent_id is not null
$$;

-- Los cobros pendientes más recientes con su PaymentIntent y la cuenta conectada
-- donde vive. Lo usa la sonda de "confirmación de pagos" para preguntarle a
-- Stripe si alguno ya se cobró sin que Cord lo registrara: un cobro pendiente
-- casi siempre es un cliente que no ha pagado, y eso no es una caída.
create or replace function cord_pending_payment_intents(p_limit int default 10)
returns table (payment_intent text, stripe_account text)
language sql stable security definer
set search_path = public, pg_temp
as $$
  select c.stripe_payment_intent_id, o.stripe_account_id
    from cotizacion_cobros c join orgs o on o.id = c.org_id
   where c.status = 'pendiente' and c.stripe_payment_intent_id is not null
   order by c.created_at desc
   limit least(greatest(coalesce(p_limit, 10), 1), 25)
$$;

create or replace function cord_resolve_org_for_quote(p_quote uuid, p_account text default null)
returns uuid
language sql stable security definer
set search_path = public, pg_temp
as $$
  select c.org_id
    from cotizaciones c join orgs o on o.id = c.org_id
   where c.id = p_quote
     and (p_account is null or p_account = '' or o.stripe_account_id = p_account)
   limit 1
$$;

create or replace function cord_resolve_org_for_billing(p_subscription text, p_customer text)
returns uuid
language sql stable security definer
set search_path = public, pg_temp
as $$
  select id from orgs
   where (p_subscription is not null and p_subscription <> '' and stripe_subscription_id = p_subscription)
      or (p_customer is not null and p_customer <> '' and stripe_customer_id = p_customer)
   limit 1
$$;

create or replace function cord_resolve_org_for_quote_subscription(p_subscription text, p_account text)
returns uuid
language sql stable security definer
set search_path = public, pg_temp
as $$
  select org_id from cotizacion_suscripciones
   where p_subscription is not null and p_subscription <> ''
     and stripe_subscription_id = p_subscription
     and stripe_account_id = p_account
   limit 1
$$;

revoke all on function cord_resolve_org_for_connected_account(text) from public;
revoke all on function cord_demo_org_id() from public;
revoke all on function cord_resolve_public_quote(text) from public;
revoke all on function cord_pending_payment_count() from public;
revoke all on function cord_pending_payment_intents(int) from public;
revoke all on function cord_resolve_org_for_quote(uuid, text) from public;
revoke all on function cord_resolve_org_for_billing(text, text) from public;
revoke all on function cord_resolve_org_for_quote_subscription(text, text) from public;

-- ══════════════════════════════════════════════════════════════════════════
-- ── Auth hardening (ago 2026) ────────────────────────────────────────────
-- Endurecimiento del sistema de auth propio post-migración de Clerk. Ver
-- docs/historial-auth-clerk.md para el detalle completo de la auditoría.
-- ══════════════════════════════════════════════════════════════════════════

-- users: drift real corregido (avatar_url lo escribía google/callback.ts sin
-- estar en el schema base — quedaba en blanco en cualquier BD nueva), más
-- verificación de correo, tracking de cambio de password, y lockout POR
-- CUENTA (no solo por IP, que un botnet puede repartir).
alter table users add column if not exists avatar_url            text;
alter table users add column if not exists email_verified_at     timestamptz;
alter table users add column if not exists password_changed_at   timestamptz;
alter table users add column if not exists failed_login_count    int not null default 0;
alter table users add column if not exists locked_until          timestamptz;
alter table users add column if not exists totp_backup_codes     text[];   -- hashes sha256, nunca en claro
alter table users add column if not exists totp_confirmed_at     timestamptz;
alter table users add column if not exists suspended_at          timestamptz;
alter table users add column if not exists suspended_reason      text;

-- sessions: el id pasa a guardar sha256(token) en vez del token en CLARO
-- (una lectura de la tabla = session hijack de cualquier usuario). El
-- cliente sigue recibiendo el token crudo en la cookie; nunca se persiste.
-- ⚠️ Las filas viejas (con el token SIN hashear como id) quedan huérfanas —
-- ningún login futuro las volverá a encontrar (compara contra un hash), así
-- que expiran solas y se limpian por su cuenta la próxima vez que
-- validateSession/el cron las toque. Ver scripts/migrate-auth-hardening.mjs
-- para el borrado inmediato de esas filas viejas (invalida sesiones activas
-- — una sola vez, corrido a mano justo después de este schema). Índices que
-- faltaban por completo (user_id/expires_at no tenían NINGUNO) + ciclo de
-- vida real: last_used_at (sliding expiry), revoked_at (revocación
-- individual sin borrar el registro), absolute_expires_at (tope duro).
alter table sessions add column if not exists last_used_at        timestamptz not null default now();
alter table sessions add column if not exists revoked_at          timestamptz;
-- Default alineado a SESSION_ABSOLUTE_MS de src/lib/auth.ts (180 días) — createSession
-- siempre pasa el valor explícito, este default solo aplica a una columna agregada
-- sin backfill explícito (fresh DB). Antes decía 90 días y contradecía al código real.
alter table sessions add column if not exists absolute_expires_at timestamptz not null default (now() + interval '180 days');
create index if not exists idx_sessions_user on sessions(user_id);
create index if not exists idx_sessions_expires on sessions(expires_at);

-- password_reset_tokens: mismo cambio — id pasa a sha256(token). Las filas
-- viejas (sin hashear) quedan huérfanas igual que sessions — un token de 15
-- minutos ya vencido para cuando se lea esto de cualquier forma.
alter table password_reset_tokens add column if not exists used_at timestamptz;

-- Verificación de correo obligatoria antes de entrar a /app (registro con
-- password; Google/Apple entran directo solo si el proveedor reporta
-- email_verified=true). Mismo patrón que password_reset_tokens: id =
-- sha256(token), token crudo solo en el link del correo.
create table if not exists email_verification_tokens (
  id          text        primary key,
  user_id     uuid        not null references users(id) on delete cascade,
  email       text        not null,   -- snapshot del correo a verificar (puede diferir si el user lo cambió después)
  expires_at  timestamptz not null,
  created_at  timestamptz not null default now()
);
create index if not exists idx_email_verif_user on email_verification_tokens(user_id);

-- Reto de 2do factor entre "password correcto" y "sesión real" — vive 5 min,
-- de un solo uso, ligado a la cuenta. Aplica al login con password Y a los
-- callbacks de Google/Apple (si el usuario ya tiene TOTP activo, CUALQUIER
-- método de entrada exige el segundo factor — un login social no debe poder
-- saltarse el 2FA que el usuario activó). Los passkeys NO pasan por aquí:
-- WebAuthn ya es autenticación fuerte por sí sola (posesión + biometría).
create table if not exists two_factor_challenges (
  id          text        primary key,   -- sha256(token)
  user_id     uuid        not null references users(id) on delete cascade,
  expires_at  timestamptz not null,
  created_at  timestamptz not null default now()
);
create index if not exists idx_2fa_challenge_user on two_factor_challenges(user_id);

-- org_members: las invitaciones por link no caducaban nunca. El token
-- también pasa a guardarse hasheado (mismo motivo que sessions — hoy
-- cualquier lectura de la tabla filtra links de invitación vivos).
-- El filtro length()=32 hace esto IDEMPOTENTE: el token viejo (sin hashear)
-- era crypto.randomUUID().replace(/-/g,'') = 32 hex chars; un sha256 hex ya
-- son 64 — sin este guard, re-ejecutar `npm run db:migrate` (el runner está
-- diseñado para ser re-ejecutable) volvería a hashear un valor YA hasheado,
-- invalidando en silencio cualquier invitación pendiente en cada re-corrida.
alter table org_members add column if not exists token_expires_at timestamptz;
update org_members set token = encode(digest(token, 'sha256'), 'hex') where token is not null and length(token) = 32;

-- audit_log: faltaba el user-agent (sessions sí lo captura desde siempre).
alter table audit_log add column if not exists user_agent text;

-- Operadores internos de Cord. La allowlist efectiva se valida TAMBIÉN en
-- src/lib/ops-auth.ts (defensa en profundidad): una fila insertada por error
-- o por una futura pantalla administrativa no basta para ganar acceso. No hay
-- endpoint público para crear operadores; estas dos filas se siembran desde
-- usuarios ya existentes y cualquier alta futura exige cambio de código +
-- migración revisable.
create table if not exists ops_operators (
  user_id     uuid        primary key references users(id) on delete cascade,
  email       text        not null unique check (email = lower(email)),
  role        text        not null default 'admin' check (role in ('admin', 'read_only')),
  active      boolean     not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

insert into ops_operators (user_id, email)
select id, lower(email) from users
where lower(email) in ('andrevalleo13@gmail.com', 'hola@flouvia.com')
on conflict (user_id) do update set email = excluded.email, updated_at = now();

-- La base de datos tambien falla cerrada: aunque una futura ruta intentara
-- insertar un tercer operador, la restriccion solo acepta estas dos identidades.
delete from ops_operators
where lower(email) not in ('andrevalleo13@gmail.com', 'hola@flouvia.com');
alter table ops_operators drop constraint if exists ops_operators_email_allowlist_check;
alter table ops_operators add constraint ops_operators_email_allowlist_check
  check (email in ('andrevalleo13@gmail.com', 'hola@flouvia.com'));

-- Reto de un solo uso entre contraseña correcta y TOTP. Ops nunca acepta una
-- contraseña como único factor. El token crudo solo vive cinco minutos en una
-- cookie HttpOnly; la BD guarda exclusivamente sha256(token).
create table if not exists ops_auth_challenges (
  id           text        primary key,
  operator_id  uuid        not null references ops_operators(user_id) on delete cascade,
  expires_at   timestamptz not null,
  created_at   timestamptz not null default now()
);
create index if not exists idx_ops_challenges_operator on ops_auth_challenges(operator_id);
create index if not exists idx_ops_challenges_expires on ops_auth_challenges(expires_at);

-- Reto WebAuthn de un solo uso. La cookie por si sola no basta: persistir su
-- hash permite consumirlo atomicamente y bloquea replays concurrentes.
create table if not exists ops_passkey_challenges (
  id           text        primary key,
  operator_id  uuid        references ops_operators(user_id) on delete cascade,
  expires_at   timestamptz not null,
  created_at   timestamptz not null default now()
);
create index if not exists idx_ops_passkey_challenges_operator on ops_passkey_challenges(operator_id);
create index if not exists idx_ops_passkey_challenges_expires on ops_passkey_challenges(expires_at);

-- Sesiones del panel interno /ops. La cookie contiene un token opaco de 256
-- bits; aquí solo vive su sha256. Expiración por inactividad de 30 minutos +
-- tope absoluto de 8 horas. Cada login nuevo revoca la sesión Ops anterior
-- del mismo operador (una sola sesión privilegiada activa por persona).
create table if not exists ops_sessions (
  id                   text        primary key,  -- sha256(token)
  operator_id          uuid        not null references ops_operators(user_id) on delete cascade,
  expires_at           timestamptz not null,
  absolute_expires_at  timestamptz not null,
  last_used_at         timestamptz not null default now(),
  revoked_at           timestamptz,
  ip                   text,
  user_agent           text,
  auth_method          text        not null check (auth_method in ('passkey', 'password_totp', 'local_session_password')),
  credential_id        text        references passkeys(id) on delete cascade,
  created_at           timestamptz not null default now()
);

-- Upgrade idempotente desde el esquema viejo basado en OPS_SECRET. Las filas
-- antiguas carecen de identidad de operador y se eliminan UNA sola vez; las
-- sesiones nuevas nunca vuelven a coincidir con este filtro.
alter table ops_sessions add column if not exists operator_id uuid references ops_operators(user_id) on delete cascade;
alter table ops_sessions add column if not exists absolute_expires_at timestamptz not null default (now() + interval '8 hours');
alter table ops_sessions add column if not exists last_used_at timestamptz not null default now();
alter table ops_sessions add column if not exists revoked_at timestamptz;
alter table ops_sessions add column if not exists ip text;
alter table ops_sessions add column if not exists user_agent text;
alter table ops_sessions add column if not exists auth_method text;
alter table ops_sessions add column if not exists credential_id text references passkeys(id) on delete cascade;
delete from ops_sessions where operator_id is null or auth_method is null;
delete from ops_sessions where auth_method = 'passkey' and credential_id is null;
alter table ops_sessions alter column operator_id set not null;
alter table ops_sessions alter column auth_method set not null;
alter table ops_sessions drop constraint if exists ops_sessions_auth_method_check;
alter table ops_sessions add constraint ops_sessions_auth_method_check
  check (auth_method in ('passkey', 'password_totp', 'local_session_password'));
alter table ops_sessions drop constraint if exists ops_sessions_passkey_credential_check;
alter table ops_sessions add constraint ops_sessions_passkey_credential_check
  check (auth_method <> 'passkey' or credential_id is not null);
create index if not exists idx_ops_sessions_operator on ops_sessions(operator_id);
create index if not exists idx_ops_sessions_expires on ops_sessions(expires_at);
create unique index if not exists idx_ops_sessions_one_per_operator on ops_sessions(operator_id);

-- Bitácora separada de la auditoría multi-tenant: los eventos de plataforma no
-- pertenecen a ninguna org. No guarda contraseñas, códigos, tokens ni cuerpos
-- de requests. actor_email es un snapshot para preservar atribución incluso si
-- la cuenta cambia después.
create table if not exists ops_audit_log (
  id                 bigint generated always as identity primary key,
  actor_operator_id  uuid references ops_operators(user_id) on delete set null,
  actor_email        text,
  action             text        not null,
  target_type        text,
  target_id          text,
  result             text        not null default 'success' check (result in ('success', 'failure', 'denied')),
  metadata           jsonb       not null default '{}'::jsonb,
  ip                 text,
  user_agent         text,
  created_at         timestamptz not null default now()
);
create index if not exists idx_ops_audit_created on ops_audit_log(created_at desc);
create index if not exists idx_ops_audit_actor on ops_audit_log(actor_operator_id, created_at desc);

-- RLS deliberadamente NO se activa en users/sessions/oauth_accounts/passkeys/
-- password_reset_tokens/email_verification_tokens: el driver conecta SIEMPRE
-- con el rol dueño de la BD (mismo motivo documentado arriba para
-- orgs/org_members — "bootstrap queries need access"), que bypasea RLS por
-- diseño de Postgres. Sin threadear un app.user_id real por CADA query que
-- toca estas tablas (login, sesiones, passkeys, OAuth — decenas de sitios,
-- muchos sin sesión todavía por definición: es la ruta de login), forzar RLS
-- aquí sería seguridad de fachada: no bloquearía nada con el rol actual y sí
-- arriesgaría romper el flujo de autenticación. La protección real de estas
-- tablas es a nivel de aplicación (cada query filtra por el user_id ya
-- resuelto de la sesión validada) — igual que el resto del código ya asume
-- para orgs/org_members.

-- ── PostHog: marca explícita de la org demo (ago 2026) ───────────────────────
-- Antes la única forma de detectar la org demo permanente ("Materiales del
-- Valle" / demoOrgId() en db.ts) era comparar rfc = 'FERR010203XYZ' a mano en
-- cada sitio — frágil (se rompe si alguien edita el RFC) y no exportable a
-- analítica. Con esta columna, cualquier evento de PostHog puede etiquetarse
-- is_demo=true y filtrarse en los dashboards sin tocar la org sandbox
-- espejo (sandbox_of), que es un mecanismo aparte.
alter table orgs add column if not exists is_demo boolean not null default false;
update orgs set is_demo = true where rfc = 'FERR010203XYZ' and is_demo is distinct from true;

-- ── Onboarding de pantalla completa (ago 2026) ────────────────────────────────
-- Antes una cuenta nueva verificaba su correo y aterrizaba en /app con una org
-- creada EN SILENCIO llamada literalmente "Mi negocio" (ver resolveOrgId() en
-- db.ts) — nunca se le preguntaba nada. Estas columnas alimentan el wizard de
-- 4 pasos en /onboarding (nombre real, rol de quien registra, giro/tamaño,
-- para qué van a usar Cord) y el gate de middleware que lo dispara.
alter table orgs  add column if not exists industria     text;        -- distribucion|manufactura|construccion|servicios|tecnologia|comercio|otro
alter table orgs  add column if not exists tamano_equipo text;        -- solo|2-10|11-50|51-200|200+
alter table orgs  add column if not exists casos_uso     jsonb not null default '[]'::jsonb;
alter table orgs  add column if not exists onboarded_at  timestamptz;
alter table users add column if not exists puesto        text;        -- dueno|ventas|finanzas|operaciones|otro

-- Marcador de "ya emitido" para el evento de analítica `setup_step_completed`.
-- getSetupProgress() (src/lib/queries.ts) es una LECTURA que AppLayout invoca en
-- CADA página mientras el setup no está completo; sin este marcador, emitir el
-- evento dispararía en cada navegación. Guarda los task_id de la guía de
-- configuración cuyo paso ya se reportó a PostHog.
alter table orgs  add column if not exists setup_steps_emitted text[] not null default '{}'::text[];

-- ── Cord Ops preparado para 10k+ usuarios (ago 2026) ───────────────────────
-- Las vistas internas paginan a 50 filas y agregan únicamente los ids de esa
-- página. Estos índices sostienen búsqueda, orden cronológico y ventanas de
-- consumo sin que Ops haga un scan por cada usuario u organización visible.
create extension if not exists pg_trgm;

create index if not exists idx_users_created_id on users(created_at desc,id desc);
create index if not exists idx_users_email_trgm on users using gin (lower(email) gin_trgm_ops);
create index if not exists idx_users_name_trgm on users using gin ((lower(coalesce(first_name,'') || ' ' || coalesce(last_name,''))) gin_trgm_ops);
create index if not exists idx_orgs_created_id on orgs(created_at desc,id desc);
create index if not exists idx_orgs_name_trgm on orgs using gin (lower(nombre) gin_trgm_ops);

create index if not exists idx_sessions_user_activity on sessions(user_id,last_used_at desc);
create index if not exists idx_sessions_active_expiry on sessions(expires_at) where revoked_at is null;
create index if not exists idx_passkeys_user_created on passkeys(user_id,created_at desc);
create index if not exists idx_oauth_user_created on oauth_accounts(user_id,created_at desc);
create index if not exists idx_members_user_state_created on org_members(user_id,estado,created_at desc) where user_id is not null;
create index if not exists idx_members_org_created on org_members(org_id,created_at desc);

create index if not exists idx_clientes_org_created on clientes(org_id,created_at desc);
create index if not exists idx_productos_org_created on productos(org_id,created_at desc);
create index if not exists idx_cotizaciones_org_created on cotizaciones(org_id,created_at desc);
create index if not exists idx_cotizaciones_closed_org on cotizaciones(org_id,status) include(total) where status in ('approved','paid','invoiced');
create index if not exists idx_api_keys_org_created on api_keys(org_id,created_at desc);
create index if not exists idx_webhooks_org_created on webhooks(org_id,created_at desc);

create index if not exists idx_uso_periodo_period_org on uso_periodo(periodo,org_id);
create index if not exists idx_api_requests_recent on api_requests(created_at desc,org_id) include(status,duracion_ms);
create index if not exists idx_webhook_deliveries_recent on webhook_deliveries(created_at desc,org_id) include(ok);
create index if not exists idx_external_usage_recent on external_usage_events(created_at desc,org_id,provider,status);
create index if not exists idx_external_usage_org_provider on external_usage_events(org_id,provider,status,created_at desc);
create index if not exists idx_cobros_paid_recent on cotizacion_cobros(paid_at desc,org_id) include(monto) where paid_at is not null;
create index if not exists idx_cobros_org_paid on cotizacion_cobros(org_id,paid_at desc) include(monto) where paid_at is not null;

create index if not exists idx_ops_audit_target_created on ops_audit_log(target_type,target_id,created_at desc);
create index if not exists idx_ops_sessions_created on ops_sessions(created_at desc);

-- Backfill: toda org que YA EXISTÍA antes de este cambio se marca como
-- onboardeada, para que ningún usuario real en producción sea rebotado al
-- wizard retroactivamente. ⚠️ El corte es un TIMESTAMP FIJO (no "where
-- onboarded_at is null" a secas, y NO una fecha de calendario tipo '2026-08-04'
-- — se probó contra Neon real y una org creada el mismo día del deploy pero
-- DESPUÉS de correr esta migración se re-marcaba como onboardeada en la
-- siguiente `npm run db:migrate`, exactamente el bug que esto evita). El
-- valor es el `now()` real de Neon al momento de escribir esta migración —
-- cualquier org creada a partir de aquí SIEMPRE tendrá `created_at` posterior
-- a este literal, así que jamás puede volver a calificar en un re-run futuro.
update orgs set onboarded_at = coalesce(created_at, now())
 where onboarded_at is null and created_at < timestamptz '2026-08-03T17:14:24.230Z';

-- ══════════════════════════════════════════════════════════════════════════
-- ── SSO empresarial SAML 2.0 (ago 2026) ──────────────────────────────────
-- Reemplazo real del wizard cosmético que vivía en /app/ajustes/sso —
-- generaba el código de verificación DNS en el navegador y nunca lo mandaba
-- a ningún lado. Ver docs/historial-auth-clerk.md para el detalle de diseño.
-- ══════════════════════════════════════════════════════════════════════════

-- Una fila por conexión con un Identity Provider; una org puede tener varias
-- (ej. Okta para el equipo interno + Entra para una subsidiaria adquirida).
-- idp_certs es PLURAL a propósito: durante una rotación de certificado del
-- IdP conviven el cert viejo y el nuevo, y node-saml acepta un array.
create table if not exists sso_connections (
  id                    uuid        default gen_random_uuid() primary key,
  org_id                uuid        not null references orgs(id) on delete cascade,
  nombre                text        not null,               -- "Okta producción"
  proveedor             text        not null default 'saml', -- okta|entra|google|onelogin|otro (solo display)
  enabled               boolean     not null default false,
  -- Identity Provider
  idp_entity_id         text        not null,
  idp_sso_url           text        not null,               -- HTTP-Redirect binding
  idp_slo_url           text,
  idp_certs             text[]      not null default '{}',   -- PEM, uno o más (rotación sin downtime)
  -- Protocolo
  nameid_format         text        not null default 'urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress',
  want_assertion_signed boolean     not null default true,
  want_response_signed  boolean     not null default true,
  sign_authn_request    boolean     not null default false,
  clock_skew_ms         int         not null default 60000,
  -- Comportamiento
  allow_idp_initiated   boolean     not null default false,
  jit_provisioning      boolean     not null default true,
  attr_map              jsonb       not null default '{}'::jsonb,  -- {email,firstName,lastName,groups}: nombre real del atributo en el IdP
  role_mappings         jsonb       not null default '[]'::jsonb,  -- [{attr,op,value,preset}], primera regla que matchea gana
  default_preset        text        not null default 'lectura',
  -- Auditoría / diagnóstico
  last_login_at         timestamptz,
  last_error            text,
  last_error_at         timestamptz,
  created_by            uuid        references users(id) on delete set null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index if not exists idx_sso_conn_org on sso_connections(org_id);
create index if not exists idx_sso_org_created on sso_connections(org_id,created_at desc);
create unique index if not exists uq_sso_conn_idp on sso_connections(org_id, idp_entity_id);

-- Dominios que una conexión ha probado controlar por DNS TXT. Tabla APARTE
-- (no una columna de texto tipo orgs.invite_domains) porque aquí el dominio
-- es una CAPACIDAD, no un filtro: tener "acme.com" verificado permite
-- reclamar cualquier fila de `users` con ese correo. uq_sso_domain_global es
-- la defensa anti-toma-de-cuenta real — un dominio verificado le pertenece a
-- EXACTAMENTE una org; sin este índice, dos orgs podrían "verificar" el
-- mismo dominio y el ACS terminaría confiando en la que gane la carrera.
create table if not exists sso_domains (
  id                uuid        default gen_random_uuid() primary key,
  connection_id     uuid        not null references sso_connections(id) on delete cascade,
  org_id            uuid        not null references orgs(id) on delete cascade,
  domain            text        not null,
  verify_token      text        not null,   -- "cord-domain-verify=<32 hex>"
  verified_at       timestamptz,
  last_checked_at   timestamptz,
  created_at        timestamptz not null default now()
);
create unique index if not exists uq_sso_domain_conn on sso_domains(connection_id, domain);
create unique index if not exists uq_sso_domain_global on sso_domains(domain) where verified_at is not null;

-- Reemplazo de la cookie SameSite=lax (inútil aquí: el ACS recibe un POST
-- cross-site del IdP y esa cookie nunca vuelve). El `id` de cada fila ES el
-- AuthnRequest ID que se manda al IdP y el InResponseTo que se espera de
-- vuelta; `relay_state` es lo único que sí viaja (como query param del
-- AuthnRequest y luego como campo del POST del IdP). TTL corto: 10 minutos
-- alcanza para una IdP con MFA/reset de password de por medio, y mantiene
-- la ventana de replay irrelevante. Sirve también de backing store al
-- cacheProvider de node-saml (mismas filas, mismo id).
create table if not exists saml_auth_requests (
  id             text        primary key,     -- AuthnRequest ID ('_' + uuid)
  connection_id  uuid        not null references sso_connections(id) on delete cascade,
  relay_state    text        not null,
  redirect_to    text,                        -- destino relativo, ya saneado por safeRelativeRedirect
  ip             text,
  consumed_at    timestamptz,
  expires_at     timestamptz not null,
  created_at     timestamptz not null default now()
);
create unique index if not exists uq_saml_req_relay on saml_auth_requests(relay_state);
create index if not exists idx_saml_req_expires on saml_auth_requests(expires_at);

-- Defensa contra replay de una aserción SAML ya usada. El PK ES la defensa:
-- `insert ... on conflict (assertion_id) do nothing returning assertion_id`
-- — cero filas devueltas significa que ya se vio esta aserción, rechazar.
-- Atómico, sin carrera read-then-write. Necesario sobre todo para
-- IdP-initiated (sin InResponseTo, sin la protección que ya da
-- saml_auth_requests), pero se aplica siempre como defensa en profundidad.
create table if not exists saml_assertion_replay (
  assertion_id   text        primary key,
  connection_id  uuid        not null references sso_connections(id) on delete cascade,
  expires_at     timestamptz not null,        -- = NotOnOrAfter de la aserción + skew
  created_at     timestamptz not null default now()
);
create index if not exists idx_saml_replay_expires on saml_assertion_replay(expires_at);

-- El ACS NUNCA pone la cookie de sesión directamente (sería un Set-Cookie
-- en un POST top-level cross-site, terreno inestable con partición de
-- cookies de terceros y ya inconsistente en Safari/ITP). En vez de eso crea
-- esta fila y redirige a un GET same-origin (/api/auth/saml/complete) que sí
-- mintea la sesión — mismo patrón que two_factor_challenges (id=sha256 del
-- token, un solo uso, TTL corto).
create table if not exists sso_handoffs (
  id           text        primary key,   -- sha256(token)
  user_id      uuid        not null references users(id) on delete cascade,
  redirect_to  text,
  needs_2fa    boolean     not null default false,
  expires_at   timestamptz not null,
  created_at   timestamptz not null default now()
);

-- Exigir SSO para los miembros de la org (bloquea password/Google/Apple/
-- passkeys — ver src/lib/saml.ts ssoRequirementFor). El owner SIEMPRE
-- conserva su password como vía de escape; sso_breakglass_until es el
-- segundo escape (ventana temporal, ver /api/org PATCH).
alter table orgs add column if not exists require_sso          boolean not null default false;
alter table orgs add column if not exists sso_breakglass_until timestamptz;

-- sso_managed=true → el rol/permisos de este miembro los reescribe el IdP en
-- cada login (evaluateRoleMappings); false → un admin lo fijó a mano y el
-- login SAML no lo toca. sso_connection_id es solo trazabilidad (por dónde
-- entró), nunca la fuente de verdad de si está gateado por dominio.
alter table org_members add column if not exists sso_managed       boolean not null default false;
alter table org_members add column if not exists sso_connection_id uuid references sso_connections(id) on delete set null;

-- RLS: sso_connections/sso_domains llevan el MISMO patrón que orgs/org_members
-- (enable SIN force) — el ACS corre sin sesión y sin app.org_id todavía
-- establecido, así que un `force` aquí devolvería cero filas al camino de
-- auth y cada login SAML fallaría en silencio con "conexión no encontrada".
-- El CRUD de administración (bajo sesión, vía withOrgTx) sí queda protegido
-- por la policy; el carril de auth (sql crudo) bypasea como el rol dueño,
-- igual que ya hace resolveOrgId()/authApiKey() hoy.
alter table sso_connections enable row level security;
create policy "rls_sso_connections" on sso_connections
  using (org_id = nullif(current_setting('app.org_id', true), '')::uuid);

alter table sso_domains enable row level security;
create policy "rls_sso_domains" on sso_domains
  using (org_id = nullif(current_setting('app.org_id', true), '')::uuid);

-- saml_auth_requests / saml_assertion_replay / sso_handoffs: SIN RLS,
-- deliberado — mismas razones ya documentadas arriba para sessions/
-- two_factor_challenges/email_verification_tokens. Son tablas del CARRIL DE
-- AUTH: se escriben y leen ANTES de que exista cualquier contexto de org o
-- de sesión (el ACS no tiene ninguno de los dos), están keyeadas por IDs
-- opacos e impredecibles (uuid / sha256), y la protección real es que un
-- atacante no puede adivinar la clave — no que Postgres filtre filas.

-- Contador durable de rate limit compartido entre TODAS las instancias de
-- Vercel. Respaldo siempre disponible de `strictRateLimit` (src/lib/ratelimit.ts)
-- para las superficies fail-closed: login de Ops, reembolsos, evidencia de
-- disputas, reautenticación y Stripe Connect. Sustituye la dependencia dura de
-- Upstash, que nunca se provisionó y dejaba esas rutas en 503 permanente.
--
-- `id` es sha256 de la clave lógica: el texto original lleva IPs y correos y
-- esta tabla no tiene razón para acumular ese PII. Sin RLS a propósito, mismo
-- criterio ya documentado para sessions / *_challenges: es una tabla del carril
-- de auth, se escribe ANTES de que exista contexto de org o de sesión, y su
-- clave es un hash impredecible. Las filas vencidas las barre perezosamente el
-- propio limitador (máximo una pasada por minuto, 500 filas).
create table if not exists rate_limit_counters (
  id       text        primary key,  -- sha256(clave lógica)
  count    integer     not null default 0,
  reset_at timestamptz not null
);
create index if not exists idx_rate_limit_counters_reset on rate_limit_counters(reset_at);

-- ════════════════════════════════════════════════════════════════════════════
-- Cobranza con IA v2 (ago 2026): configuración por org, ciclo de vida del
-- mensaje y exclusiones.
--
-- Antes de esto TODO el comportamiento del agente estaba hardcodeado en el
-- código (3 días de gracia, escalar a plan a los 15, tono, siempre español) y
-- el cron —que corre diario— NO consultaba el último envío: le escribía a la
-- misma cotización vencida todos los días. `ai_cobranza_cadencia_dias` cierra
-- ese bug.
-- ════════════════════════════════════════════════════════════════════════════

-- Modo de operación. Default 'aprobacion': el agente redacta y espera visto
-- bueno humano. Nadie deja que una IA le escriba a sus clientes a ciegas la
-- primera vez; el paso a 'automatico' se ofrece cuando ya hay confianza.
alter table orgs add column if not exists ai_cobranza_modo          text    not null default 'aprobacion';
alter table orgs add column if not exists ai_cobranza_gracia_dias   integer not null default 3;
alter table orgs add column if not exists ai_cobranza_cadencia_dias integer not null default 7;
alter table orgs add column if not exists ai_cobranza_plan_dias     integer not null default 15;
alter table orgs add column if not exists ai_cobranza_max_cuotas    integer not null default 3;
alter table orgs add column if not exists ai_cobranza_tono          text    not null default 'profesional';
alter table orgs add column if not exists ai_cobranza_idioma        text    not null default 'es';
alter table orgs add column if not exists ai_cobranza_firma         text;
alter table orgs add column if not exists ai_cobranza_monto_min     numeric(14,2) not null default 0;
alter table orgs add column if not exists ai_cobranza_max_corrida   integer not null default 25;

-- Ciclo de vida del mensaje. Default 'enviado' para que las filas históricas
-- (todas ya enviadas) queden coherentes sin backfill.
alter table cobranza_conversaciones add column if not exists estado       text not null default 'enviado';
alter table cobranza_conversaciones add column if not exists aprobado_por uuid references users(id) on delete set null;
alter table cobranza_conversaciones add column if not exists aprobado_at  timestamptz;
alter table cobranza_conversaciones add column if not exists editado      boolean not null default false;
alter table cobranza_conversaciones add column if not exists enviado_at   timestamptz;
alter table cobranza_conversaciones add column if not exists error        text;
create index if not exists idx_cobranza_conv_estado
  on cobranza_conversaciones(org_id, estado, created_at desc);
-- La cadencia consulta "¿cuándo fue el último ENVIADO de esta cotización?" en
-- cada corrida, una vez por cotización candidata.
create index if not exists idx_cobranza_conv_cot_enviado
  on cobranza_conversaciones(cotizacion_id, enviado_at desc) where estado = 'enviado';

-- Exclusiones: "no le escribas a este cliente" / "no a esta cotización".
-- Al menos una de las dos referencias debe venir.
create table if not exists cobranza_exclusiones (
  id            uuid        default gen_random_uuid() primary key,
  org_id        uuid        not null references orgs(id) on delete cascade,
  cliente_id    uuid        references clientes(id) on delete cascade,
  cotizacion_id uuid        references cotizaciones(id) on delete cascade,
  motivo        text,
  created_by    uuid        references users(id) on delete set null,
  created_at    timestamptz default now(),
  constraint cobranza_exclusiones_target check (cliente_id is not null or cotizacion_id is not null)
);
create unique index if not exists uq_cobranza_excl_cliente
  on cobranza_exclusiones(org_id, cliente_id) where cliente_id is not null;
create unique index if not exists uq_cobranza_excl_cot
  on cobranza_exclusiones(org_id, cotizacion_id) where cotizacion_id is not null;

alter table cobranza_exclusiones enable row level security;
drop policy if exists "rls_cobranza_exclusiones" on cobranza_exclusiones;
create policy "rls_cobranza_exclusiones" on cobranza_exclusiones
  using (org_id = nullif(current_setting('app.org_id', true), '')::uuid);
alter table cobranza_exclusiones force row level security;

-- ════════════════════════════════════════════════════════════════════════════
-- Entitlements y Billing fail-closed (ago 2026)
-- ════════════════════════════════════════════════════════════════════════════
-- `orgs.plan` dejó de ser una credencial. Un nivel pagado solo es efectivo si
-- Stripe está ligado, la suscripción está `active` y el periodo sigue vigente.
-- Las sandboxes consultan el billing de su org padre, por lo que una cancelación
-- también les revoca el plan sin copiar ni duplicar ids de Stripe.

alter table orgs add column if not exists billing_last_paid_at timestamptz;
alter table orgs add column if not exists billing_paid_through timestamptz;
alter table orgs add column if not exists billing_last_invoice_id text;
alter table orgs add column if not exists billing_last_amount_paid bigint;
alter table orgs add column if not exists billing_currency text;
alter table orgs add column if not exists billing_paid_plan text;
-- Cancelación programada al cierre del periodo. Se espeja desde
-- `customer.subscription.updated` porque la UI necesita decir "se cancela el 18
-- de septiembre" sin llamar a Stripe en cada render del SSR. El resto del detalle
-- de facturación (tarjetas, comprobantes) SÍ se lee en vivo: no otorga acceso y
-- espejarlo crearía un segundo estado que se desincroniza.
alter table orgs add column if not exists cancel_at_period_end boolean not null default false;

-- ── Traspaso de sesión al host de facturación ────────────────────────────────
-- `cord_session` es host-only a propósito (`sessionCookieOptions()` no fija
-- Domain), así que NO viaja a billing.cordhq.app. La alternativa —ampliarla a
-- `.cordhq.app`— la mandaría también a ops./docs./dev. y rompería el aislamiento
-- deliberado de Ops.
--
-- En vez de eso, el apex emite un token de un solo uso y el host de facturación
-- lo canjea por una sesión PROPIA. Se guarda el sha256, nunca el token: mismo
-- contrato que `sessions`, reset de contraseña e invitaciones.
create table if not exists billing_handoff_tokens (
    id           text primary key,                    -- sha256 del token crudo
    user_id      uuid not null references users(id) on delete cascade,
    org_id       uuid references orgs(id) on delete cascade,
    expires_at   timestamptz not null,
    used_at      timestamptz,
    created_at   timestamptz not null default now()
);
create index if not exists idx_billing_handoff_expires on billing_handoff_tokens (expires_at);

-- ── CFDI de los pagos de suscripción a Cord ──────────────────────────────────
-- Cord le factura al negocio lo que le cobró por la plataforma, con su PROPIO
-- CSD (`FACTURAPI_CORD_ORG_KEY`) — el mismo carril que ya timbra las comisiones
-- de Cord Payments (`emitPlatformInvoice`).
--
-- `stripe_invoice_id` es UNIQUE por diseño: timbrar dos veces el mismo cobro es
-- un problema fiscal real, no un duplicado cosmético — cancelar un CFDI ante el
-- SAT exige aprobación del receptor y no siempre se consigue.
create table if not exists suscripcion_facturas (
    id                 uuid primary key default gen_random_uuid(),
    org_id             uuid not null references orgs(id) on delete cascade,
    stripe_invoice_id  text not null unique,
    status             text not null default 'pending',   -- pending | issued | error
    facturapi_id       text,
    fiscal_uuid        text,
    invoice_number     text,
    currency           text not null default 'MXN',
    total_cents        bigint not null default 0,
    provider_data      jsonb not null default '{}'::jsonb,
    invoice_error      text,
    issued_at          timestamptz,
    created_at         timestamptz not null default now(),
    updated_at         timestamptz not null default now()
);
create index if not exists idx_suscripcion_facturas_org on suscripcion_facturas (org_id, created_at desc);

alter table suscripcion_facturas enable row level security;
alter table suscripcion_facturas force row level security;
drop policy if exists suscripcion_facturas_org on suscripcion_facturas;
create policy suscripcion_facturas_org on suscripcion_facturas
    using (org_id = current_setting('app.org_id', true)::uuid)
    with check (org_id = current_setting('app.org_id', true)::uuid);

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
    select paid_access,
      case when exists (
        select 1 from build_scale_entitlements e
         where e.org_id = access.billing_org_id and e.status = 'active'
           and e.starts_at <= now() and e.expires_at > now()
      ) then 'scale' else 'free' end as promo_access
    from access
  )
  select case
    when (case paid_access when 'developer' then 4 when 'scale' then 3 when 'pro' then 2 when 'starter' then 1 else 0 end)
       >= (case promo_access when 'developer' then 4 when 'scale' then 3 when 'pro' then 2 when 'starter' then 1 else 0 end)
      then paid_access else promo_access end
  from effective
$$;
revoke all on function cord_effective_plan(uuid) from public;

-- Una sola tentativa de checkout abierta por org. La fila sobrevive a workers
-- serverless y cierra la carrera de doble click/pestañas concurrentes.
create table if not exists billing_checkout_attempts (
  id                     uuid        primary key default gen_random_uuid(),
  org_id                 uuid        not null references orgs(id) on delete cascade,
  plan                   text        not null check (plan in ('starter','pro','scale','developer')),
  cycle                  text        not null check (cycle in ('mensual','anual')),
  mode                   text        not null check (mode in ('element','checkout')),
  status                 text        not null default 'creating'
                                      check (status in ('creating','incomplete','completed','failed','expired','canceled')),
  stripe_subscription_id text,
  stripe_session_id      text,
  idempotency_key        text        not null unique,
  last_error             text,
  expires_at             timestamptz not null default (now() + interval '24 hours'),
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);
create unique index if not exists uq_billing_checkout_open_org
  on billing_checkout_attempts(org_id)
  where status in ('creating','incomplete');
create index if not exists idx_billing_checkout_sub
  on billing_checkout_attempts(stripe_subscription_id)
  where stripe_subscription_id is not null;

alter table billing_checkout_attempts enable row level security;
drop policy if exists "rls_billing_checkout_attempts" on billing_checkout_attempts;
create policy "rls_billing_checkout_attempts" on billing_checkout_attempts
  using (org_id = nullif(current_setting('app.org_id', true), '')::uuid)
  with check (org_id = nullif(current_setting('app.org_id', true), '')::uuid);
drop policy if exists "system_billing_checkout_attempts" on billing_checkout_attempts;
create policy "system_billing_checkout_attempts" on billing_checkout_attempts
  using (current_setting('app.scope', true) = 'system')
  with check (current_setting('app.scope', true) = 'system');
alter table billing_checkout_attempts force row level security;

-- Reserva durable de consumo. Primero se incrementa la cuota y se crea esta
-- fila en la MISMA sentencia; solo después corre Anthropic/Facturapi/API. Una
-- reserva cancelada revierte el contador. Una comprometida queda en outbox para
-- enviarse a Stripe con reintentos e idempotencia.
create table if not exists usage_reservations (
  id               uuid        primary key,
  org_id           uuid        not null references orgs(id) on delete cascade,
  billing_org_id   uuid        not null references orgs(id) on delete cascade,
  dimension        text        not null check (dimension in ('api','usuario','ia','timbrado','envios','documento','us_tax')),
  value            integer     not null check (value > 0),
  meter_value      integer     not null default 0 check (meter_value >= 0),
  periodo          text        not null,
  status           text        not null default 'reserved'
                               check (status in ('reserved','committed','canceled')),
  meter_status     text        not null default 'skipped'
                               check (meter_status in ('skipped','pending','sending','sent','failed')),
  stripe_customer_id text,
  attempt_count    integer     not null default 0,
  next_attempt_at  timestamptz,
  last_error       text,
  committed_at     timestamptz,
  canceled_at      timestamptz,
  sent_at          timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
alter table usage_reservations add column if not exists meter_value integer not null default 0;
-- 'envios' (tope duro de Gratis, sin meter) se agregó ago 2026 — re-declarar el
-- check permite que db:migrate siga siendo re-ejecutable sobre una tabla ya creada.
-- 'documento' (comerciales) y 'us_tax' (sales tax de EE. UU.) se agregaron oct
-- 2026; la misma definición se repite en la sección "Cuota del sales tax
-- automático de EE. UU." al final, que es la que aplica el despliegue.
alter table usage_reservations drop constraint if exists usage_reservations_dimension_check;
alter table usage_reservations add constraint usage_reservations_dimension_check
  check (dimension in ('api','usuario','ia','timbrado','envios','documento','us_tax'));
create index if not exists idx_usage_reservations_outbox
  on usage_reservations(meter_status, next_attempt_at, created_at)
  where status = 'committed' and meter_status in ('pending','failed');
create index if not exists idx_usage_reservations_org
  on usage_reservations(org_id, periodo, dimension);

alter table usage_reservations enable row level security;
drop policy if exists "rls_usage_reservations" on usage_reservations;
create policy "rls_usage_reservations" on usage_reservations
  using (org_id = nullif(current_setting('app.org_id', true), '')::uuid)
  with check (org_id = nullif(current_setting('app.org_id', true), '')::uuid);
drop policy if exists "system_usage_reservations" on usage_reservations;
create policy "system_usage_reservations" on usage_reservations
  using (current_setting('app.scope', true) = 'system')
  with check (current_setting('app.scope', true) = 'system');
alter table usage_reservations force row level security;

-- Defensa final de límites a nivel DB. La aplicación hace prechecks para dar
-- errores amables, pero estos triggers son los que cierran carreras paralelas y
-- cualquier ruta nueva que olvide el helper de aplicación.
create or replace function cord_resource_limit(p_plan text, p_resource text)
returns integer
language sql immutable
as $$
  select case p_resource
    when 'active_quotes' then case p_plan when 'free' then 5 when 'starter' then 50 else null end
    when 'products'      then case p_plan when 'free' then 50 when 'starter' then 500 else null end
    when 'clients'       then case p_plan when 'free' then 50 when 'starter' then 500 else null end
    when 'seats'         then case p_plan when 'free' then 1 when 'starter' then 1 else null end
    when 'active_workflows' then case p_plan when 'free' then 1 when 'starter' then 5 else null end
    else 0
  end
$$;

create or replace function cord_enforce_resource_limit()
returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_resource text;
  v_limit integer;
  v_used integer;
  v_old_active boolean := false;
  v_new_active boolean := true;
begin
  if tg_table_name = 'productos' then
    v_resource := 'products';
  elsif tg_table_name = 'clientes' then
    v_resource := 'clients';
  elsif tg_table_name = 'cotizaciones' then
    v_resource := 'active_quotes';
    v_new_active := new.status in ('draft','sent','viewed','approved');
    if tg_op = 'UPDATE' then
      v_old_active := old.status in ('draft','sent','viewed','approved');
    end if;
    if not v_new_active or v_old_active then return new; end if;
  elsif tg_table_name = 'org_members' then
    v_resource := 'seats';
    v_new_active := new.estado in ('activo','invitado');
    if tg_op = 'UPDATE' then
      v_old_active := old.estado in ('activo','invitado');
    end if;
    if not v_new_active or v_old_active then return new; end if;
  elsif tg_table_name = 'workflows' then
    v_resource := 'active_workflows';
    v_new_active := new.estado = 'active';
    if tg_op = 'UPDATE' then
      v_old_active := old.estado = 'active';
    end if;
    if not v_new_active or v_old_active then return new; end if;
  else
    raise exception 'cord_limit:unknown_resource';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(new.org_id::text || ':' || v_resource, 0));
  v_limit := cord_resource_limit(cord_effective_plan(new.org_id), v_resource);
  if v_limit is null then return new; end if;

  if v_resource = 'products' then
    select count(*) into v_used from productos where org_id = new.org_id;
  elsif v_resource = 'clients' then
    select count(*) into v_used from clientes where org_id = new.org_id;
  elsif v_resource = 'active_quotes' then
    select count(*) into v_used from cotizaciones
      where org_id = new.org_id and status in ('draft','sent','viewed','approved');
  elsif v_resource = 'active_workflows' then
    select count(*) into v_used from workflows
      where org_id = new.org_id and estado = 'active';
  else
    select count(*) into v_used from org_members
      where org_id = new.org_id and estado in ('activo','invitado');
  end if;

  if v_used >= v_limit then
    raise exception using
      errcode = '23514',
      message = 'cord_limit:' || v_resource || ':' || v_limit::text;
  end if;
  return new;
end
$$;

drop trigger if exists trg_limit_productos on productos;
create trigger trg_limit_productos before insert on productos
  for each row execute function cord_enforce_resource_limit();
drop trigger if exists trg_limit_clientes on clientes;
create trigger trg_limit_clientes before insert on clientes
  for each row execute function cord_enforce_resource_limit();
drop trigger if exists trg_limit_cotizaciones on cotizaciones;
create trigger trg_limit_cotizaciones before insert or update of status on cotizaciones
  for each row execute function cord_enforce_resource_limit();
drop trigger if exists trg_limit_org_members on org_members;
create trigger trg_limit_org_members before insert or update of estado on org_members
  for each row execute function cord_enforce_resource_limit();

-- ════════════════════════════════════════════════════════════════════════════
-- Núcleo fiscal internacional propiedad de Cord (ago 2026)
-- ════════════════════════════════════════════════════════════════════════════
-- El documento canónico y sus snapshots viven en Cord. Facturapi es un rail
-- intercambiable para CFDI; una factura comercial internacional no depende de
-- un tercero y puede conectarse después al proveedor regulatorio de cada país.

alter table orgs add column if not exists fiscal_metadata jsonb not null default '{}'::jsonb;

alter table documentos_fiscales add column if not exists provider text not null default 'cord';
alter table documentos_fiscales add column if not exists provider_document_id text;
alter table documentos_fiscales add column if not exists invoice_number text;
alter table documentos_fiscales add column if not exists currency text;
-- Multi-divisa (ago 2026): la factura se emite en la divisa de la VENTA y lleva
-- el tipo de cambio a la divisa contable del emisor. Antes los importes en USD
-- se etiquetaban con la divisa fiscal (MXN) sin convertir ni declarar la tasa:
-- la factura decía "MXN 1,000" para una venta de USD 1,000. Ver docs/negocio-billing.md.
alter table documentos_fiscales add column if not exists ledger_currency text;
alter table documentos_fiscales add column if not exists fx_rate numeric;
alter table documentos_fiscales add column if not exists ledger_total numeric;
alter table documentos_fiscales add column if not exists subtotal numeric;
alter table documentos_fiscales add column if not exists tax_total numeric;
alter table documentos_fiscales add column if not exists total numeric;
alter table documentos_fiscales add column if not exists issuer_snapshot jsonb not null default '{}'::jsonb;
alter table documentos_fiscales add column if not exists recipient_snapshot jsonb not null default '{}'::jsonb;
alter table documentos_fiscales add column if not exists line_items_snapshot jsonb not null default '[]'::jsonb;
alter table documentos_fiscales add column if not exists idempotency_key text;
alter table documentos_fiscales add column if not exists schema_version text not null default 'cord.invoice.v1';
alter table documentos_fiscales add column if not exists issued_at timestamptz;
alter table documentos_fiscales add column if not exists updated_at timestamptz default now();

create unique index if not exists uq_documentos_fiscales_idempotency
  on documentos_fiscales(org_id, idempotency_key)
  where idempotency_key is not null;
create unique index if not exists uq_documentos_fiscales_number
  on documentos_fiscales(org_id, country_code, invoice_number)
  where invoice_number is not null;

create table if not exists invoice_sequences (
  org_id         uuid        not null references orgs(id) on delete cascade,
  country_code   text        not null,
  document_type  text        not null,
  prefix         text        not null default 'INV',
  next_value     bigint      not null default 1 check (next_value > 0),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  primary key (org_id, country_code, document_type)
);

alter table invoice_sequences enable row level security;
drop policy if exists "rls_invoice_sequences" on invoice_sequences;
create policy "rls_invoice_sequences" on invoice_sequences
  using (org_id = nullif(current_setting('app.org_id', true), '')::uuid)
  with check (org_id = nullif(current_setting('app.org_id', true), '')::uuid);
alter table invoice_sequences force row level security;

-- ════════════════════════════════════════════════════════════════════════════
-- Layout de widgets por usuario, persistido en servidor (ago 2026)
-- ════════════════════════════════════════════════════════════════════════════
-- Antes vivía solo en localStorage: se perdía al cambiar de navegador/dispositivo.
-- Granularidad natural (org, user) — org_members.uq_members_org_user ya la
-- garantiza, así que no hace falta una tabla nueva. Forma: un objeto por grid,
-- { "cord.dash.v1": { order:[], hidden:[], sizes:{}, rev, at }, ... }.
--
-- ⚠️ RLS sobre org_members es de fachada (ver nota más arriba, "el driver
-- conecta con el rol dueño de la BD"): CUALQUIER query contra widget_prefs debe
-- filtrar por org_id AND user_id en la aplicación. Validación de forma/tamaño
-- vive en src/pages/api/app/widget-prefs.ts, no aquí — un CHECK produciría un
-- error de Postgres feo y sin i18n en vez de un 400 claro.
alter table org_members add column if not exists widget_prefs jsonb not null default '{}'::jsonb;
alter table org_members add column if not exists widget_prefs_at timestamptz;

-- ════════════════════════════════════════════════════════════════════════════
-- Link público en vivo: revisión, visitantes y atención (ago 2026)
-- ════════════════════════════════════════════════════════════════════════════
-- El link /q/[token] se vuelve un documento vivo: el cliente ve los cambios del
-- vendedor sin recargar, ambos lados se ven en línea, y el vendedor entiende qué
-- leyó realmente el cliente. Tres piezas:
--
--   1) cotizaciones.rev — contador monótono que hace barato el polling del SSE.
--   2) cotizacion_visitantes — quién abrió, cuántas veces, y quién está aquí AHORA.
--   3) cotizacion_atencion — cuánto tiempo pasó el cliente en cada sección.
--
-- Nota de diseño sobre `rev`: NO se usa `viewer_last_seen` ni ninguna columna de
-- presencia dentro de `cotizaciones` para esto. Si la presencia siguiera
-- escribiéndose ahí, cada heartbeat (~10s por visitante) bumpearía `rev` y el
-- stream creería que el CONTENIDO cambió, forzando un snapshot completo cada
-- ciclo. Por eso la presencia vive en su propia tabla y `viewer_last_seen` queda
-- como columna legacy sin escritores nuevos.

-- ── 1) Contador de revisión ─────────────────────────────────────────────────
alter table cotizaciones add column if not exists rev bigint not null default 1;

-- Bump en la propia cotización. BEFORE UPDATE sobre NEW: no emite otro UPDATE,
-- así que no hay recursión con los triggers de las tablas hijas de abajo.
create or replace function cord_bump_quote_rev()
returns trigger
language plpgsql
as $$
begin
  new.rev := coalesce(old.rev, 1) + 1;
  return new;
end
$$;

drop trigger if exists trg_bump_rev_cotizaciones on cotizaciones;
create trigger trg_bump_rev_cotizaciones before update on cotizaciones
  for each row execute function cord_bump_quote_rev();

-- Bump desde las tablas hijas. Toca la cotización padre, lo que dispara el
-- trigger de arriba (que es quien fija el valor final de `rev`; el `+ 1` de
-- aquí solo hace explícita la intención).
create or replace function cord_bump_quote_rev_child()
returns trigger
language plpgsql
as $$
declare
  v_cotizacion_id uuid;
begin
  v_cotizacion_id := case tg_op when 'DELETE' then old.cotizacion_id else new.cotizacion_id end;
  if v_cotizacion_id is not null then
    update cotizaciones set rev = rev + 1 where id = v_cotizacion_id;
  end if;
  return case tg_op when 'DELETE' then old else new end;
end
$$;

drop trigger if exists trg_bump_rev_items on cotizacion_items;
create trigger trg_bump_rev_items after insert or update or delete on cotizacion_items
  for each row execute function cord_bump_quote_rev_child();
drop trigger if exists trg_bump_rev_cobros on cotizacion_cobros;
create trigger trg_bump_rev_cobros after insert or update or delete on cotizacion_cobros
  for each row execute function cord_bump_quote_rev_child();
drop trigger if exists trg_bump_rev_eventos on eventos;
create trigger trg_bump_rev_eventos after insert or update or delete on eventos
  for each row execute function cord_bump_quote_rev_child();
drop trigger if exists trg_bump_rev_comentarios on cotizacion_comentarios;
create trigger trg_bump_rev_comentarios after insert or update or delete on cotizacion_comentarios
  for each row execute function cord_bump_quote_rev_child();

-- ── 2) Visitantes: identidad, aperturas y presencia ─────────────────────────
-- Una fila por (cotización, actor). Fila durable con columnas calientes
-- (last_seen, seccion, typing_until) que se actualizan cada ~10s por heartbeat.
--   actor_key = 'u:{userId}'    → miembro del equipo abriendo su propio link
--               'v:{visitorId}' → cliente real, cookie cord_q_visitor
-- La IP se guarda HASHEADA con sal: aquí no es evidencia legal (para eso está
-- cotizacion_firmas, que sí la guarda en claro), solo desempate de visitantes.
create table if not exists cotizacion_visitantes (
  id              uuid        default gen_random_uuid() primary key,
  org_id          uuid        not null references orgs(id) on delete cascade,
  cotizacion_id   uuid        not null references cotizaciones(id) on delete cascade,
  actor_key       text        not null,
  rol             text        not null default 'client', -- 'seller' | 'client'
  nombre          text,                                  -- del miembro; null para el cliente
  aperturas       int         not null default 0,
  primera_vez     timestamptz not null default now(),
  ultima_vez      timestamptz not null default now(),
  last_seen       timestamptz not null default now(),
  seccion         text,
  typing_until    timestamptz,
  ip_hash         text,
  user_agent      text
);
create unique index if not exists uq_cot_visitantes on cotizacion_visitantes(cotizacion_id, actor_key);
create index if not exists idx_cot_visitantes_org on cotizacion_visitantes(org_id);
create index if not exists idx_cot_visitantes_live on cotizacion_visitantes(cotizacion_id, last_seen desc);

alter table cotizacion_visitantes enable row level security;
drop policy if exists "rls_cotizacion_visitantes" on cotizacion_visitantes;
create policy "rls_cotizacion_visitantes" on cotizacion_visitantes
  using (org_id = nullif(current_setting('app.org_id', true), '')::uuid)
  with check (org_id = nullif(current_setting('app.org_id', true), '')::uuid);
alter table cotizacion_visitantes force row level security;

-- ── 3) Atención: dwell e interacción por clave ──────────────────────────────
-- `clave` es un espacio plano y acotado por la aplicación:
--   'sec:resumen' | 'sec:partidas' | 'sec:notas' | 'sec:pago' | 'pdf' | 'item:{uuid}'
-- Los segundos se ACUMULAN por upsert; el cliente manda deltas, no totales.
create table if not exists cotizacion_atencion (
  id              uuid        default gen_random_uuid() primary key,
  org_id          uuid        not null references orgs(id) on delete cascade,
  cotizacion_id   uuid        not null references cotizaciones(id) on delete cascade,
  actor_key       text        not null,
  clave           text        not null,
  segundos        int         not null default 0,
  veces           int         not null default 0,
  ultima_vez      timestamptz not null default now()
);
create unique index if not exists uq_cot_atencion on cotizacion_atencion(cotizacion_id, actor_key, clave);
create index if not exists idx_cot_atencion_org on cotizacion_atencion(org_id);
create index if not exists idx_cot_atencion_cot on cotizacion_atencion(cotizacion_id);

alter table cotizacion_atencion enable row level security;
drop policy if exists "rls_cotizacion_atencion" on cotizacion_atencion;
create policy "rls_cotizacion_atencion" on cotizacion_atencion
  using (org_id = nullif(current_setting('app.org_id', true), '')::uuid)
  with check (org_id = nullif(current_setting('app.org_id', true), '')::uuid);
alter table cotizacion_atencion force row level security;

-- ════════════════════════════════════════════════════════════════════════════
-- Cord Invoicing: la factura como objeto de primera clase (ago 2026)
-- ════════════════════════════════════════════════════════════════════════════
-- Hasta ahora una factura era un subproducto de la cotización: `cotizacion_id`
-- era NOT NULL, así que era ESTRUCTURALMENTE imposible emitir una factura
-- suelta, y el único disparador en todo el repo era
-- `PATCH /api/cotizaciones/[id] { to: 'invoiced' }`.
--
-- Dos ejes nuevos, deliberadamente separados:
--
--   status     — el rail FISCAL     (pending | issued | cancelled | error)
--   lifecycle  — el estado COMERCIAL (draft | open | paid | void | uncollectible)
--
-- No se colapsan en una sola columna: "timbrada ante el SAT" y "pagada por el
-- cliente" son hechos distintos que cambian por causas distintas. Una factura
-- puede estar `issued` + `open` (timbrada, sin cobrar) o `issued` + `paid`.

alter table documentos_fiscales alter column cotizacion_id drop not null;

alter table documentos_fiscales add column if not exists cliente_id uuid references clientes(id) on delete set null;
alter table documentos_fiscales add column if not exists lifecycle text not null default 'issued';
alter table documentos_fiscales add column if not exists due_date date;
alter table documentos_fiscales add column if not exists amount_paid numeric not null default 0;
alter table documentos_fiscales add column if not exists amount_remaining numeric;
alter table documentos_fiscales add column if not exists public_token text;
alter table documentos_fiscales add column if not exists voided_at timestamptz;
alter table documentos_fiscales add column if not exists void_reason text;
alter table documentos_fiscales add column if not exists credit_note_of uuid references documentos_fiscales(id) on delete set null;
alter table documentos_fiscales add column if not exists sent_at timestamptz;
alter table documentos_fiscales add column if not exists notes text;
-- Fecha (o periodo) de prestación — Leistungsdatum (oct 2026). En Alemania es
-- obligatoria en la factura (§ 14 Abs. 4 Nr. 6 UStG) y en Francia lo es cuando
-- difiere de la fecha de emisión; sin columna, Cord no tenía dónde capturarla.
-- Nula = coincide con la fecha de la factura (el PDF alemán lo dice).
alter table documentos_fiscales add column if not exists service_date date;
alter table documentos_fiscales add column if not exists service_date_end date;
alter table documentos_fiscales drop constraint if exists chk_documentos_service_period;
alter table documentos_fiscales add constraint chk_documentos_service_period
  check (service_date_end is null or (service_date is not null and service_date_end >= service_date));
alter table documentos_fiscales add column if not exists created_by uuid;
-- PaymentIntent vivo del cobro del SALDO desde la hosted invoice page. Se
-- reutiliza entre recargas: sin él, cada visita abre un intento nuevo y el
-- cliente termina con varios cobros en vuelo por la misma factura.
alter table documentos_fiscales add column if not exists stripe_payment_intent_id text;
-- Regla 19: la vista del cliente se mide EN EL CLIENTE y con actor. Estas dos
-- columnas las escribe únicamente el heartbeat de /api/i/[token] cuando el
-- actor resuelto es 'client' con la pestaña visible — nunca el SSR, que lo
-- dispara igual el propio vendedor revisando su link o el bot de WhatsApp
-- generando la tarjeta del enlace.
alter table documentos_fiscales add column if not exists first_viewed_at timestamptz;
alter table documentos_fiscales add column if not exists last_viewed_at timestamptz;
create index if not exists idx_documentos_fiscales_pi
  on documentos_fiscales(stripe_payment_intent_id)
  where stripe_payment_intent_id is not null;

-- Toda factura tiene receptor: o cuelga de una cotización (y el cliente sale de
-- ahí) o trae su propio `cliente_id`. Una factura sin ninguno de los dos no
-- tiene a quién cobrarle.
do $$ begin
  alter table documentos_fiscales add constraint chk_documentos_fiscales_origen
    check (cotizacion_id is not null or cliente_id is not null);
exception when duplicate_object then null; end $$;

do $$ begin
  alter table documentos_fiscales add constraint chk_documentos_fiscales_lifecycle
    check (lifecycle in ('draft', 'open', 'paid', 'void', 'uncollectible'));
exception when duplicate_object then null; end $$;

-- El token de la hosted invoice page. Único global (es una URL pública), no por
-- org: dos orgs no pueden compartir token o una vería la factura de la otra.
create unique index if not exists uq_documentos_fiscales_public_token
  on documentos_fiscales(public_token)
  where public_token is not null;

-- Bandeja y aging: "qué está abierto y qué venció", el acceso dominante.
create index if not exists idx_documentos_fiscales_bandeja
  on documentos_fiscales(org_id, lifecycle, due_date);
create index if not exists idx_documentos_fiscales_cliente
  on documentos_fiscales(org_id, cliente_id);
create index if not exists idx_documentos_fiscales_creado
  on documentos_fiscales(org_id, created_at desc, id desc);

-- Backfill de las filas que ya existían: nacieron todas timbradas y sin saldo
-- conocido. Se marcan `open` con el total pendiente para que el aging las vea;
-- las de cotizaciones ya pagadas se cierran abajo.
update documentos_fiscales
   set amount_remaining = coalesce(total, 0)
 where amount_remaining is null;

update documentos_fiscales d
   set lifecycle = 'open'
 where d.lifecycle = 'issued' and d.status = 'issued';

update documentos_fiscales d
   set lifecycle = 'void'
 where d.status = 'cancelled' and d.lifecycle <> 'void';

update documentos_fiscales d
   set lifecycle = 'draft'
 where d.status in ('pending', 'error') and d.lifecycle = 'issued';

update documentos_fiscales d
   set lifecycle = 'paid',
       amount_paid = coalesce(d.total, 0),
       amount_remaining = 0
  from cotizaciones c
 where c.id = d.cotizacion_id
   and c.status = 'paid'
   and d.lifecycle = 'open';

-- ── Ledger de pagos aplicados a una factura ─────────────────────────────────
-- `cotizacion_cobros` es el ledger de cobros contra la COTIZACIÓN (anticipo,
-- saldo, cuotas). Esta tabla es el ledger contra el DOCUMENTO: es la que
-- responde "¿cuánto le queda a esta factura?". Se relacionan por `cobro_id`
-- cuando el pago entró por el carril de la cotización, y esa fila es nullable
-- porque un pago manual (transferencia, efectivo) no tiene cobro asociado.
create table if not exists documento_pagos (
  id              uuid        default gen_random_uuid() primary key,
  org_id          uuid        not null references orgs(id) on delete cascade,
  documento_id    uuid        not null references documentos_fiscales(id) on delete cascade,
  cobro_id        uuid        references cotizacion_cobros(id) on delete set null,
  monto           numeric     not null check (monto > 0),
  currency        text        not null,
  metodo          text        not null default 'manual',
  referencia      text,
  stripe_payment_intent_id text,
  nota            text,
  registrado_por  uuid,
  aplicado_at     timestamptz not null default now(),
  created_at      timestamptz not null default now()
);

create index if not exists idx_documento_pagos_doc on documento_pagos(documento_id, aplicado_at desc);
create index if not exists idx_documento_pagos_org on documento_pagos(org_id);
-- Idempotencia del webhook de Stripe: un PaymentIntent se aplica UNA vez a una
-- factura. Sin esto, un reintento de Stripe (que reintenta por diseño) cobraría
-- dos veces contra el saldo y dejaría la factura en `paid` con la mitad cobrada.
-- Mercado Pago paga facturas por su propio carril: su idempotencia es el id del
-- pago del proveedor, no el PaymentIntent de Stripe.
alter table documentos_fiscales add column if not exists mp_preference_id text;
alter table documentos_fiscales add column if not exists mp_preference_at timestamptz;

alter table documento_pagos add column if not exists mp_payment_id text;
create unique index if not exists uq_documento_pagos_mp
  on documento_pagos(documento_id, mp_payment_id) where mp_payment_id is not null;

create unique index if not exists uq_documento_pagos_pi
  on documento_pagos(documento_id, stripe_payment_intent_id)
  where stripe_payment_intent_id is not null;

alter table documento_pagos enable row level security;
drop policy if exists "rls_documento_pagos" on documento_pagos;
create policy "rls_documento_pagos" on documento_pagos
  using (org_id = nullif(current_setting('app.org_id', true), '')::uuid)
  with check (org_id = nullif(current_setting('app.org_id', true), '')::uuid);
alter table documento_pagos force row level security;

-- Resolutor del token de la hosted invoice page. Mismo patrón, mismas razones
-- que cord_resolve_public_quote: la página pública necesita traducir un token
-- opaco a (documento, organización) ANTES de poder abrir una transacción con
-- contexto de org, y no existe —ni debe existir— una política RLS basada en el
-- token. SECURITY DEFINER acotado a esa única traducción; nada más se expone.
--
-- Un borrador nunca resuelve: todavía no es un documento para el cliente.
create or replace function cord_resolve_public_invoice(p_token text)
returns table(id uuid, org_id uuid)
language sql stable security definer
set search_path = public, pg_temp
as $$
  select d.id, d.org_id from documentos_fiscales d
   where p_token is not null and p_token <> ''
     and d.public_token = p_token
     and d.lifecycle <> 'draft'
   limit 1
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- IMPUESTOS PAÍS-NEUTROS (ago 2026)
-- ═══════════════════════════════════════════════════════════════════════════
-- El catálogo `impuestos` nació mexicano: su `tipo` era el vocabulario del SAT
-- (iva | ieps | ret_iva | ret_isr | exento) y su único consumidor real era la
-- sincronización hacia orgs.iva_pct, que el editor de cotizaciones leía como
-- una tasa PLANA para todo el documento. Dos consecuencias medibles:
--
--   1. Configurar "IVA 8% frontera" o "Exento" no cambiaba nada en una
--      cotización — el catálogo existía sin consumidor (regla 15, sobre dinero).
--   2. Un negocio en Madrid o en Sídney veía "IEPS" y "Retención ISR" en su
--      perfil fiscal, conceptos que en su país no existen (regla 10).
--
-- `kind` es la clasificación NEUTRA y es la que decide la aritmética. `tipo` se
-- conserva como subcódigo del país porque MexicoSatProvider lo mapea a los
-- impuestos trasladados/retenidos del CFDI 4.0; fuera de México no significa
-- nada y por eso no se muestra.
alter table impuestos add column if not exists kind text not null default 'consumo';
-- consumo   → se SUMA a la base (IVA, VAT, GST, ITBIS, IGV, sales tax…)
-- retencion → se RESTA del total (ret. IVA/ISR en MX, ReteIVA/ReteFuente en CO…)
-- exento    → tasa 0 explícita; no es lo mismo que "no gravado" en el desglose
alter table impuestos drop constraint if exists chk_impuestos_kind;
alter table impuestos add constraint chk_impuestos_kind
  check (kind in ('consumo', 'retencion', 'exento'));

-- Backfill del vocabulario mexicano preexistente hacia la clasificación neutra.
update impuestos set kind = case
  when tipo in ('iva', 'ieps')       then 'consumo'
  when tipo in ('ret_iva', 'ret_isr') then 'retencion'
  else 'exento'
end
where kind = 'consumo' and tipo <> 'iva';

create index if not exists idx_impuestos_org_kind on impuestos(org_id, kind, es_default);

-- ── Impuesto POR LÍNEA en cotizaciones ──────────────────────────────────────
-- Vender mezclando tasas —un concepto exento junto a uno gravado, servicios y
-- bienes con tratamiento distinto— es normal en cuanto sales de un solo país.
-- La factura ya lo resolvía (calculateInvoiceTotals); la cotización aplanaba
-- todo a orgs.iva_pct y luego el documento fiscal no cuadraba con ella.
--
-- `tax_rate` es SNAPSHOT al capturar, no una lectura viva del catálogo: editar
-- una tasa después no debe reescribir en silencio la aritmética de una
-- cotización ya enviada o firmada. Mismo criterio que line_items_snapshot.
alter table cotizacion_items add column if not exists impuesto_id uuid references impuestos(id) on delete set null;
-- NULLABLE a propósito: `null` significa "esta línea es anterior al impuesto por
-- línea" y cae a la tasa de la organización; `0` significa "exenta", que es una
-- decisión explícita del vendedor. Con `not null default 0` las cotizaciones ya
-- existentes habrían pasado a mostrar cero impuesto de un día para otro.
alter table cotizacion_items add column if not exists tax_rate numeric; -- FRACCIÓN (0.16), no porcentaje

-- ── Retenciones con consumidor ──────────────────────────────────────────────
-- orgs.retencion_iva_pct y retencion_isr_pct se capturaban en Ajustes, se
-- guardaban en /api/org y no los leía NADIE: ni los totales, ni el PDF, ni el
-- CFDI. Se guardaba un número que el negocio creía estar aplicando.
-- El total retenido se persiste con el documento por la misma razón que
-- tax_rate: es el resultado del cálculo de ESE día, no de la config de hoy.
alter table cotizaciones        add column if not exists retencion_total numeric not null default 0;
alter table documentos_fiscales add column if not exists retencion_total numeric not null default 0;

-- Desglose de retenciones aplicadas, para que el PDF y el CFDI puedan
-- declararlas una por una en vez de mostrar un total sin origen.
alter table cotizaciones        add column if not exists retenciones_snapshot jsonb not null default '[]'::jsonb;
alter table documentos_fiscales add column if not exists retenciones_snapshot jsonb not null default '[]'::jsonb;

-- ═══════════════════════════════════════════════════════════════════════════
-- LA FACTURA COMO OBJETO VIVO (ago 2026)
-- ═══════════════════════════════════════════════════════════════════════════
-- `eventos` es el timeline que alimenta "tu cliente vio la cotización" y el
-- feed de actividad del detalle. Solo apuntaba a `cotizaciones`, así que la
-- página de una factura no tenía historia: ni cuándo se envió, ni cuándo la
-- abrió el cliente, ni cuándo entró un pago. Una factura independiente —sin
-- cotización detrás— era un documento sin pasado.
alter table eventos add column if not exists documento_id uuid references documentos_fiscales(id) on delete cascade;
create index if not exists idx_eventos_documento on eventos(documento_id, created_at desc);

-- ── Autor de cada evento (oct 2026) ─────────────────────────────────────────
-- La campana de la topbar mostraba TODO el timeline: "Cotización enviada" o
-- "Borrador actualizado" encendían el aviso con las acciones del propio
-- vendedor (regla 19: una señal sin actor es un bug esperando a ocurrir).
--   'vendedor' = la escribió una sesión de usuario (app.user_id no vacío)
--   'externo'  = sin sesión: el cliente en /q o /i, un webhook de pago, un cron
--   null       = histórico, anterior a esta columna
-- El DEFAULT lo decide Postgres con el contexto que withOrgTx ya fija, así que
-- ninguna inserción cambia y el código puede desplegarse antes o después de esta
-- migración. Son DOS sentencias a propósito: un `add column ... default` habría
-- rellenado el historial evaluando el default AHORA (sin sesión → 'externo') y
-- todo lo viejo, incluidas las acciones del vendedor, aparecería como del cliente.
alter table eventos add column if not exists actor text;
alter table eventos alter column actor set default (
  case when coalesce(current_setting('app.user_id', true), '') <> '' then 'vendedor' else 'externo' end
);
-- ── fin autor de eventos ──

-- Las tareas del CRM tampoco podían colgar de una factura.
alter table tareas add column if not exists documento_id uuid references documentos_fiscales(id) on delete set null;
create index if not exists idx_tareas_documento on tareas(documento_id) where documento_id is not null;

-- ── Escalera de recordatorios con deduplicación real ────────────────────────
-- `cron/recordatorios.ts` mandaba UN correo en la ventana
-- `due_date - current_date between -1 and 3`, y su propio comentario admitía que
-- la no-duplicación dependía de que el cron corriera exactamente una vez al día.
-- Dos ejecuciones el mismo día mandaban dos correos al mismo cliente; una
-- ejecución perdida se saltaba el aviso para siempre.
--
-- Con esta tabla la dedup es un hecho de la base y no del calendario: cada etapa
-- se manda UNA vez por documento, sin importar cuántas veces corra el cron.
create table if not exists documento_recordatorios (
  id            uuid        default gen_random_uuid() primary key,
  org_id        uuid        not null references orgs(id) on delete cascade,
  documento_id  uuid        not null references documentos_fiscales(id) on delete cascade,
  -- Días respecto al vencimiento: -7 y -1 son avisos; 0, 3, 7, 14 y 30 son
  -- cobranza. El signo es parte de la identidad de la etapa.
  etapa         int         not null,
  enviado_at    timestamptz not null default now(),
  canal         text        not null default 'email',
  unique (documento_id, etapa)
);
create index if not exists idx_doc_recordatorios_org on documento_recordatorios(org_id, enviado_at desc);

alter table documento_recordatorios enable row level security;
drop policy if exists "rls_documento_recordatorios" on documento_recordatorios;
create policy "rls_documento_recordatorios" on documento_recordatorios
  using (org_id = nullif(current_setting('app.org_id', true), '')::uuid)
  with check (org_id = nullif(current_setting('app.org_id', true), '')::uuid);
alter table documento_recordatorios force row level security;

-- Cadencia configurable por organización (Ajustes › Recordatorios, oct 2026).
-- La pantalla y la API (src/pages/api/org/recordatorios.ts) solo aceptan el
-- vocabulario cerrado de src/lib/recordatorios.ts (14/7/3/1 días antes, el día
-- del vencimiento y 1/3/7/14/30/60/90 días después, máximo 8); el default es la
-- escalera de siempre, así que una cuenta que nunca la tocó no cambia.
alter table orgs add column if not exists recordatorio_etapas int[] not null default '{-7,-1,3,7,14,30}';
-- Interruptor de los recordatorios automáticos AL CLIENTE (facturas y
-- cotizaciones). Apagado no toca los avisos al dueño ni el webhook
-- invoice.overdue. Encendido por defecto: es el comportamiento de siempre.
alter table orgs add column if not exists recordatorios_activos boolean not null default true;

-- ── Cobranza sobre los DOS rieles ───────────────────────────────────────────
-- Toda la maquinaria de cuentas por cobrar —el agente de cobranza IA, los
-- intereses moratorios, las exclusiones, las promesas y los planes de pago
-- negociados— hacía `from cotizaciones`. Una factura independiente, sin
-- cotización detrás, era invisible para el negocio entero de cobrar: no entraba
-- al agente, no acumulaba interés, no se podía excluir y no admitía una promesa
-- de pago.
--
-- Cada tabla gana `documento_id` con la misma regla de exclusividad que ya usa
-- `documentos_fiscales`: el registro cuelga de una cotización O de una factura,
-- nunca de las dos ni de ninguna.
alter table cobranza_conversaciones add column if not exists documento_id uuid references documentos_fiscales(id) on delete cascade;
alter table cobranza_exclusiones    add column if not exists documento_id uuid references documentos_fiscales(id) on delete cascade;
alter table planes_pago_negociados  add column if not exists documento_id uuid references documentos_fiscales(id) on delete cascade;
alter table promesas_pago           add column if not exists documento_id uuid references documentos_fiscales(id) on delete cascade;
alter table intereses_moratorios    add column if not exists documento_id uuid references documentos_fiscales(id) on delete cascade;

create index if not exists idx_cob_conv_documento  on cobranza_conversaciones(documento_id) where documento_id is not null;
create index if not exists idx_cob_excl_documento  on cobranza_exclusiones(documento_id)    where documento_id is not null;
create index if not exists idx_planes_documento    on planes_pago_negociados(documento_id)  where documento_id is not null;
create index if not exists idx_promesas_documento  on promesas_pago(documento_id)           where documento_id is not null;
create index if not exists idx_intereses_documento on intereses_moratorios(documento_id)    where documento_id is not null;

-- Días de un término de pago. Misma regla que `termDays()` de
-- src/lib/payment-terms.ts: 'net<N>' = N días naturales; cualquier otra cosa
-- (contado, null, un código desconocido) = 0. Antes cada consulta tenía su
-- propio `case` con los días de net30 y net60 escritos a mano, así que un
-- plazo nuevo vencía el mismo día en la cartera y la cobranza lo perseguía
-- como vencido. `immutable`: se puede usar en índices y el planificador lo
-- pliega.
create or replace function cord_term_days(p_terminos text)
returns integer
language sql immutable parallel safe
as $$
  select coalesce(substring(lower(trim(p_terminos)) from '^net([0-9]{1,3})$')::integer, 0)
$$;

-- Vista única de cuentas por cobrar. Une los dos rieles con UNA forma común
-- para que el agente de cobranza, el cron de intereses y los informes consulten
-- un solo lugar en vez de duplicar la aritmética del vencimiento — que en
-- cotizaciones se deriva de los términos y en facturas es una columna.
--
-- `origen` distingue el riel; `ref_id` es el id dentro de ese riel. Una factura
-- emitida DESDE una cotización aparece solo como factura: el documento fiscal
-- es el que manda el saldo real, y contar ambos duplicaría la cartera.
create or replace view cuentas_por_cobrar as
  select
    'factura'::text                              as origen,
    d.id                                         as ref_id,
    d.org_id,
    d.cliente_id,
    d.invoice_number                             as folio,
    d.currency                                   as moneda,
    d.total,
    coalesce(d.amount_paid, 0)                   as pagado,
    coalesce(d.amount_remaining, d.total)        as saldo,
    d.due_date                                   as vence,
    (current_date - d.due_date)                  as dias_vencido,
    d.public_token                               as token,
    d.cotizacion_id
  from documentos_fiscales d
  where d.lifecycle = 'open'
    and d.due_date is not null
    and coalesce(d.amount_remaining, d.total) > 0

  union all

  select
    'cotizacion'::text                           as origen,
    c.id                                         as ref_id,
    c.org_id,
    c.cliente_id,
    c.folio,
    c.base_currency                              as moneda,
    c.total,
    coalesce((select sum(cc.monto) from cotizacion_cobros cc
               where cc.cotizacion_id = c.id and cc.status = 'pagado'), 0) as pagado,
    c.total - coalesce((select sum(cc.monto) from cotizacion_cobros cc
               where cc.cotizacion_id = c.id and cc.status = 'pagado'), 0)  as saldo,
    (coalesce(c.approved_at, c.created_at)
      + make_interval(days => cord_term_days(c.terminos)))::date        as vence,
    (current_date - (coalesce(c.approved_at, c.created_at)
      + make_interval(days => cord_term_days(c.terminos)))::date)       as dias_vencido,
    c.public_token                               as token,
    c.id                                         as cotizacion_id
  from cotizaciones c
  where c.status in ('approved', 'invoiced')
    and c.es_recurrente is not true
    and c.paid_at is null
    -- Si ya se emitió una factura VIVA de esta cotización, el saldo real lo
    -- lleva la factura: contarla en los dos rieles duplicaría la cartera. Viva
    -- es abierta, pagada o incobrable — no solo abierta: una factura pagada en
    -- /i deja la cotización `invoiced` sin `paid_at`, y con el filtro anterior
    -- esa venta ya cobrada reaparecía aquí como deuda.
    and not exists (
      select 1 from documentos_fiscales d2
       where d2.cotizacion_id = c.id and d2.org_id = c.org_id
         and d2.lifecycle in ('open', 'paid', 'uncollectible')
    );

-- `intereses_moratorios.cotizacion_id` era NOT NULL: literalmente no cabía un
-- cargo sobre una factura independiente. Se relaja y la unicidad se declara por
-- riel, para que un mismo periodo no pueda cobrarse dos veces en ninguno.
alter table intereses_moratorios alter column cotizacion_id drop not null;
create unique index if not exists uq_intereses_documento_periodo
  on intereses_moratorios(documento_id, periodo) where documento_id is not null;
alter table intereses_moratorios drop constraint if exists chk_intereses_origen;
alter table intereses_moratorios add constraint chk_intereses_origen
  check (cotizacion_id is not null or documento_id is not null);

-- Las tres tablas de cobranza exigían `cotizacion_id`: literalmente no cabía un
-- hilo, un plan de pago ni una promesa sobre una factura independiente.
alter table cobranza_conversaciones alter column cotizacion_id drop not null;
alter table planes_pago_negociados  alter column cotizacion_id drop not null;
alter table promesas_pago           alter column cotizacion_id drop not null;

alter table cobranza_conversaciones drop constraint if exists chk_cob_conv_origen;
alter table cobranza_conversaciones add constraint chk_cob_conv_origen
  check (cotizacion_id is not null or documento_id is not null);
alter table planes_pago_negociados drop constraint if exists chk_planes_origen;
alter table planes_pago_negociados add constraint chk_planes_origen
  check (cotizacion_id is not null or documento_id is not null);
alter table promesas_pago drop constraint if exists chk_promesas_origen;
alter table promesas_pago add constraint chk_promesas_origen
  check (cotizacion_id is not null or documento_id is not null);

-- La exclusión ya admitía solo-cliente; ahora también solo-factura.
alter table cobranza_exclusiones drop constraint if exists cobranza_exclusiones_target;
alter table cobranza_exclusiones add constraint cobranza_exclusiones_target
  check (cliente_id is not null or cotizacion_id is not null or documento_id is not null);

-- ── Facturas recurrentes ────────────────────────────────────────────────────
-- La recurrencia solo existía como iguala DE COTIZACIÓN
-- (`cotizacion_suscripciones`): el cliente autorizaba un cargo mensual sobre el
-- link de la propuesta. Eso sirve para un retainer que se vende una vez, no para
-- un negocio que factura lo mismo cada mes a treinta clientes — ese tenía que
-- volver a capturar cada factura a mano, cada mes.
--
-- La plantilla de líneas se guarda como snapshot: la recurrencia describe QUÉ se
-- factura, y cada emisión congela sus propios importes e impuestos. Cambiar un
-- precio del catálogo no debe reescribir las facturas ya emitidas.
create table if not exists documento_recurrencias (
  id                uuid        primary key default gen_random_uuid(),
  org_id            uuid        not null references orgs(id) on delete cascade,
  cliente_id        uuid        not null references clientes(id) on delete cascade,
  nombre            text        not null,
  lineas_snapshot   jsonb       not null default '[]'::jsonb,
  currency          text        not null default 'MXN',
  notas             text,
  -- mensual | trimestral | anual. Un intervalo libre en días invita a cadencias
  -- que ningún calendario contable reconoce.
  cadencia          text        not null default 'mensual',
  -- Día del mes de emisión (1–28). Se topa en 28 a propósito: un "31" se salta
  -- febrero en silencio, y una factura que no se emite no se cobra.
  dia_mes           int         not null default 1,
  -- Días de crédito que se suman a la fecha de emisión para el vencimiento.
  dias_credito      int         not null default 0,
  next_run_at       date        not null,
  end_date          date,
  activa            boolean     not null default true,
  -- Cobro automático con el método guardado del cliente. Sin él, la recurrencia
  -- solo EMITE y ENVÍA: sigue siendo útil, y no promete un cargo que no puede hacer.
  autopay           boolean     not null default false,
  stripe_payment_method_id text,
  stripe_customer_id       text,
  ultima_emision_at timestamptz,
  ultimo_error      text,
  created_by        uuid        references users(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint chk_recurrencia_cadencia check (cadencia in ('mensual', 'trimestral', 'anual')),
  constraint chk_recurrencia_dia check (dia_mes between 1 and 28)
);
create index if not exists idx_recurrencias_org on documento_recurrencias(org_id, activa, next_run_at);
-- El barrido del cron cruza organizaciones: necesita el índice sin org_id.
create index if not exists idx_recurrencias_due on documento_recurrencias(next_run_at) where activa;

alter table documento_recurrencias enable row level security;
drop policy if exists "rls_documento_recurrencias" on documento_recurrencias;
create policy "rls_documento_recurrencias" on documento_recurrencias
  using (org_id = nullif(current_setting('app.org_id', true), '')::uuid)
  with check (org_id = nullif(current_setting('app.org_id', true), '')::uuid);
alter table documento_recurrencias force row level security;

-- Trazabilidad: de qué recurrencia salió cada factura.
alter table documentos_fiscales add column if not exists recurrencia_id uuid references documento_recurrencias(id) on delete set null;
create index if not exists idx_documentos_recurrencia on documentos_fiscales(recurrencia_id) where recurrencia_id is not null;

-- ── Entorno de prueba: la sandbox hereda la PRESENTACIÓN del padre ──────────
-- `idioma`, `moneda` y `zona_horaria` deciden en qué idioma, divisa y zona se
-- renderiza la app. En modo de prueba `getActiveOrgId()` resuelve la org
-- SANDBOX, así que se leen de ESA fila: si nace con los defaults del schema
-- (es-MX / MXN / CDMX), un negocio con la cuenta en inglés ve la app entera
-- voltearse al español al encender el toggle.
--
-- Mantener la copia al día desde la aplicación ya falló: había tres caminos que
-- tenían que acordarse de propagar (el insert de resolveSandboxOrgId, el PATCH
-- de Ajustes y un backfill), y `POST /api/onboarding/complete` —que también
-- escribe estas tres columnas— no propagaba. La invariante se impone aquí, en
-- la base, donde ningún camino nuevo la puede saltar.
--
-- Son DOS triggers con trabajos distintos:
--   · al nacer, la sandbox toma la presentación del padre;
--   · cuando el padre la cambia, baja a la sandbox.
-- Deliberadamente NO hay `before update` sobre la sandbox: un cambio hecho a
-- propósito DENTRO del modo de prueba se respeta hasta el siguiente cambio del
-- padre. Con un update forzado, los tres controles de Ajustes guardarían y se
-- revertirían solos — la regla 15 al revés.

create or replace function cord_sandbox_inherit_presentation()
returns trigger
language plpgsql
as $$
begin
  if new.sandbox_of is not null then
    select p.idioma, p.moneda, p.zona_horaria
      into new.idioma, new.moneda, new.zona_horaria
      from orgs p
     where p.id = new.sandbox_of;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_sandbox_inherit_presentation on orgs;
create trigger trg_sandbox_inherit_presentation
  before insert on orgs
  for each row execute function cord_sandbox_inherit_presentation();

-- El `update` de abajo corre bajo el contexto del PADRE (app.org_id = padre), y
-- la política rls_orgs admite `sandbox_of = app.org_id` tanto en `using` como en
-- `with check` — por eso no hace falta security definer.
create or replace function cord_sandbox_cascade_presentation()
returns trigger
language plpgsql
as $$
begin
  update orgs
     set idioma = new.idioma, moneda = new.moneda, zona_horaria = new.zona_horaria
   where sandbox_of = new.id;
  return null;
end;
$$;

drop trigger if exists trg_sandbox_cascade_presentation on orgs;
create trigger trg_sandbox_cascade_presentation
  after update of idioma, moneda, zona_horaria on orgs
  for each row
  when (new.sandbox_of is null
        and (old.idioma       is distinct from new.idioma
          or old.moneda       is distinct from new.moneda
          or old.zona_horaria is distinct from new.zona_horaria))
  execute function cord_sandbox_cascade_presentation();

-- Backfill: alinea las sandbox que ya existían. Sin condición sobre el valor
-- previo — la invariante que los triggers sostienen de aquí en adelante es
-- "la sandbox nace y sigue al padre", y este es su punto de partida.
update orgs s
   set idioma = p.idioma, moneda = p.moneda, zona_horaria = p.zona_horaria
  from orgs p
 where s.sandbox_of = p.id
   and (s.idioma       is distinct from p.idioma
     or s.moneda       is distinct from p.moneda
     or s.zona_horaria is distinct from p.zona_horaria);

-- ── Internacionalización financiera: identidad fiscal real del cliente ──────
-- `clientes` solo tenía `rfc` (nombre mexicano) y campos SAT. Sin país ni
-- dirección, el receptor de toda factura fuera de México heredaba el país del
-- EMISOR (emit.ts / invoices.ts leían `country` de `orgs`, nunca del cliente),
-- así que un cliente estadounidense de una empresa española quedaba registrado
-- como español en el documento — y sin domicilio, incumpliendo el art. 6.1.c
-- del reglamento de facturación español.
--
-- `country_code` nace NULL a propósito: `null` = "hereda el país del emisor",
-- que es el comportamiento de hoy. Un default 'MX' habría reescrito en
-- silencio la nacionalidad de todo cliente ya guardado.
alter table clientes add column if not exists country_code text;
alter table clientes add column if not exists direccion_line1 text;
alter table clientes add column if not exists direccion_line2 text;
alter table clientes add column if not exists ciudad text;
alter table clientes add column if not exists region text; -- estado/provincia/state, según el país

-- ── Retenciones: sobre qué base se calculan ─────────────────────────────────
-- El motor (engine.ts) restaba toda retención sobre el SUBTOTAL, correcto para
-- México (la Retención de IVA 10.667% es 2/3 del IVA del 16%, ambos sobre el
-- mismo subtotal) pero falso para Colombia: la ReteIVA es 15% DEL IVA, no del
-- subtotal — modelarla como 'subtotal' calculaba 5.26× de más. `retencion_base`
-- nace 'subtotal' para no reescribir en silencio las retenciones ya guardadas.
alter table impuestos add column if not exists retencion_base text not null default 'subtotal';
alter table impuestos drop constraint if exists chk_impuestos_retencion_base;
alter table impuestos add constraint chk_impuestos_retencion_base
    check (retencion_base in ('subtotal', 'impuesto', 'gravado'));

-- 'gravado' (oct 2026): la Retención de IVA mexicana se calcula sobre los
-- conceptos que TRASLADAN IVA (LIVA art. 1-A), no sobre el subtotal completo:
-- con un concepto exento en la factura se retenía IVA que nunca se cobró. Solo
-- cambia el catálogo; cada documento ya capturado conserva la base congelada
-- en su `retenciones_snapshot` (regla 23). Mismo cambio para la tasa sembrada
-- 10.667, que no es 2/3 del 16% (10.6667): sobre $100,000 retenía 33 centavos
-- de más. Solo la fila intacta del preset; una tasa capturada a mano no se toca.
update impuestos i set retencion_base = 'gravado'
  from orgs o
 where o.id = i.org_id and upper(coalesce(o.country_code, 'MX')) = 'MX'
   and i.tipo = 'ret_iva' and i.kind = 'retencion' and i.retencion_base = 'subtotal';
update impuestos set nombre = 'Retención IVA 10.6667%', tasa = 10.6667
 where tipo = 'ret_iva' and nombre = 'Retención IVA 10.667%' and tasa = 10.667;

-- Perú (oct 2026): la "Retención IGV 3%" sembrada no corresponde al emisor —la
-- practica el comprador agente de retención, al pagar y con su propio
-- comprobante—. Se retira la fila sembrada mientras nadie la haya marcado como
-- predeterminada; los documentos ya emitidos conservan su snapshot.
delete from impuestos i
 using orgs o
 where o.id = i.org_id and upper(coalesce(o.country_code, '')) = 'PE'
   and i.nombre = 'Retención IGV 3%' and i.kind = 'retencion' and i.tasa = 3 and i.es_default is not true;

-- Canadá (oct 2026): QST, PST y RST se sembraban como tasas SUELTAS, y se
-- cobran junto al 5% de GST, no en su lugar: una línea con "QST 9.975% (QC)"
-- cobraba la QST sin el GST. Las filas intactas del preset pasan a la tasa
-- combinada, que el desglose separa en sus dos impuestos. BC y MB comparten el
-- 7% y quedan en una sola opción (el selector elige por tasa); la de MB se
-- retira salvo que sea la predeterminada. Los documentos ya capturados
-- conservan su tasa congelada.
update impuestos i set nombre = 'GST 5% + QST 9.975% (QC)', tasa = 14.975
  from orgs o
 where o.id = i.org_id and upper(coalesce(o.country_code, '')) = 'CA'
   and i.nombre = 'QST 9.975% (QC)' and i.kind = 'consumo' and i.tasa = 9.975;
update impuestos i set nombre = 'GST 5% + PST 6% (SK)', tasa = 11
  from orgs o
 where o.id = i.org_id and upper(coalesce(o.country_code, '')) = 'CA'
   and i.nombre = 'PST 6% (SK)' and i.kind = 'consumo' and i.tasa = 6;
update impuestos i set nombre = 'GST 5% + PST/RST 7% (BC/MB)', tasa = 12
  from orgs o
 where o.id = i.org_id and upper(coalesce(o.country_code, '')) = 'CA'
   and i.nombre = 'PST 7% (BC)' and i.kind = 'consumo' and i.tasa = 7;
delete from impuestos i
 using orgs o
 where o.id = i.org_id and upper(coalesce(o.country_code, '')) = 'CA'
   and i.nombre = 'RST 7% (MB)' and i.kind = 'consumo' and i.tasa = 7 and i.es_default is not true;
update impuestos i set nombre = 'GST 5% + RST 7% (MB)', tasa = 12
  from orgs o
 where o.id = i.org_id and upper(coalesce(o.country_code, '')) = 'CA'
   and i.nombre = 'RST 7% (MB)' and i.kind = 'consumo' and i.tasa = 7;
-- La tasa plana heredada sigue al catálogo: con 9.975 en orgs.iva_pct el
-- selector volvía a ofrecer "QST sin GST" como opción sintética.
update orgs set iva_pct = case iva_pct when 9.975 then 14.975 when 7 then 12 when 6 then 11 end
 where upper(coalesce(country_code, '')) = 'CA' and iva_pct in (9.975, 7, 6);

-- ── Causa de exención por concepto (España, oct 2026) ──────────────────────
-- Una línea al 0 % puede ser una exportación (art. 21 LIVA), una entrega
-- intracomunitaria (art. 25), una exención del art. 20 o una inversión del
-- sujeto pasivo, y Verifactu declara cuál (OperacionExenta E1–E6,
-- CalificacionOperacion N1/N2/S2). La causa vive en el perfil exento del
-- catálogo y se CONGELA en el concepto como la tasa: cambiar el catálogo
-- después no reescribe un documento ya capturado. En la factura viaja dentro
-- de `line_items_snapshot` (`exemptionReason`). Null = la deriva desglose.ts.
alter table impuestos add column if not exists exemption_reason text;
alter table impuestos drop constraint if exists chk_impuestos_exemption_reason;
alter table impuestos add constraint chk_impuestos_exemption_reason
  check (exemption_reason is null or (kind = 'exento' and exemption_reason in ('E1','E2','E3','E4','E5','E6','N1','N2','S2')));
alter table cotizacion_items add column if not exists exemption_reason text;
alter table cotizacion_items drop constraint if exists chk_cotizacion_items_exemption_reason;
alter table cotizacion_items add constraint chk_cotizacion_items_exemption_reason
  check (exemption_reason is null or exemption_reason in ('E1','E2','E3','E4','E5','E6','N1','N2','S2'));

-- Migraciones de DATOS que corren una sola vez. Las de esquema son idempotentes
-- por construcción (`if not exists`); una que agrega filas al catálogo de un
-- negocio no lo es: sin este registro, cada despliegue devolvía los perfiles
-- que el negocio había borrado a propósito.
create table if not exists migraciones_datos (
  id          text        primary key,
  aplicada_at timestamptz not null default now()
);

-- Las cuentas de España que cobran IVA reciben las causas habituales como
-- perfiles exentos más, UNA vez (migraciones_datos). No cambian nada hasta que
-- un concepto las elige.
insert into impuestos (org_id, nombre, tipo, kind, tasa, es_default, exemption_reason)
select o.id, c.nombre, 'exento', 'exento', 0, false, c.causa
  from orgs o
 cross join (values
   ('Exportación (art. 21)', 'E2'),
   ('Entrega intracomunitaria (art. 25)', 'E5'),
   ('Exenta art. 20', 'E1'),
   ('Inversión del sujeto pasivo', 'S2')
 ) as c(nombre, causa)
 where upper(coalesce(o.country_code, '')) = 'ES'
   and not exists (select 1 from migraciones_datos m where m.id = 'es-causas-exencion-2026-10')
   and exists (select 1 from impuestos i where i.org_id = o.id and i.kind = 'consumo' and i.nombre like 'IVA %')
   and not exists (select 1 from impuestos i where i.org_id = o.id and i.exemption_reason = c.causa);
insert into migraciones_datos (id) values ('es-causas-exencion-2026-10') on conflict (id) do nothing;

-- ── Numeración de facturas: serie + ejercicio ───────────────────────────────
-- `invoice_sequences` numeraba indefinidamente sin año ni serie: legal con
-- serie única, pero incompatible con cualquier gestoría española, y cambiar
-- `invoice_prefix` en Ajustes reescribía el prefijo de la MISMA fila sin
-- resetear `next_value` — pasar de "INV" a "FRA" producía "INV-000122" →
-- "FRA-000123" en vez de reiniciar en 1.
--
-- `ejercicio = 0` es el valor de TODA fila existente (el `alter table` la
-- rellena con el default antes de que el nuevo PK se aplique) y significa
-- "sin reinicio anual" — exactamente el comportamiento de siempre, así que
-- ninguna secuencia ya viva cambia de número. España sí reinicia: el
-- ejercicio forma parte del PK de la secuencia, así que un año nuevo
-- simplemente encuentra una fila que no existía y arranca en 1 sin lógica de
-- "reset" aparte. `serie` nace vacía por el mismo motivo.
alter table invoice_sequences add column if not exists serie text not null default '';
alter table invoice_sequences add column if not exists ejercicio int not null default 0;

alter table invoice_sequences drop constraint if exists invoice_sequences_pkey;
alter table invoice_sequences add constraint invoice_sequences_pkey
    primary key (org_id, country_code, document_type, serie, ejercicio);

-- La serie ES el `prefix` (ver emit.ts/invoices.ts): backfill de una sola vez
-- para las filas que nacieron con `serie=''` antes de este cambio. Sin esto,
-- la primera factura después de desplegar buscaría la llave
-- (org_id, país, tipo, prefix, 0) — que no existe todavía— y crearía una fila
-- NUEVA arrancando en 1, duplicando el folio que la secuencia vieja ya había
-- emitido. Idempotente: una fila que ya tiene `serie = prefix` no hace match
-- del `where` y no se vuelve a tocar.
update invoice_sequences set serie = prefix where serie = '' and prefix <> '';

-- ── Verifactu: cadena de registros de facturación (España) ─────────────────
-- Cada factura emitida en España genera un registro de "alta" (o de
-- "anulación" al cancelarla) con su huella SHA-256 encadenada a la huella del
-- registro ANTERIOR de la misma org — algoritmo verificado contra los
-- vectores oficiales de la AEAT en src/lib/fiscal/verifactu/huella.ts. La
-- tabla es APPEND-ONLY por diseño: alterar `huella`, `huella_anterior`,
-- `payload` o `seq` después de escritos rompería la cadena que la propia ley
-- exige poder verificar. Solo el estado de ENVÍO (columnas `envio_*`) puede
-- cambiar, porque eso es responsabilidad de Cord, no del dato ya firmado.
create table if not exists verifactu_registros (
  id              uuid        default gen_random_uuid() primary key,
  org_id          uuid        not null references orgs(id) on delete cascade,
  documento_id    uuid        not null references documentos_fiscales(id) on delete restrict,
  tipo            text        not null,               -- 'alta' | 'anulacion'
  seq             bigint      not null,                -- posición en la cadena de ESTA org
  huella_anterior text        not null default '',     -- '' = primer registro del SIF
  huella          text        not null,                -- SHA-256 hex MAYÚSCULAS, 64 chars
  payload         jsonb       not null,                -- el registro tal como se firmó
  generado_at     timestamptz not null default now(),
  envio_estado    text        not null default 'pendiente', -- pendiente|aceptado|aceptado_con_errores|rechazado|bloqueado
  envio_at        timestamptz,
  aeat_respuesta  jsonb,
  created_at      timestamptz not null default now(),
  unique (org_id, seq),
  check (tipo in ('alta', 'anulacion')),
  check (huella ~ '^[0-9A-F]{64}$')
);

-- Correcciones (oct 2026). Un registro firmado no se edita: se corrige con
-- OTRO registro de la misma factura (subsanación, anexo 6 de Validaciones y
-- errores de la AEAT). `subsana_de` apunta al registro corregido y las otras
-- tres columnas repiten, consultables, la operativa que el payload firmado ya
-- declara. Por eso la unicidad por factura deja de ser unique(documento_id,
-- tipo) y pasa a un índice parcial sobre los registros ORIGINALES; cada
-- registro admite como mucho UNA corrección directa.
alter table verifactu_registros add column if not exists subsana_de uuid references verifactu_registros(id) on delete restrict;
alter table verifactu_registros add column if not exists subsanacion boolean not null default false;
alter table verifactu_registros add column if not exists rechazo_previo text;
alter table verifactu_registros add column if not exists sin_registro_previo boolean not null default false;
-- Intentos de envío y último error: un registro sin respuesta de la AEAT sigue
-- pendiente (no rechazado) y se reintenta; el contador dice cuántas veces.
alter table verifactu_registros add column if not exists envio_intentos int not null default 0;
alter table verifactu_registros add column if not exists envio_error text;
create unique index if not exists uq_verifactu_registros_original
  on verifactu_registros (documento_id, tipo) where subsana_de is null;
create unique index if not exists uq_verifactu_registros_subsana
  on verifactu_registros (subsana_de) where subsana_de is not null;
create index if not exists idx_verifactu_registros_pendientes
  on verifactu_registros (org_id, seq) where envio_estado = 'pendiente';
alter table verifactu_registros drop constraint if exists verifactu_registros_documento_id_tipo_key;
alter table verifactu_registros drop constraint if exists chk_verifactu_rechazo_previo;
alter table verifactu_registros add constraint chk_verifactu_rechazo_previo
  check (rechazo_previo is null or rechazo_previo in ('S', 'X'));
-- `bloqueado` = aparcado: rompe el esquema (o la AEAT rechazó el mensaje
-- entero solo por su culpa) y no se vuelve a mandar tal cual. Sin este estado,
-- un registro inválido hacía fallar todos los envíos de su organización.
alter table verifactu_registros drop constraint if exists verifactu_registros_envio_estado_check;
alter table verifactu_registros drop constraint if exists chk_verifactu_envio_estado;
alter table verifactu_registros add constraint chk_verifactu_envio_estado
  check (envio_estado in ('pendiente', 'aceptado', 'aceptado_con_errores', 'rechazado', 'bloqueado'));

alter table verifactu_registros enable row level security;
drop policy if exists "rls_verifactu_registros" on verifactu_registros;
create policy "rls_verifactu_registros" on verifactu_registros
  using (org_id = nullif(current_setting('app.org_id', true), '')::uuid)
  with check (org_id = nullif(current_setting('app.org_id', true), '')::uuid);
alter table verifactu_registros force row level security;

-- El candado real: ni siquiera el rol de aplicación puede tocar lo ya
-- firmado. `force row level security` protege el AISLAMIENTO entre orgs,
-- pero no impide que la propia org edite su fila — este trigger sí.
--
-- Borrar una ORGANIZACIÓN con registros también se bloquea (oct 2026): la FK
-- org_id es on delete cascade, la cascada llega aquí y se detiene. Es a
-- propósito: los registros de facturación se conservan durante el plazo de
-- prescripción (RD 1007/2023), y debilitar el append-only para permitir la
-- cascada borraría justo lo que la ley obliga a guardar. La cascada se
-- distingue por la profundidad del trigger (la dispara el trigger de la FK) y
-- devuelve un mensaje para el usuario. Quien borra una org pregunta antes con
-- orgTieneRegistrosVerifactu() de src/lib/fiscal/verifactu/chain.ts, para no
-- cancelar la suscripción de una org que después no se puede borrar.
create or replace function cord_verifactu_registro_inmutable()
returns trigger
language plpgsql
as $$
begin
  if TG_OP = 'DELETE' then
    if pg_trigger_depth() > 1 then
      raise exception 'Esta organización tiene registros de facturación Verifactu que la ley obliga a conservar, así que no se puede eliminar.'
        using errcode = 'restrict_violation', hint = 'verifactu_conservacion';
    end if;
    raise exception 'verifactu_registros es append-only: no se puede borrar un registro ya firmado'
      using errcode = 'restrict_violation', hint = 'verifactu_conservacion';
  end if;
  if new.huella is distinct from old.huella
     or new.huella_anterior is distinct from old.huella_anterior
     or new.payload is distinct from old.payload
     or new.seq is distinct from old.seq
     or new.tipo is distinct from old.tipo
     or new.org_id is distinct from old.org_id
     or new.documento_id is distinct from old.documento_id
     or new.subsana_de is distinct from old.subsana_de
     or new.subsanacion is distinct from old.subsanacion
     or new.rechazo_previo is distinct from old.rechazo_previo
     or new.sin_registro_previo is distinct from old.sin_registro_previo
     or new.generado_at is distinct from old.generado_at then
    raise exception 'verifactu_registros es append-only: huella/payload/seq/tipo no se pueden modificar';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_verifactu_registro_inmutable on verifactu_registros;
create trigger trg_verifactu_registro_inmutable
  before update or delete on verifactu_registros
  for each row execute function cord_verifactu_registro_inmutable();

-- Lo mismo, ANTES de que empiece la cascada: el orden en que Postgres ejecuta
-- las cascadas de orgs depende del orden de creación de las FK, y si la de
-- documentos_fiscales corre primero el error visible sería una violación de FK
-- (documento_id es on delete restrict) en vez de este mensaje. Este trigger
-- hace el bloqueo determinista y legible. Bajo un carril que no ve
-- verifactu_registros por RLS, el bloqueo lo sigue garantizando la cascada.
create or replace function cord_orgs_verifactu_conservacion()
returns trigger
language plpgsql
as $$
begin
  if exists (select 1 from verifactu_registros r where r.org_id = old.id) then
    raise exception 'Esta organización tiene registros de facturación Verifactu que la ley obliga a conservar, así que no se puede eliminar.'
      using errcode = 'restrict_violation', hint = 'verifactu_conservacion';
  end if;
  return old;
end;
$$;

drop trigger if exists trg_orgs_verifactu_conservacion on orgs;
create trigger trg_orgs_verifactu_conservacion
  before delete on orgs
  for each row execute function cord_orgs_verifactu_conservacion();

-- Estado del ENVÍO por organización (oct 2026): control de flujo y lease.
--   proximo_envio_at  la AEAT devuelve TiempoEsperaEnvio en cada respuesta y
--                     exige esperarlo antes del siguiente envío (art. 16.2 de
--                     la Orden HAC/1177/2024), salvo que haya 1000 registros.
--   lote_maximo       se parte a la mitad cada vez que un SoapFault aislable
--                     rechaza el mensaje entero, hasta dejar solo al culpable.
--   lease_hasta/token un solo envío en vuelo por organización: el cron horario,
--                     el de respaldo y el envío inmediato tras emitir no pueden
--                     mandar el mismo lote dos veces.
create table if not exists verifactu_envio_estado (
  org_id            uuid        primary key references orgs(id) on delete cascade,
  proximo_envio_at  timestamptz,
  tiempo_espera_s   int         not null default 60,
  lote_maximo       int         not null default 1000,
  lease_hasta       timestamptz,
  lease_token       text,
  ultimo_envio_at   timestamptz,
  ultimo_error      text,
  updated_at        timestamptz not null default now(),
  check (lote_maximo between 1 and 1000),
  check (tiempo_espera_s between 0 and 86400)
);

alter table verifactu_envio_estado enable row level security;
drop policy if exists "rls_verifactu_envio_estado" on verifactu_envio_estado;
create policy "rls_verifactu_envio_estado" on verifactu_envio_estado
  using (org_id = nullif(current_setting('app.org_id', true), '')::uuid)
  with check (org_id = nullif(current_setting('app.org_id', true), '')::uuid);
alter table verifactu_envio_estado force row level security;


-- Registro de eventos del sistema de facturación (RD 1007/2023): arranque,
-- parada, exportación, incidencia, cambio de configuración. Es la evidencia
-- de que el SIF no se manipuló entre registros — no lleva huella propia
-- todavía porque Cord opera un único sistema centralizado, no instalaciones
-- distribuidas que necesiten encadenar EVENTOS entre sí además de facturas.
create table if not exists verifactu_eventos (
  id          uuid        default gen_random_uuid() primary key,
  org_id      uuid        not null references orgs(id) on delete cascade,
  tipo        text        not null,       -- arranque | parada | exportacion | incidencia | cambio_config
  detalle     jsonb       not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

alter table verifactu_eventos enable row level security;
drop policy if exists "rls_verifactu_eventos" on verifactu_eventos;
create policy "rls_verifactu_eventos" on verifactu_eventos
  using (org_id = nullif(current_setting('app.org_id', true), '')::uuid)
  with check (org_id = nullif(current_setting('app.org_id', true), '')::uuid);
alter table verifactu_eventos force row level security;

-- ── Certificado electrónico de Verifactu ────────────────────────────────────
-- Mismo patrón que el CSD de Facturapi (facturapi_live_key_enc): el archivo
-- .p12/.pfx viaja cifrado con encryptRequiredSecret() (AES-256-GCM), nunca en
-- claro. `verifactu_modo` es el interruptor real: mientras sea distinto de
-- 'verifactu', las facturas españolas siguen por CommercialInvoiceProvider
-- (regla 15 — es preferible decir "todavía no conectado" que aparentar).
alter table orgs add column if not exists verifactu_cert_enc text;
alter table orgs add column if not exists verifactu_cert_pass_enc text;
alter table orgs add column if not exists verifactu_cert_nombre text;
alter table orgs add column if not exists verifactu_cert_caduca date;
alter table orgs add column if not exists verifactu_cert_subido_at timestamptz;
alter table orgs add column if not exists verifactu_modo text not null default 'no_verifactu';
alter table orgs drop constraint if exists chk_orgs_verifactu_modo;
alter table orgs add constraint chk_orgs_verifactu_modo check (verifactu_modo in ('no_verifactu', 'verifactu'));

-- IndicadorMultiplesOT del bloque SistemaInformatico (FAQ de desarrolladores
-- de la AEAT, apartado 4): en un SIF SaaS se calcula POR USUARIO, S si ese
-- usuario lleva más de una facturación en el SaaS. En Cord, el usuario es el
-- DUEÑO de la organización y cada organización con Verifactu activado (o con
-- registros, aunque después lo desactivara) es una facturación. Las otras
-- organizaciones del dueño no son visibles bajo el carril de esta (regla 30):
-- función estrecha que solo responde por la organización en contexto y solo
-- devuelve un booleano.
create or replace function cord_verifactu_multiples_ot(p_org uuid)
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select count(*) > 1
    from orgs o
   where p_org = nullif(current_setting('app.org_id', true), '')::uuid
     and o.owner_id is not null
     and o.owner_id = (select owner_id from orgs where id = p_org)
     and o.sandbox_of is null
     and o.is_demo is not true
     and (o.verifactu_cert_subido_at is not null
          or exists (select 1 from verifactu_registros r where r.org_id = o.id))
$$;
revoke all on function cord_verifactu_multiples_ot(uuid) from public;

-- ── Serie de facturación por identificador fiscal (oct 2026) ────────────────
-- Cada organización numera con su propia secuencia ("F2026-000001"). Dos
-- organizaciones de Cord con el MISMO NIF (dos marcas de una misma sociedad)
-- y la misma serie emitían el mismo número: para la AEAT el IDFactura es NIF +
-- número + fecha, así que la segunda factura chocaba con la primera (3000,
-- duplicado) y, fuera de España, el mismo emisor tenía dos facturas con el
-- mismo número. La numeración correlativa es POR EMISOR, no por organización
-- de Cord. Esta función responde solo eso —¿otra organización con este
-- identificador ya usa esta serie?—, sin devolver datos de la otra, y solo
-- para la organización en contexto (regla 30).
create or replace function cord_serie_en_uso(p_org uuid, p_tax_id text, p_prefix text, p_default_prefix text)
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  with n as (
    select regexp_replace(upper(regexp_replace(coalesce(p_tax_id, ''), '[^A-Za-z0-9]', '', 'g')), '^ES(?=[0-9A-Z]{9}$)', '') as tax,
           upper(coalesce(nullif(trim(p_prefix), ''), p_default_prefix)) as pre,
           (select upper(coalesce(country_code, 'MX')) from orgs where id = p_org) as pais
  )
  select exists (
    select 1
      from orgs o, n
     where p_org = nullif(current_setting('app.org_id', true), '')::uuid
       and length(n.tax) >= 4
       and o.id <> p_org
       and o.sandbox_of is null
       and o.is_demo is not true
       and upper(coalesce(o.country_code, 'MX')) = n.pais
       and regexp_replace(upper(regexp_replace(coalesce(nullif(o.fiscal_metadata->>'tax_id', ''), o.rfc, ''), '[^A-Za-z0-9]', '', 'g')), '^ES(?=[0-9A-Z]{9}$)', '') = n.tax
       and upper(coalesce(nullif(trim(o.fiscal_metadata->>'invoice_prefix'), ''), p_default_prefix)) = n.pre
  )
$$;
revoke all on function cord_serie_en_uso(uuid, text, text, text) from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'cord_app') then
    grant execute on function cord_verifactu_multiples_ot(uuid) to cord_app;
    grant execute on function cord_serie_en_uso(uuid, text, text, text) to cord_app;
    grant select, insert, update on verifactu_envio_estado to cord_app;
  end if;
end
$$;

-- ════════════════════════════════════════════════════════════════════════════
-- Carril de OPS (ago 2026) — lectura cross-org declarada, no heredada
-- ════════════════════════════════════════════════════════════════════════════
-- Cord Ops mira TODAS las organizaciones a propósito: es el panel interno de
-- soporte y operación. Hasta ahora eso funcionaba solo porque el rol de Neon
-- bypasea RLS, así que el privilegio más alto del sistema existía como efecto
-- secundario de la configuración de la base, no como una decisión declarada.
-- Al migrar a `cord_app` (db/cord-app-role.sql) esas pantallas se quedarían en
-- blanco, y "arreglarlo" devolviéndole el bypass al rol tiraría toda la RLS.
--
-- `app.scope='ops'` lo vuelve explícito y ACOTADO. Dos límites deliberados:
--
--   1. La cláusula se agrega SOLO a USING, nunca a WITH CHECK. Eso no significa
--      que Ops sea de solo lectura —revoca llaves, desactiva webhooks y elimina
--      organizaciones, que es su trabajo— sino que Ops actúa sobre filas que YA
--      existen: USING gobierna qué ve y qué puede borrar/desactivar. Donde la
--      política tiene WITH CHECK propio (orgs, org_members, cotizaciones), ese
--      no se amplía, así que Ops no puede INSERTAR ni reescribir contenido
--      comercial dentro de la organización de un cliente.
--   2. Solo lo enciende withOpsTx() (src/lib/db.ts), que exige opsScope en el
--      reqContext — y ese lo marca el middleware ÚNICAMENTE después de validar
--      la sesión de operador con validateOpsSession(). Una sesión de cliente
--      normal no alcanza este carril aunque alguien importe withOpsTx por error.
--
-- Se re-crean las políticas completas (no se "parchan") para que la definición
-- vigente viva en un solo lugar legible.

-- La cláusula de MEMBRESÍA no es cosmética: sin ella, `rls_orgs` solo reconocía
-- al DUEÑO (owner_id), así que un miembro invitado —admin, vendedor, lectura—
-- dejaría de ver su propia organización en cuanto RLS empiece a aplicar. El
-- selector de organizaciones de getUserProfile() (src/lib/queries.ts) se le
-- vaciaría y quedaría sin entrar a ningún espacio de trabajo.
drop policy if exists "rls_orgs" on orgs;
create policy "rls_orgs" on orgs
  using (
    id = nullif(current_setting('app.org_id', true), '')::uuid
    or sandbox_of = nullif(current_setting('app.org_id', true), '')::uuid
    or owner_id = nullif(current_setting('app.user_id', true), '')::uuid
    or exists (
      select 1 from org_members m
       where m.org_id = orgs.id
         and m.user_id = nullif(current_setting('app.user_id', true), '')::uuid
         and m.estado = 'activo'
    )
    or current_setting('app.scope', true) = 'ops'
    or current_setting('app.scope', true) = 'system'
  )
  with check (
    id = nullif(current_setting('app.org_id', true), '')::uuid
    or sandbox_of = nullif(current_setting('app.org_id', true), '')::uuid
    or owner_id = nullif(current_setting('app.user_id', true), '')::uuid
  );

drop policy if exists "rls_org_members" on org_members;
create policy "rls_org_members" on org_members
  using (
    org_id = nullif(current_setting('app.org_id', true), '')::uuid
    or user_id = nullif(current_setting('app.user_id', true), '')::uuid
    or current_setting('app.scope', true) = 'ops'
  )
  with check (
    org_id = nullif(current_setting('app.org_id', true), '')::uuid
    or user_id = nullif(current_setting('app.user_id', true), '')::uuid
  );

-- `app.scope='system'` es el carril de los CRONS cross-org (withSystemTx), el
-- mismo que webhook_events ya usaba para su sweeper. Aquí hace falta en USING y
-- en WITH CHECK porque el cron de vencimiento hace un UPDATE masivo
-- (expirar-cotizaciones.ts): un UPDATE evalúa USING sobre la fila vieja Y
-- WITH CHECK sobre la nueva, así que solo con USING el barrido fallaría.
--
-- Lo enciende únicamente withSystemTx(), que exige cronScope en el reqContext, y
-- ese solo lo marca una ruta /api/cron DESPUÉS de validar CRON_SECRET. El trabajo
-- por cotización de esos crons vuelve a withOrgTx normal — el carril de sistema
-- se limita al barrido que de verdad cruza organizaciones.
drop policy if exists "rls_cotizaciones" on cotizaciones;
create policy "rls_cotizaciones" on cotizaciones
  using (
    org_id = nullif(current_setting('app.org_id', true), '')::uuid
    or current_setting('app.scope', true) = 'ops'
    or current_setting('app.scope', true) = 'system'
  )
  with check (
    org_id = nullif(current_setting('app.org_id', true), '')::uuid
    or current_setting('app.scope', true) = 'system'
  );

drop policy if exists "rls_clientes" on clientes;
create policy "rls_clientes" on clientes
  using (
    org_id = nullif(current_setting('app.org_id', true), '')::uuid
    or current_setting('app.scope', true) = 'ops'
    or current_setting('app.scope', true) = 'system'
  );

drop policy if exists "rls_productos" on productos;
create policy "rls_productos" on productos
  using (
    org_id = nullif(current_setting('app.org_id', true), '')::uuid
    or current_setting('app.scope', true) = 'ops'
  );

drop policy if exists "rls_api_keys" on api_keys;
create policy "rls_api_keys" on api_keys
  using (
    org_id = nullif(current_setting('app.org_id', true), '')::uuid
    or current_setting('app.scope', true) = 'ops'
  );

drop policy if exists "rls_webhooks" on webhooks;
create policy "rls_webhooks" on webhooks
  using (
    org_id = nullif(current_setting('app.org_id', true), '')::uuid
    or current_setting('app.scope', true) = 'ops'
  );

drop policy if exists "rls_sso_connections" on sso_connections;
create policy "rls_sso_connections" on sso_connections
  using (
    org_id = nullif(current_setting('app.org_id', true), '')::uuid
    or current_setting('app.scope', true) = 'ops'
  );

-- Tablas que el carril de SISTEMA (crons cross-org, withSystemTx) necesita leer
-- para armar su barrido. Solo USING: el trabajo por documento vuelve a withOrgTx
-- con el org_id de esa fila, así que la escritura sigue acotada a su organización.
--
--   documentos_fiscales / documento_recordatorios → recordatorios.ts arma la
--     cartera vencida de todas las orgs y calcula qué etapa toca hoy.
--   webhook_deliveries → webhooks-limpieza.ts aplica la retención del outbox.
drop policy if exists "rls_documentos_fiscales" on documentos_fiscales;
create policy "rls_documentos_fiscales" on documentos_fiscales
  using (
    org_id = nullif(current_setting('app.org_id', true), '')::uuid
    or current_setting('app.scope', true) = 'system'
  );

drop policy if exists "rls_documento_recordatorios" on documento_recordatorios;
create policy "rls_documento_recordatorios" on documento_recordatorios
  using (
    org_id = nullif(current_setting('app.org_id', true), '')::uuid
    or current_setting('app.scope', true) = 'system'
  )
  with check (org_id = nullif(current_setting('app.org_id', true), '')::uuid);

drop policy if exists "rls_webhook_deliveries" on webhook_deliveries;
create policy "rls_webhook_deliveries" on webhook_deliveries
  using (
    org_id = nullif(current_setting('app.org_id', true), '')::uuid
    or current_setting('app.scope', true) = 'system'
  );

-- ════════════════════════════════════════════════════════════════════════════
-- Sesiones del transporte MCP legacy (HTTP+SSE) — respaldo durable en Neon
-- ════════════════════════════════════════════════════════════════════════════
-- El transporte legacy abre la sesión con GET /api/mcp/sse y recibe los mensajes
-- por POST /api/mcp/message. En Vercel esas dos peticiones pueden caer en
-- INSTANCIAS DISTINTAS, así que un Map en memoria de proceso hace que la segunda
-- no encuentre la sesión que abrió la primera: `404 session-not-found`
-- intermitente, más frecuente cuanto más tráfico hay.
--
-- Upstash resolvía esto, pero no está provisionado en este proyecto. Neon ya es
-- el estado durable de todo lo demás, así que sirve igual sin sumar proveedor.
--
-- Sin RLS, mismo criterio que `rate_limit_counters`: la fila se llavea por un id
-- de sesión opaco e impredecible, y `/api/mcp/message` además exige Bearer y
-- compara `session.orgId` contra el de la llave autenticada antes de usarla —
-- la sesión no es la credencial, es un puntero.
create table if not exists mcp_sessions (
  id         text        primary key,   -- id de sesión del transporte (opaco)
  data       jsonb       not null,      -- { orgId, scope, keyId }
  expires_at timestamptz not null
);
create index if not exists idx_mcp_sessions_expires on mcp_sessions(expires_at);

-- Cola FIFO de mensajes pendientes de relayar por el stream. `seq` da el orden
-- (bigserial, no timestamp: dos mensajes del mismo milisegundo deben salir en
-- el orden en que entraron).
create table if not exists mcp_session_outbox (
  seq        bigserial   primary key,
  session_id text        not null,
  payload    jsonb       not null,
  expires_at timestamptz not null
);
create index if not exists idx_mcp_outbox_session on mcp_session_outbox(session_id, seq);
create index if not exists idx_mcp_outbox_expires on mcp_session_outbox(expires_at);

-- ════════════════════════════════════════════════════════════════════════════
-- Corpus legal versionado y evidencia de clickwrap (ago 2026)
-- ════════════════════════════════════════════════════════════════════════════
-- Una versión lógica puede tener traducciones y anexos distintos. Por eso el
-- hash vive en la VARIANTE (doc + versión + locale + jurisdicción), no solo en
-- doc + versión. El hash corresponde al <main> legal renderizado y publicado.
create table if not exists legal_documents (
  doc_id             text        not null,
  version            text        not null,
  document_type      text        not null check (document_type in ('terms', 'privacy', 'dpa', 'aup', 'sla', 'annex', 'other')),
  effective_date     date        not null,
  supersedes_version text,
  requires_action    boolean     not null default false,
  required_action    text        not null check (required_action in ('accepted', 'acknowledged', 'none')),
  acceptance_scope   text        not null check (acceptance_scope in ('personal', 'organization', 'none')),
  created_at         timestamptz not null default now(),
  primary key (doc_id, version),
  check (requires_action = (required_action <> 'none')),
  check ((requires_action and acceptance_scope <> 'none') or (not requires_action and acceptance_scope = 'none'))
);

create table if not exists legal_document_variants (
  doc_id           text        not null,
  version          text        not null,
  locale           text        not null check (locale in ('es-MX', 'en-US', 'pt-BR')),
  jurisdiction     text        not null,
  artifact_sha256  text        not null check (artifact_sha256 ~ '^[a-f0-9]{64}$'),
  artifact_route   text        not null check (artifact_route like '/%'),
  source_path      text        not null,
  status           text        not null check (status in ('draft', 'published', 'retired')),
  is_current       boolean     not null default false,
  published_at     timestamptz,
  created_at       timestamptz not null default now(),
  primary key (doc_id, version, locale, jurisdiction),
  unique (doc_id, version, locale, jurisdiction, artifact_sha256),
  foreign key (doc_id, version) references legal_documents(doc_id, version),
  check ((status = 'published' and published_at is not null) or status <> 'published'),
  check (not is_current or status = 'published')
);
create unique index if not exists uq_legal_variant_current
  on legal_document_variants(doc_id, locale, jurisdiction) where is_current;

-- Evidencia append-only a nivel de aplicación. `subject_user_id` no lleva FK a
-- users deliberadamente: una baja de cuenta no debe borrar retroactivamente la
-- prueba contractual. La política de retención/redacción se definirá en la fase
-- de privacidad; no se fija aquí un plazo inventado.
create table if not exists legal_acceptances (
  id                 uuid        primary key default gen_random_uuid(),
  subject_user_id    uuid        not null,
  org_id              uuid,
  doc_id              text        not null,
  version             text        not null,
  locale              text        not null,
  jurisdiction        text        not null,
  artifact_sha256     text        not null,
  action              text        not null check (action in ('accepted', 'acknowledged')),
  acceptance_scope    text        not null check (acceptance_scope in ('personal', 'organization')),
  surface             text        not null check (surface in ('signup_password', 'signup_google', 'signup_apple', 'invitation', 'reacceptance', 'admin')),
  ip                  text        not null,
  user_agent          text        not null,
  accepted_at         timestamptz not null,
  evidence            jsonb       not null default '{}'::jsonb,
  created_at          timestamptz not null default now(),
  foreign key (doc_id, version, locale, jurisdiction, artifact_sha256)
    references legal_document_variants(doc_id, version, locale, jurisdiction, artifact_sha256),
  check ((acceptance_scope = 'personal' and org_id is null) or (acceptance_scope = 'organization' and org_id is not null))
);
create unique index if not exists uq_legal_acceptance_personal
  on legal_acceptances(subject_user_id, doc_id, version, locale, jurisdiction)
  where acceptance_scope = 'personal';
create unique index if not exists uq_legal_acceptance_org
  on legal_acceptances(subject_user_id, org_id, doc_id, version, locale, jurisdiction)
  where acceptance_scope = 'organization';
create index if not exists idx_legal_acceptance_subject
  on legal_acceptances(subject_user_id, accepted_at desc);

-- Intención efímera para OAuth. Guarda un snapshot exacto del bundle visto al
-- pulsar Google/Apple; si una publicación cambia durante el roundtrip, el alta
-- conserva el artefacto que realmente se presentó.
create table if not exists legal_acceptance_intents (
  token_hash    text        primary key check (token_hash ~ '^[a-f0-9]{64}$'),
  locale        text        not null check (locale in ('es-MX', 'en-US')),
  surface       text        not null check (surface in ('signup_google', 'signup_apple')),
  bundle        jsonb       not null,
  ip            text        not null,
  user_agent    text        not null,
  accepted_at   timestamptz not null default now(),
  expires_at    timestamptz not null,
  consumed_at   timestamptz,
  check (expires_at > accepted_at)
);
create index if not exists idx_legal_intents_expires on legal_acceptance_intents(expires_at);

alter table legal_acceptances enable row level security;
alter table legal_acceptances force row level security;
alter table legal_acceptance_intents enable row level security;
alter table legal_acceptance_intents force row level security;

drop policy if exists "rls_legal_acceptances_own" on legal_acceptances;
create policy "rls_legal_acceptances_own" on legal_acceptances for select
  using (subject_user_id = nullif(current_setting('app.user_id', true), '')::uuid);
-- Intents no tienen política: solo las funciones SECURITY DEFINER estrechas
-- pueden crearlas/consumirlas. Acceptances tampoco admite INSERT/UPDATE/DELETE
-- directo bajo cord_app.

insert into legal_documents
  (doc_id, version, document_type, effective_date, supersedes_version, requires_action, required_action, acceptance_scope)
values
  ('terms',   '2026-08-11', 'terms',   '2026-08-11', null, true, 'accepted',     'personal'),
  ('privacy', '2026-08-11', 'privacy', '2026-08-11', null, true, 'acknowledged', 'personal'),
  ('privacy', '2026-08-29', 'privacy', '2026-08-29', '2026-08-11', true, 'acknowledged', 'personal')
on conflict (doc_id, version) do nothing;

-- Publicar una variante nueva nunca reescribe la anterior: solo mueve el
-- puntero de vigencia. Las aceptaciones históricas siguen referenciando el hash
-- exacto de 2026-08-11.
update legal_document_variants
set is_current = false
where doc_id = 'privacy' and version = '2026-08-11' and is_current = true;

insert into legal_document_variants
  (doc_id, version, locale, jurisdiction, artifact_sha256, artifact_route, source_path, status, is_current, published_at)
values
  ('terms', '2026-08-11', 'es-MX', 'GLOBAL', 'caca9992c20c9db7f6270285c57808f9a249d15579a03497b99bc621590db369', '/terminos',       'src/pages/terminos.astro',   'published', true, '2026-08-11T00:00:00Z'),
  ('terms', '2026-08-11', 'en-US', 'GLOBAL', '891f4c861dae2d5fcbf93737cb93e8470582b430c01de4ee33220a5e29c18fd7', '/en/terminos',    'src/pages/terminos.astro',   'published', true, '2026-08-11T00:00:00Z'),
  ('privacy', '2026-08-11', 'es-MX', 'GLOBAL', '5c33c6009707f05f34aa9220f7421402022089f47274095ef3e9d321c8360881', '/privacidad',      'src/pages/privacidad.astro', 'published', false, '2026-08-11T00:00:00Z'),
  ('privacy', '2026-08-11', 'en-US', 'GLOBAL', '4d2674efa18062a57988e415ee0696dc3c89fb2e17ef9de92c0bdcd57159e597', '/en/privacidad',   'src/pages/privacidad.astro', 'published', false, '2026-08-11T00:00:00Z'),
  ('privacy', '2026-08-29', 'es-MX', 'GLOBAL', '469dd0c23ed4626059b8869951d8bf8842cfc7e1dc0122b3c1da4652bae6dbf4', '/privacidad',      'src/pages/privacidad.astro', 'published', true, '2026-08-29T00:00:00Z'),
  ('privacy', '2026-08-29', 'en-US', 'GLOBAL', '4f10b3260909d902e7aaacf2ef40c05a000a4ed4a9154176b19050a3e0b9bb10', '/en/privacidad',   'src/pages/privacidad.astro', 'published', true, '2026-08-29T00:00:00Z')
on conflict (doc_id, version, locale, jurisdiction) do nothing;

-- Versión 2026-09-28 de Términos y Aviso: integraciones, datos de usuario de
-- Google y plazos de derechos. Publicada por decisión explícita de André el
-- 28 sep 2026; obliga a nueva aceptación personal.
insert into legal_documents
  (doc_id, version, document_type, effective_date, supersedes_version, requires_action, required_action, acceptance_scope)
values
  ('terms',   '2026-09-28', 'terms',   '2026-09-28', '2026-08-11', true, 'accepted',     'personal'),
  ('privacy', '2026-09-28', 'privacy', '2026-09-28', '2026-08-29', true, 'acknowledged', 'personal')
on conflict (doc_id, version) do nothing;

update legal_document_variants
set is_current = false
where doc_id in ('terms', 'privacy') and version <> '2026-09-28' and is_current = true;

insert into legal_document_variants
  (doc_id, version, locale, jurisdiction, artifact_sha256, artifact_route, source_path, status, is_current, published_at)
values
  ('terms',   '2026-09-28', 'es-MX', 'GLOBAL', 'c4cb2d15e207a20144620f7e3ab28e698b561ab5e65cbe916938caf8ee265260', '/terminos',      'src/pages/terminos.astro',   'published', true, '2026-09-28T00:00:00Z'),
  ('terms',   '2026-09-28', 'en-US', 'GLOBAL', 'b01410ff26503b98e6dcba483652b1f47cdd65d0f9795977096f544fae439ddb', '/en/terminos',   'src/pages/terminos.astro',   'published', true, '2026-09-28T00:00:00Z'),
  ('privacy', '2026-09-28', 'es-MX', 'GLOBAL', '1d4eed2370b940fb289f254ae24e06078dc522da5e0f0bbb05b067e4d85d70e3', '/privacidad',    'src/pages/privacidad.astro', 'published', true, '2026-09-28T00:00:00Z'),
  ('privacy', '2026-09-28', 'en-US', 'GLOBAL', 'ec1e0d6f448dc1f2f2e125a88ba8d602bc4d4f4ac6260450d46f09ca72afb44d', '/en/privacidad', 'src/pages/privacidad.astro', 'published', true, '2026-09-28T00:00:00Z')
on conflict (doc_id, version, locale, jurisdiction) do nothing;

update legal_document_variants
set is_current = true
where doc_id in ('terms', 'privacy') and version = '2026-09-28' and is_current = false;

create or replace function cord_register_password_user(
  p_user_id uuid,
  p_email text,
  p_first_name text,
  p_last_name text,
  p_password_hash text,
  p_locale text,
  p_terms_accepted boolean,
  p_privacy_acknowledged boolean,
  p_ip text,
  p_user_agent text
) returns uuid
language plpgsql volatile security definer
set search_path = public, pg_temp
as $$
declare
  inserted_acceptances integer;
begin
  if p_user_id is null or p_email is null or p_password_hash is null
     or p_locale not in ('es-MX', 'en-US')
     or p_terms_accepted is distinct from true
     or p_privacy_acknowledged is distinct from true then
    raise exception 'legal_acceptance_required' using errcode = 'P0001';
  end if;

  insert into users (id, email, first_name, last_name, password_hash)
  values (p_user_id, p_email, left(p_first_name, 80), left(p_last_name, 80), p_password_hash);

  insert into legal_acceptances
    (subject_user_id, doc_id, version, locale, jurisdiction, artifact_sha256,
     action, acceptance_scope, surface, ip, user_agent, accepted_at, evidence)
  select p_user_id, v.doc_id, v.version, v.locale, v.jurisdiction, v.artifact_sha256,
         d.required_action, d.acceptance_scope, 'signup_password',
         left(coalesce(nullif(p_ip, ''), 'desconocida'), 128),
         left(coalesce(nullif(p_user_agent, ''), 'desconocido'), 1024),
         now(), jsonb_build_object('bundle_locale', p_locale)
    from legal_document_variants v
    join legal_documents d using (doc_id, version)
   where v.locale = p_locale
     and v.jurisdiction = 'GLOBAL'
     and v.is_current
     and v.status = 'published'
     and v.doc_id in ('terms', 'privacy')
     and d.requires_action;

  get diagnostics inserted_acceptances = row_count;
  if inserted_acceptances <> 2 then
    raise exception 'legal_bundle_unavailable' using errcode = 'P0001';
  end if;
  return p_user_id;
end
$$;

create or replace function cord_create_signup_legal_intent(
  p_token_hash text,
  p_locale text,
  p_surface text,
  p_ip text,
  p_user_agent text
) returns void
language plpgsql volatile security definer
set search_path = public, pg_temp
as $$
declare
  legal_bundle jsonb;
  bundle_size integer;
begin
  if p_token_hash !~ '^[a-f0-9]{64}$'
     or p_locale not in ('es-MX', 'en-US')
     or p_surface not in ('signup_google', 'signup_apple') then
    raise exception 'legal_intent_invalid' using errcode = 'P0001';
  end if;

  -- Limpieza acotada de material efímero. No contiene ids de usuario y un token
  -- vencido jamás puede volver a consumirse.
  delete from legal_acceptance_intents where expires_at < now() - interval '1 day';

  select jsonb_agg(jsonb_build_object(
           'doc_id', v.doc_id,
           'version', v.version,
           'locale', v.locale,
           'jurisdiction', v.jurisdiction,
           'artifact_sha256', v.artifact_sha256,
           'action', d.required_action,
           'acceptance_scope', d.acceptance_scope
         ) order by v.doc_id), count(*)
    into legal_bundle, bundle_size
    from legal_document_variants v
    join legal_documents d using (doc_id, version)
   where v.locale = p_locale
     and v.jurisdiction = 'GLOBAL'
     and v.is_current
     and v.status = 'published'
     and v.doc_id in ('terms', 'privacy')
     and d.requires_action;

  if bundle_size <> 2 then
    raise exception 'legal_bundle_unavailable' using errcode = 'P0001';
  end if;

  insert into legal_acceptance_intents
    (token_hash, locale, surface, bundle, ip, user_agent, accepted_at, expires_at)
  values (
    p_token_hash, p_locale, p_surface, legal_bundle,
    left(coalesce(nullif(p_ip, ''), 'desconocida'), 128),
    left(coalesce(nullif(p_user_agent, ''), 'desconocido'), 1024),
    now(), now() + interval '15 minutes'
  );
end
$$;

create or replace function cord_user_needs_legal_acceptance(p_user_id uuid, p_locale text)
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select p_user_id is null or exists (
    select 1
      from legal_document_variants required
      join legal_documents d using (doc_id, version)
     where required.locale = p_locale
       and required.jurisdiction = 'GLOBAL'
       and required.is_current
       and required.status = 'published'
       and d.requires_action
       and not exists (
         select 1
           from legal_acceptances accepted
          where accepted.subject_user_id = p_user_id
            and accepted.doc_id = required.doc_id
            and accepted.version = required.version
            and accepted.jurisdiction = required.jurisdiction
            and accepted.action = d.required_action
       )
  )
$$;

create or replace function cord_accept_current_legal_bundle(
  p_user_id uuid,
  p_locale text,
  p_terms_accepted boolean,
  p_privacy_acknowledged boolean,
  p_ip text,
  p_user_agent text
) returns void
language plpgsql volatile security definer
set search_path = public, pg_temp
as $$
begin
  if p_user_id is null
     or p_locale not in ('es-MX', 'en-US')
     or p_terms_accepted is distinct from true
     or p_privacy_acknowledged is distinct from true then
    raise exception 'legal_acceptance_required' using errcode = 'P0001';
  end if;

  insert into legal_acceptances
    (subject_user_id, doc_id, version, locale, jurisdiction, artifact_sha256,
     action, acceptance_scope, surface, ip, user_agent, accepted_at, evidence)
  select p_user_id, v.doc_id, v.version, v.locale, v.jurisdiction, v.artifact_sha256,
         d.required_action, d.acceptance_scope, 'reacceptance',
         left(coalesce(nullif(p_ip, ''), 'desconocida'), 128),
         left(coalesce(nullif(p_user_agent, ''), 'desconocido'), 1024),
         now(), jsonb_build_object('bundle_locale', p_locale)
    from legal_document_variants v
    join legal_documents d using (doc_id, version)
   where v.locale = p_locale
     and v.jurisdiction = 'GLOBAL'
     and v.is_current
     and v.status = 'published'
     and v.doc_id in ('terms', 'privacy')
     and d.requires_action
  on conflict (subject_user_id, doc_id, version, locale, jurisdiction)
    where acceptance_scope = 'personal'
  do nothing;

  if cord_user_needs_legal_acceptance(p_user_id, p_locale) then
    raise exception 'legal_bundle_unavailable' using errcode = 'P0001';
  end if;
end
$$;

create or replace function cord_register_oauth_user_with_legal_intent(
  p_user_id uuid,
  p_email text,
  p_first_name text,
  p_last_name text,
  p_avatar_url text,
  p_provider text,
  p_provider_user_id text,
  p_intent_hash text
) returns uuid
language plpgsql volatile security definer
set search_path = public, pg_temp
as $$
declare
  intent legal_acceptance_intents%rowtype;
  inserted_acceptances integer;
begin
  if p_provider not in ('google', 'apple') or p_user_id is null or p_email is null then
    raise exception 'legal_intent_invalid' using errcode = 'P0001';
  end if;

  select * into intent
    from legal_acceptance_intents
   where token_hash = p_intent_hash
     and surface = ('signup_' || p_provider)
     and consumed_at is null
     and expires_at > now()
   for update;

  if not found then
    raise exception 'legal_intent_invalid' using errcode = 'P0001';
  end if;

  insert into users (id, email, first_name, last_name, avatar_url, email_verified_at)
  values (p_user_id, p_email, left(p_first_name, 80), left(p_last_name, 80), p_avatar_url, now());

  insert into oauth_accounts (user_id, provider, provider_user_id, email)
  values (p_user_id, p_provider, p_provider_user_id, p_email);

  insert into legal_acceptances
    (subject_user_id, doc_id, version, locale, jurisdiction, artifact_sha256,
     action, acceptance_scope, surface, ip, user_agent, accepted_at, evidence)
  select p_user_id, b.doc_id, b.version, b.locale, b.jurisdiction, b.artifact_sha256,
         b.action, b.acceptance_scope, intent.surface, intent.ip, intent.user_agent,
         intent.accepted_at, jsonb_build_object('bundle_locale', intent.locale, 'intent', true)
    from jsonb_to_recordset(intent.bundle) as b(
      doc_id text, version text, locale text, jurisdiction text, artifact_sha256 text,
      action text, acceptance_scope text
    );

  get diagnostics inserted_acceptances = row_count;
  if inserted_acceptances <> 2 then
    raise exception 'legal_bundle_unavailable' using errcode = 'P0001';
  end if;

  update legal_acceptance_intents set consumed_at = now() where token_hash = p_intent_hash;
  return p_user_id;
end
$$;

revoke all on function cord_register_password_user(uuid, text, text, text, text, text, boolean, boolean, text, text) from public;
revoke all on function cord_create_signup_legal_intent(text, text, text, text, text) from public;
revoke all on function cord_register_oauth_user_with_legal_intent(uuid, text, text, text, text, text, text, text) from public;
revoke all on function cord_user_needs_legal_acceptance(uuid, text) from public;
revoke all on function cord_accept_current_legal_bundle(uuid, text, boolean, boolean, text, text) from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'cord_app') then
    grant execute on function cord_register_password_user(uuid, text, text, text, text, text, boolean, boolean, text, text) to cord_app;
    grant execute on function cord_create_signup_legal_intent(text, text, text, text, text) to cord_app;
    grant execute on function cord_register_oauth_user_with_legal_intent(uuid, text, text, text, text, text, text, text) to cord_app;
    grant execute on function cord_user_needs_legal_acceptance(uuid, text) to cord_app;
    grant execute on function cord_accept_current_legal_bundle(uuid, text, boolean, boolean, text, text) to cord_app;
  end if;
end
$$;

-- ════════════════════════════════════════════════════════════════════════════
-- Baja de cuenta (ago 2026) — carril propio, porque no cabe en ningún otro
-- ════════════════════════════════════════════════════════════════════════════
-- Borrar una cuenta cruza TODAS las organizaciones del usuario y además tiene
-- que ver a los OTROS miembros para decidir si una organización queda huérfana.
-- Bajo `withUserTx` la política de org_members solo deja ver las filas del
-- propio usuario, así que el `exists(... m2.user_id <> p_user)` daría SIEMPRE
-- falso: toda organización se clasificaría como "de dueño único" y se borraría
-- junto con la cuenta. Es la peor forma posible de romperse — silenciosa y
-- destructiva— y por eso este flujo no se envolvió a ciegas.
--
-- La propiedad y la orfandad se definen UNA sola vez, en la misma función: si
-- vivieran en dos consultas separadas podrían divergir, y una divergencia aquí
-- borra datos de un cliente.
create or replace function cord_account_owned_orgs(p_user uuid)
returns table(
  id                     uuid,
  nombre                 text,
  stripe_subscription_id text,
  stripe_account_id      text,
  tiene_otros_miembros   boolean
)
language sql stable security definer
set search_path = public, pg_temp
as $$
  select o.id, o.nombre, o.stripe_subscription_id, o.stripe_account_id,
         exists (
           select 1 from org_members m2
            where m2.org_id = o.id
              and m2.estado = 'activo'
              and m2.user_id <> p_user
         ) as tiene_otros_miembros
    from orgs o
    left join org_members m
           on m.org_id = o.id and m.user_id = p_user and m.estado = 'activo'
   where p_user is not null
     and (o.owner_id = p_user or m.rol = 'owner')
     and o.sandbox_of is null
$$;

-- Sustituye el id del usuario por una lápida en las columnas de TEXTO que lo
-- referencian sin llave foránea. Son cross-org por naturaleza: un vendedor pudo
-- crear cotizaciones en varias organizaciones. Sin esto, al activar cord_app el
-- scrub afectaría cero filas y el id de una cuenta borrada seguiría dentro de
-- los registros.
create or replace function cord_account_scrub(p_user uuid, p_tombstone text)
returns void
language plpgsql volatile security definer
set search_path = public, pg_temp
as $$
begin
  if p_user is null or p_tombstone is null or p_tombstone = '' then
    return;
  end if;
  update cotizaciones set creado_por = p_tombstone where creado_por = p_user::text;
  update audit_log     set actor      = p_tombstone where actor      = p_user::text;
  update api_keys      set created_by = p_tombstone where created_by = p_user::text;
  update org_members   set invited_by = p_tombstone where invited_by = p_user::text;
end;
$$;

revoke all on function cord_account_owned_orgs(uuid) from public;
revoke all on function cord_account_scrub(uuid, text) from public;

-- ════════════════════════════════════════════════════════════════════════════
-- Invitaciones de equipo (ago 2026) — el token resuelve identidad, no da acceso
-- ════════════════════════════════════════════════════════════════════════════
-- Aceptar una invitación es, por definición, algo que ocurre ANTES de tener
-- membresía: no hay `app.org_id` que setear ni fila propia en org_members que la
-- política de usuario deje ver. Mismo patrón que el link público de cotización
-- (`cord_resolve_public_quote`): una función estrecha traduce el hash del token
-- a la fila mínima, y el llamador vuelve a withOrgTx con el org_id resuelto.
--
-- El token del link viaja crudo; en la base solo vive su sha256 (ver equipo.ts),
-- así que la función recibe YA el hash — nunca el valor que viajó por correo.
create or replace function cord_resolve_invitation(p_token_hash text)
returns table(
  id               uuid,
  org_id           uuid,
  org_nombre       text,
  user_id          uuid,
  estado           text,
  email            text,
  rol              text,
  token_expires_at timestamptz
)
language sql stable security definer
set search_path = public, pg_temp
as $$
  select m.id, m.org_id, o.nombre, m.user_id, m.estado, m.email, m.rol, m.token_expires_at
    from org_members m
    join orgs o on o.id = m.org_id
   where p_token_hash is not null and p_token_hash <> ''
     and m.token = p_token_hash
   limit 1
$$;

revoke all on function cord_resolve_invitation(text) from public;

-- ════════════════════════════════════════════════════════════════════════════
-- SSO / SAML (ago 2026) — tres puertas de entrada, todo lo demás por su org
-- ════════════════════════════════════════════════════════════════════════════
-- El login por SSO ocurre entero ANTES de que exista sesión: quien llega no
-- tiene `app.user_id` ni `app.org_id`, y el único dato que trae es un id de
-- conexión que viaja en una URL pública, o el dominio de su correo. Por eso las
-- tres puertas se resuelven con funciones estrechas y el resto del flujo
-- —membresía, roles, aprovisionamiento— vuelve a withOrgTx con el org_id que
-- esas funciones devolvieron. El id de conexión identifica; no autoriza.
--
-- El filtro por plan se conserva DENTRO de la función, donde ya estaba: una URL
-- de SSO guardada sigue sin servir después de un downgrade.
create or replace function cord_resolve_sso_connection(p_id uuid)
returns setof sso_connections
language sql stable security definer
set search_path = public, pg_temp
as $$
  select c.*
    from sso_connections c
   where p_id is not null
     and c.id = p_id
     and cord_effective_plan(c.org_id) in ('scale', 'developer')
   limit 1
$$;

-- Descubrimiento por dominio de correo, en la pantalla de entrada: dice si ese
-- dominio tiene SSO y a qué conexión mandar. Devuelve lo mínimo que la pantalla
-- necesita — nunca la configuración de la conexión ni datos de la organización.
create or replace function cord_resolve_sso_domain(p_domain text)
returns table(connection_id uuid, org_nombre text, require_sso boolean)
language sql stable security definer
set search_path = public, pg_temp
as $$
  select d.connection_id, o.nombre, o.require_sso
    from sso_domains d
    join sso_connections c on c.id = d.connection_id
    join orgs o on o.id = c.org_id
   where p_domain is not null and p_domain <> ''
     and d.domain = p_domain
     and d.verified_at is not null
     and c.enabled = true
     and cord_effective_plan(o.id) in ('scale', 'developer')
   limit 1
$$;

-- Deja constancia de un fallo de validación en la conexión. Corre en el `catch`
-- del ACS, donde puede no haberse llegado a resolver la organización — y el
-- admin necesita ver ese error en Ajustes › SSO justamente cuando el login
-- falla. No devuelve nada: no es un canal de lectura.
create or replace function cord_sso_record_error(p_id uuid, p_slug text)
returns void
language sql volatile security definer
set search_path = public, pg_temp
as $$
  update sso_connections
     set last_error = left(coalesce(p_slug, 'validacion'), 200), last_error_at = now()
   where p_id is not null and id = p_id
$$;

revoke all on function cord_resolve_sso_connection(uuid) from public;
revoke all on function cord_resolve_sso_domain(text) from public;
revoke all on function cord_sso_record_error(uuid, text) from public;

-- ¿Este usuario está obligado a entrar por SSO? Se pregunta MIENTRAS intenta
-- entrar por otro método, así que tampoco hay sesión todavía.
--
-- Va como función y no ampliando `rls_sso_connections` a propósito: esa tabla
-- guarda la configuración del proveedor de identidad (certificados incluidos), y
-- para responder esta pregunta basta con el id de la conexión. Ampliar la
-- política habría dejado la fila entera visible a cualquier miembro.
create or replace function cord_sso_requirement_for(p_user uuid)
returns table(org_id uuid, nombre text, owner_id uuid, sso_breakglass_until timestamptz, connection_id uuid)
language sql stable security definer
set search_path = public, pg_temp
as $$
  select o.id, o.nombre, o.owner_id, o.sso_breakglass_until, c.id
    from org_members m
    join orgs o on o.id = m.org_id
                and o.sandbox_of is null
                and o.require_sso = true
                and cord_effective_plan(o.id) in ('scale', 'developer')
    left join sso_connections c on c.org_id = o.id and c.enabled = true
   where p_user is not null and m.user_id = p_user and m.estado = 'activo'
   order by c.created_at asc
   limit 1
$$;

revoke all on function cord_sso_requirement_for(uuid) from public;

-- ════════════════════════════════════════════════════════════════════════════
-- Correo entrante (ago 2026) — emparejar la respuesta con su cotización
-- ════════════════════════════════════════════════════════════════════════════
-- El proveedor de correo entrega un mensaje sin saber a qué organización
-- pertenece: eso es justo lo que hay que averiguar. La búsqueda es cross-org por
-- necesidad, así que va en una función estrecha y el resto del manejo vuelve a
-- withOrgTx con el org_id resuelto.
--
-- Las dos estrategias viven aquí juntas y con prioridad explícita: primero el
-- threading real (el message_id del correo que Cord envió), y solo si no hay con
-- qué emparejar, la cotización vencida más antigua de ese remitente. Separarlas
-- en dos consultas dejaba el orden implícito en el código que las llamaba.
create or replace function cord_resolve_inbound_email(p_in_reply_to text, p_from text)
returns table(cotizacion_id uuid, org_id uuid, via text)
language sql stable security definer
set search_path = public, pg_temp
as $$
  with por_hilo as (
    select c.id as cotizacion_id, c.org_id as org_id, 'hilo'::text as via, 1 as prioridad
      from cobranza_conversaciones cc
      join cotizaciones c on c.id = cc.cotizacion_id
     where p_in_reply_to is not null and p_in_reply_to <> ''
       and cc.message_id is not null
       and p_in_reply_to like '%' || cc.message_id || '%'
     order by cc.created_at desc
     limit 1
  ),
  por_remitente as (
    select c.id as cotizacion_id, c.org_id as org_id, 'remitente'::text as via, 2 as prioridad
      from cotizaciones c
      join clientes cl on c.cliente_id = cl.id
     where p_from is not null and p_from <> ''
       and cl.email = p_from
       and c.status in ('approved', 'invoiced')
       and c.paid_at is null
       and c.es_recurrente is not true
     order by coalesce(c.approved_at, c.created_at) asc
     limit 1
  )
  select t.cotizacion_id, t.org_id, t.via
    from (select * from por_hilo union all select * from por_remitente) t
   order by t.prioridad
   limit 1
$$;

revoke all on function cord_resolve_inbound_email(text, text) from public;

-- BEGIN domain-events
create table if not exists domain_events (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references orgs(id) on delete cascade,
  type        text not null check (type ~ '^[a-z_]+\.[a-z_]+$'),
  object      text not null,
  object_id   uuid,
  data        jsonb not null default '{}'::jsonb,
  actor       text not null,
  caused_by   uuid references domain_events(id) on delete set null,
  depth       smallint not null default 0 check (depth between 0 and 10),
  created_at  timestamptz not null default now()
);
create index if not exists idx_domain_events_org_created on domain_events(org_id, created_at desc, id desc);
create index if not exists idx_domain_events_org_object on domain_events(org_id, object, object_id, created_at desc);

create or replace function domain_events_append_only() returns trigger
language plpgsql as $$
begin
  raise exception 'domain_events es append-only';
end $$;
drop trigger if exists trg_domain_events_append_only on domain_events;
create trigger trg_domain_events_append_only before update on domain_events
  for each row execute function domain_events_append_only();

alter table domain_events enable row level security;
alter table domain_events force row level security;
drop policy if exists rls_domain_events on domain_events;
create policy rls_domain_events on domain_events
  using (org_id = nullif(current_setting('app.org_id', true), '')::uuid)
  with check (org_id = nullif(current_setting('app.org_id', true), '')::uuid);

do $$ begin
  if exists (select 1 from pg_roles where rolname = 'cord_app') then
    grant select, insert, delete on domain_events to cord_app;
  end if;
end $$;
-- END domain-events

-- BEGIN api-idempotency
create table if not exists api_idempotency (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references orgs(id) on delete cascade,
  key_id           uuid not null references api_keys(id) on delete cascade,
  idempotency_key  text not null check (length(idempotency_key) between 1 and 255),
  method           text not null,
  path             text not null,
  request_hash     text not null check (request_hash ~ '^[0-9a-f]{64}$'),
  status           int,
  response_body    text,
  created_at       timestamptz not null default now(),
  completed_at     timestamptz,
  unique (key_id, idempotency_key)
);
create index if not exists idx_api_idempotency_created on api_idempotency(created_at);

alter table api_idempotency enable row level security;
alter table api_idempotency force row level security;
drop policy if exists rls_api_idempotency on api_idempotency;
create policy rls_api_idempotency on api_idempotency
  using (org_id = nullif(current_setting('app.org_id', true), '')::uuid)
  with check (org_id = nullif(current_setting('app.org_id', true), '')::uuid);

do $$ begin
  if exists (select 1 from pg_roles where rolname = 'cord_app') then
    grant select, insert, update, delete on api_idempotency to cord_app;
  end if;
end $$;
-- END api-idempotency

-- BEGIN webhooks-api-owner
alter table webhooks add column if not exists created_by_key uuid references api_keys(id) on delete set null;
create index if not exists idx_webhooks_org_key on webhooks(org_id, created_by_key) where created_by_key is not null;
-- END webhooks-api-owner

-- BEGIN workflows-tables
create unique index if not exists uq_domain_events_org_id_id on domain_events(org_id, id);

create table if not exists workflows (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null references orgs(id) on delete cascade,
  nombre             text not null check (length(nombre) between 1 and 120),
  estado             text not null default 'draft' check (estado in ('draft', 'active', 'paused')),
  definicion         jsonb not null default '{"trigger": null, "steps": []}'::jsonb,
  publicado          jsonb,
  trigger_publicado  text check (trigger_publicado is null or trigger_publicado ~ '^[a-z_]+\.[a-z_]+$'),
  version            int not null default 0 check (version >= 0),
  created_by         uuid references users(id) on delete set null,
  updated_by         uuid references users(id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  published_at       timestamptz,
  check (estado = 'draft' or (publicado is not null and trigger_publicado is not null)),
  unique (org_id, id)
);
create index if not exists idx_workflows_org on workflows(org_id, updated_at desc);
create index if not exists idx_workflows_trigger on workflows(org_id, trigger_publicado) where estado = 'active';
-- Disparador programado: cuándo toca el siguiente tic. Lo avanza el cron ANTES
-- de emitir el evento, nunca después (regla 25).
alter table workflows add column if not exists next_run_at timestamptz;
create index if not exists idx_workflows_programados on workflows(next_run_at)
  where estado = 'active' and next_run_at is not null;

create table if not exists workflow_runs (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references orgs(id) on delete cascade,
  workflow_id   uuid not null,
  version       int not null check (version >= 0),
  publicado     jsonb not null,
  event_id      uuid not null,
  depth         smallint not null default 0 check (depth between 0 and 10),
  status        text not null default 'queued' check (status in ('queued', 'running', 'waiting', 'succeeded', 'failed', 'canceled')),
  run_at        timestamptz not null default now(),
  locked_until  timestamptz,
  attempts      int not null default 0 check (attempts >= 0),
  cursor        jsonb not null default '[]'::jsonb,
  -- Valores producidos por la propia ejecución (consultas, esperas condicionadas).
  datos         jsonb not null default '{}'::jsonb,
  log           jsonb not null default '[]'::jsonb,
  error         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  finished_at   timestamptz,
  unique (workflow_id, event_id),
  foreign key (org_id, workflow_id) references workflows(org_id, id) on delete cascade,
  foreign key (org_id, event_id) references domain_events(org_id, id) on delete cascade
);
-- La columna va también como `alter` porque `create table if not exists` no
-- toca una tabla que ya existe: sin esto, una base viva se queda sin ella.
alter table workflow_runs add column if not exists datos jsonb not null default '{}'::jsonb;
create index if not exists idx_workflow_runs_due on workflow_runs(org_id, run_at) where status in ('queued', 'waiting', 'running');
create index if not exists idx_workflow_runs_workflow on workflow_runs(org_id, workflow_id, created_at desc, id desc);
create index if not exists idx_workflow_runs_event on workflow_runs(org_id, event_id);

alter table workflows enable row level security;
alter table workflows force row level security;
drop policy if exists rls_workflows on workflows;
create policy rls_workflows on workflows
  using (org_id = nullif(current_setting('app.org_id', true), '')::uuid)
  with check (org_id = nullif(current_setting('app.org_id', true), '')::uuid);

alter table workflow_runs enable row level security;
alter table workflow_runs force row level security;
drop policy if exists rls_workflow_runs on workflow_runs;
create policy rls_workflow_runs on workflow_runs
  using (org_id = nullif(current_setting('app.org_id', true), '')::uuid)
  with check (org_id = nullif(current_setting('app.org_id', true), '')::uuid);
drop policy if exists system_workflow_runs on workflow_runs;
create policy system_workflow_runs on workflow_runs for select
  using (current_setting('app.scope', true) = 'system');

drop trigger if exists trg_limit_workflows on workflows;
create trigger trg_limit_workflows before insert or update of estado on workflows
  for each row execute function cord_enforce_resource_limit();

do $$ begin
  if exists (select 1 from pg_roles where rolname = 'cord_app') then
    grant select, insert, update, delete on workflows to cord_app;
    grant select, insert, update, delete on workflow_runs to cord_app;
  end if;
end $$;
-- END workflows-tables

-- Integraciones con CRMs (HubSpot): conexiones OAuth, vínculos de ids y cola de sincronización.

create table if not exists integracion_conexiones (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null references orgs(id) on delete cascade,
  proveedor          text not null check (proveedor in ('hubspot', 'shopify')),
  estado             text not null default 'activa' check (estado in ('activa', 'error', 'desconectada')),
  -- HubSpot identifica la cuenta con un número; Shopify con el dominio de la tienda.
  cuenta_externa     text not null check (cuenta_externa ~ '^[0-9]{1,20}$' or cuenta_externa ~ '^[a-z0-9][a-z0-9-]{0,59}\.myshopify\.com$'),
  cuenta_nombre      text check (cuenta_nombre is null or length(cuenta_nombre) <= 200),
  scopes             text[] not null default '{}',
  access_token_enc   text,
  access_expires_at  timestamptz,
  refresh_token_enc  text,
  ajustes            jsonb not null default '{}'::jsonb,
  ultimo_error       text check (ultimo_error is null or length(ultimo_error) <= 500),
  ultimo_error_at    timestamptz,
  ultima_sync_at     timestamptz,
  conectada_por      uuid references users(id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  check (estado = 'desconectada' or refresh_token_enc is not null),
  check (estado <> 'desconectada' or (refresh_token_enc is null and access_token_enc is null)),
  unique (org_id, proveedor),
  unique (org_id, id)
);
create unique index if not exists uq_integracion_cuenta_activa
  on integracion_conexiones(proveedor, cuenta_externa) where estado <> 'desconectada';

create table if not exists integracion_oauth_estados (
  state_hash  text primary key check (state_hash ~ '^[a-f0-9]{64}$'),
  org_id      uuid not null references orgs(id) on delete cascade,
  user_id     uuid not null references users(id) on delete cascade,
  proveedor   text not null check (proveedor in ('hubspot', 'mercadopago', 'slack', 'teams')),
  expires_at  timestamptz not null,
  used_at     timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists idx_integracion_oauth_estados_exp on integracion_oauth_estados(expires_at);

-- La lista de proveedores NO se repite aquí: vive una sola vez, al final del
-- bloque de integraciones. Tenerla dos veces significaba que este ALTER volvía a
-- imponer la lista vieja en cada migración, y bastaba una fila de un proveedor
-- nuevo —una autorización de Excel a medias -- para que `db:migrate` fallara
-- entero antes de llegar a la lista buena.

create table if not exists integracion_vinculos (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null,
  conexion_id      uuid not null,
  objeto           text not null check (objeto in ('client', 'client_contact', 'quote', 'product')),
  local_id         uuid not null,
  externo_tipo     text not null check (externo_tipo in ('company', 'contact', 'deal', 'shopify_product', 'shopify_customer', 'shopify_draft_order', 'shopify_order')),
  -- Numérico (HubSpot, Shopify, QuickBooks) o UUID (Xero). Estricto a propósito:
  -- con este valor se arman rutas hacia el proveedor. La forma vigente se
  -- redefine al final del bloque de integraciones, igual que las demás listas.
  externo_id       text not null check (externo_id ~ '^[0-9]{1,20}$'),
  huella           text check (huella is null or huella ~ '^[a-f0-9]{64}$'),
  sincronizado_at  timestamptz,
  created_at       timestamptz not null default now(),
  unique (conexion_id, objeto, local_id),
  unique (conexion_id, externo_tipo, externo_id),
  foreign key (org_id, conexion_id) references integracion_conexiones(org_id, id) on delete cascade
);
create index if not exists idx_integracion_vinculos_local on integracion_vinculos(org_id, objeto, local_id);

create table if not exists integracion_sync (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null,
  conexion_id   uuid not null,
  direccion     text not null check (direccion in ('salida', 'entrada')),
  objeto        text not null check (objeto in ('client', 'quote', 'company', 'contact')),
  clave         text not null check (clave ~ '^[0-9a-f-]{1,36}$'),
  status        text not null default 'queued' check (status in ('queued', 'running', 'succeeded', 'failed')),
  attempts      int not null default 0 check (attempts >= 0),
  run_at        timestamptz not null default now(),
  locked_until  timestamptz,
  error         text check (error is null or length(error) <= 500),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  finished_at   timestamptz,
  foreign key (org_id, conexion_id) references integracion_conexiones(org_id, id) on delete cascade
);
create unique index if not exists uq_integracion_sync_pendiente
  on integracion_sync(conexion_id, direccion, objeto, clave) where status = 'queued';
create index if not exists idx_integracion_sync_due on integracion_sync(org_id, run_at) where status in ('queued', 'running');
create index if not exists idx_integracion_sync_fin on integracion_sync(finished_at) where status in ('succeeded', 'failed');

alter table integracion_conexiones enable row level security;
alter table integracion_conexiones force row level security;
drop policy if exists rls_integracion_conexiones on integracion_conexiones;
create policy rls_integracion_conexiones on integracion_conexiones
  using (org_id = nullif(current_setting('app.org_id', true), '')::uuid)
  with check (org_id = nullif(current_setting('app.org_id', true), '')::uuid);

alter table integracion_oauth_estados enable row level security;
alter table integracion_oauth_estados force row level security;
drop policy if exists rls_integracion_oauth_estados on integracion_oauth_estados;
create policy rls_integracion_oauth_estados on integracion_oauth_estados
  using (org_id = nullif(current_setting('app.org_id', true), '')::uuid)
  with check (org_id = nullif(current_setting('app.org_id', true), '')::uuid);

alter table integracion_vinculos enable row level security;
alter table integracion_vinculos force row level security;
drop policy if exists rls_integracion_vinculos on integracion_vinculos;
create policy rls_integracion_vinculos on integracion_vinculos
  using (org_id = nullif(current_setting('app.org_id', true), '')::uuid)
  with check (org_id = nullif(current_setting('app.org_id', true), '')::uuid);

alter table integracion_sync enable row level security;
alter table integracion_sync force row level security;
drop policy if exists rls_integracion_sync on integracion_sync;
create policy rls_integracion_sync on integracion_sync
  using (org_id = nullif(current_setting('app.org_id', true), '')::uuid)
  with check (org_id = nullif(current_setting('app.org_id', true), '')::uuid);
drop policy if exists system_integracion_sync on integracion_sync;
create policy system_integracion_sync on integracion_sync for select
  using (current_setting('app.scope', true) = 'system');

create or replace function cord_resolve_integracion(p_proveedor text, p_cuenta text)
returns table(org_id uuid, conexion_id uuid)
language sql stable security definer
set search_path = public, pg_temp
as $$
  select c.org_id, c.id from integracion_conexiones c
   where p_proveedor is not null and p_cuenta is not null
     and c.proveedor = p_proveedor and c.cuenta_externa = p_cuenta and c.estado <> 'desconectada'
   limit 1
$$;
revoke all on function cord_resolve_integracion(text, text) from public;

do $$ begin
  if exists (select 1 from pg_roles where rolname = 'cord_app') then
    grant select, insert, update, delete on integracion_conexiones to cord_app;
    grant select, insert, update, delete on integracion_oauth_estados to cord_app;
    grant select, insert, update, delete on integracion_vinculos to cord_app;
    grant select, insert, update, delete on integracion_sync to cord_app;
    grant execute on function cord_resolve_integracion(text, text) to cord_app;
  end if;
end $$;
-- Vocabulario de las integraciones. Cada lista vive UNA sola vez: antes cada
-- migración dejaba aquí su propia versión, y como `schema.sql` se corre entero
-- en cada despliegue, las viejas volvían a imponer su lista corta. Bastó una
-- autorización de Excel a medias en producción para que `npm run db:migrate`
-- fallara completo antes de llegar a la lista buena. Al agregar un proveedor o
-- un tipo nuevo se EDITA lo de abajo, no se añade otro bloque.
alter table integracion_conexiones drop constraint if exists integracion_conexiones_proveedor_check;
alter table integracion_conexiones add constraint integracion_conexiones_proveedor_check
  check (proveedor in ('hubspot', 'shopify', 'google_sheets', 'excel', 'quickbooks', 'xero', 'gmail', 'slack'));
alter table integracion_conexiones drop constraint if exists integracion_conexiones_cuenta_externa_check;
alter table integracion_conexiones add constraint integracion_conexiones_cuenta_externa_check
  check (
    cuenta_externa ~ '^[0-9]{1,20}$'
    or cuenta_externa ~ '^[a-z0-9][a-z0-9-]{0,59}\.myshopify\.com$'
    or cuenta_externa ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    or (cuenta_externa ~ '^[^@[:space:]]{1,128}@[^@[:space:]]{1,127}$' and length(cuenta_externa) <= 254)
    or cuenta_externa ~ '^T[A-Z0-9]{6,20}$'
  );

alter table integracion_oauth_estados drop constraint if exists integracion_oauth_estados_proveedor_check;
alter table integracion_oauth_estados add constraint integracion_oauth_estados_proveedor_check
  check (proveedor in ('hubspot', 'mercadopago', 'slack', 'teams', 'shopify',
                       'google_sheets', 'excel', 'quickbooks', 'xero', 'gmail'));

alter table integracion_vinculos drop constraint if exists integracion_vinculos_objeto_check;
alter table integracion_vinculos add constraint integracion_vinculos_objeto_check
  check (objeto in ('client', 'client_contact', 'quote', 'product', 'invoice', 'payment'));
alter table integracion_vinculos drop constraint if exists integracion_vinculos_externo_tipo_check;
alter table integracion_vinculos add constraint integracion_vinculos_externo_tipo_check
  check (externo_tipo in ('company', 'contact', 'deal',
                          'shopify_product', 'shopify_customer', 'shopify_draft_order', 'shopify_order',
                          'qbo_customer', 'qbo_invoice', 'qbo_payment', 'xero_contact', 'xero_invoice', 'xero_payment'));

-- El id externo no siempre es numérico: Xero usa UUID. Con la forma original
-- —solo dígitos— el vínculo no se guardaba, la factura quedaba creada del lado
-- del proveedor y Cord sin memoria de ella, que es el camino directo a
-- contabilizar la misma factura dos veces.
alter table integracion_vinculos drop constraint if exists integracion_vinculos_externo_id_check;
alter table integracion_vinculos add constraint integracion_vinculos_externo_id_check
  check (
    externo_id ~ '^[0-9]{1,20}$'
    or externo_id ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
  );

-- El token de Shopify es "offline": no vence y no hay refresh que guardar. La
-- condición original era de HubSpot, donde el refresh ES la credencial viva.
alter table integracion_conexiones drop constraint if exists integracion_conexiones_check;
alter table integracion_conexiones drop constraint if exists integracion_conexiones_credencial_viva_check;
alter table integracion_conexiones add constraint integracion_conexiones_credencial_viva_check
  check (estado = 'desconectada' or proveedor = 'shopify' or refresh_token_enc is not null);
alter table integracion_conexiones drop constraint if exists integracion_conexiones_credencial_activa_check;
alter table integracion_conexiones add constraint integracion_conexiones_credencial_activa_check
  check (estado <> 'desconectada' or (refresh_token_enc is null and access_token_enc is null));
alter table integracion_conexiones drop constraint if exists integracion_conexiones_check1;

-- END integraciones-tables

-- BEGIN oauth-provider
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

-- END oauth-provider

-- Conciliación de facturas: pagos brutos, notas emitidas y devoluciones efectivas.
-- amount_paid conserva los cobros históricos; un crédito fiscal no es dinero recibido.
alter table documentos_fiscales add column if not exists amount_credited numeric not null default 0;
alter table documentos_fiscales add column if not exists amount_refunded numeric not null default 0;
alter table documentos_fiscales add column if not exists refund_due numeric not null default 0;
create index if not exists idx_documentos_credit_note_parent
  on documentos_fiscales(org_id, credit_note_of) where credit_note_of is not null;

-- La identidad PI permite guardar un refund antes de recibir el webhook del pago.
create table if not exists documento_reembolsos (
  org_id uuid not null references orgs(id) on delete cascade,
  stripe_refund_id text not null,
  stripe_payment_intent_id text not null,
  monto numeric not null check (monto > 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  status text not null check (status in ('pending', 'requires_action', 'succeeded', 'failed', 'canceled')),
  provider_event_created bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (org_id, stripe_refund_id)
);
create index if not exists idx_documento_reembolsos_pi on documento_reembolsos(org_id, stripe_payment_intent_id);
-- Un reembolso llega por el riel que cobró: Stripe trae refund + PaymentIntent y
-- Mercado Pago su propio par. La llave primaria original solo cabía para Stripe.
alter table documento_reembolsos add column if not exists mp_refund_id text;
alter table documento_reembolsos add column if not exists mp_payment_id text;
alter table documento_reembolsos drop constraint if exists documento_reembolsos_pkey;
alter table documento_reembolsos alter column stripe_refund_id drop not null;
alter table documento_reembolsos alter column stripe_payment_intent_id drop not null;
create unique index if not exists uq_documento_reembolsos_stripe
  on documento_reembolsos(org_id, stripe_refund_id) where stripe_refund_id is not null;
create unique index if not exists uq_documento_reembolsos_mp
  on documento_reembolsos(org_id, mp_refund_id) where mp_refund_id is not null;
alter table documento_reembolsos drop constraint if exists documento_reembolsos_proveedor_ck;
alter table documento_reembolsos add constraint documento_reembolsos_proveedor_ck
  check ((stripe_refund_id is not null and stripe_payment_intent_id is not null)
      or (mp_refund_id is not null and mp_payment_id is not null));
create index if not exists idx_documento_reembolsos_mp on documento_reembolsos(org_id, mp_payment_id);

alter table documento_reembolsos enable row level security;
alter table documento_reembolsos force row level security;
drop policy if exists rls_documento_reembolsos on documento_reembolsos;
create policy rls_documento_reembolsos on documento_reembolsos
  using (org_id = nullif(current_setting('app.org_id', true), '')::uuid)
  with check (org_id = nullif(current_setting('app.org_id', true), '')::uuid);
-- Fin de migración de conciliación de facturas.

-- Custom customer subdomains. Additive; also embedded in db/schema.sql.
create table if not exists org_domains (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null unique references orgs(id) on delete cascade,
  hostname text not null unique check (hostname = lower(hostname) and length(hostname) <= 253),
  verification_token text not null,
  probe_secret text not null,
  status text not null default 'pending' check (status in ('pending','dns_pending','tls_pending','active','error')),
  records jsonb not null default '[]'::jsonb,
  provider_project text,
  provider_team text,
  provider_owned boolean not null default false,
  removing boolean not null default false,
  operation_token uuid,
  operation_expires_at timestamptz,
  last_checked_at timestamptz,
  verified_at timestamptz,
  error_code text,
  created_at timestamptz not null default now()
);
alter table org_domains enable row level security;
alter table org_domains force row level security;
drop policy if exists org_domains_tenant on org_domains;
create policy org_domains_tenant on org_domains
  using (org_id = nullif(current_setting('app.org_id', true), '')::uuid)
  with check (org_id = nullif(current_setting('app.org_id', true), '')::uuid);

-- Discovery returns identity only, never configuration/secrets or other orgs.
create or replace function cord_resolve_customer_domain(p_hostname text)
returns table(org_id uuid)
language sql stable security definer
set search_path = public, pg_temp
as $$
  select d.org_id from org_domains d
  where p_hostname is not null and p_hostname <> ''
    and d.hostname = p_hostname and not d.removing
  limit 1
$$;
revoke all on function cord_resolve_customer_domain(text) from public;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'cord_app') then
    grant select, insert, update, delete on org_domains to cord_app;
    grant execute on function cord_resolve_customer_domain(text) to cord_app;
  end if;
end $$;

-- ── Lectura de Cord Ops (sep 2026) ──────────────────────────────────────────
-- 2026-09-30: Cord Ops lee facturas, cobros, workflows, integraciones y la
-- actividad de las organizaciones (regla 30). Mismo contrato que `ops_payouts`:
-- una política PERMISIVA aparte, solo `for select` y solo con
-- `app.scope='ops'`, que únicamente enciende withOpsTx() tras validar la
-- sesión de operador. No amplía escritura: Ops observa estas filas, no las crea
-- ni las edita. Hoy el rol de conexión bypasea RLS; sin esto, las pantallas
-- nuevas de Ops quedarían en blanco el día que se active `cord_app`.
do $$
declare t text;
begin
  foreach t in array array[
    'documentos_fiscales', 'documento_pagos', 'cotizacion_cobros',
    'workflows', 'workflow_runs', 'integracion_conexiones', 'integracion_sync',
    'domain_events', 'api_requests', 'webhook_deliveries', 'external_usage_events', 'uso_periodo'
  ] loop
    continue when to_regclass(t) is null;
    execute format('drop policy if exists %I on %I', 'ops_' || t, t);
    execute format(
      'create policy %I on %I for select using (current_setting(''app.scope'', true) = ''ops'')',
      'ops_' || t, t);
  end loop;
end $$;

-- Shared public brand presentation (portal and embed).
alter table orgs add column if not exists brand_profile jsonb not null default '{}'::jsonb;

-- BEGIN sandbox-simulaciones
-- Resultados forzados del modo prueba (test helpers de la API). Solo para
-- organizaciones sandbox: la base lo exige con un trigger, no solo el código.
create table if not exists sandbox_simulaciones (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references orgs(id) on delete cascade,
  tipo         text not null check (tipo in ('fiscal_emision')),
  resultado    text not null check (resultado in ('exito', 'pac_caido', 'receptor_invalido', 'certificado_vencido', 'timbre_duplicado')),
  created_at   timestamptz not null default now(),
  consumido_at timestamptz
);
create unique index if not exists uq_sandbox_simulacion_pendiente
  on sandbox_simulaciones(org_id, tipo) where consumido_at is null;

create or replace function cord_assert_sandbox_org() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from orgs where id = new.org_id and sandbox_of is not null) then
    raise exception 'sandbox_simulaciones solo admite organizaciones de prueba';
  end if;
  return new;
end $$;
revoke all on function cord_assert_sandbox_org() from public;

drop trigger if exists trg_sandbox_simulaciones_solo_sandbox on sandbox_simulaciones;
create trigger trg_sandbox_simulaciones_solo_sandbox
  before insert or update on sandbox_simulaciones
  for each row execute function cord_assert_sandbox_org();

alter table sandbox_simulaciones enable row level security;
alter table sandbox_simulaciones force row level security;
drop policy if exists rls_sandbox_simulaciones on sandbox_simulaciones;
create policy rls_sandbox_simulaciones on sandbox_simulaciones
  using (org_id = nullif(current_setting('app.org_id', true), '')::uuid)
  with check (org_id = nullif(current_setting('app.org_id', true), '')::uuid);

do $$ begin
  if exists (select 1 from pg_roles where rolname = 'cord_app') then
    grant select, insert, update, delete on sandbox_simulaciones to cord_app;
  end if;
end $$;
-- END sandbox-simulaciones

-- BEGIN api-version
-- Versión de la API fijada al crear cada llave y cada endpoint de webhook
-- (src/lib/api-versions.ts). null = la versión base, 2026-10-01.
alter table api_keys add column if not exists api_version text;
alter table webhooks add column if not exists api_version text;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'api_keys_api_version_format') then
    alter table api_keys add constraint api_keys_api_version_format check (api_version is null or api_version ~ '^\d{4}-\d{2}-\d{2}$');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'webhooks_api_version_format') then
    alter table webhooks add constraint webhooks_api_version_format check (api_version is null or api_version ~ '^\d{4}-\d{2}-\d{2}$');
  end if;
end $$;
-- END api-version

-- BEGIN cli-listen
-- Sesión de `cord listen`: un endpoint efímero de la sandbox cuyos eventos no
-- salen por HTTP (Cord no puede llegar a localhost); el CLI los recoge firmados.
alter table webhooks add column if not exists cli_hasta timestamptz;
create index if not exists idx_webhooks_cli on webhooks(cli_hasta) where cli_hasta is not null;
-- END cli-listen

-- BEGIN api-key-security
-- Llaves restringidas (rk_), IPs permitidas, vencimiento y rotación con gracia
-- (src/lib/api-key-policy.ts). permissions = { recurso: none|read|write };
-- null = llave secreta completa. replaced_by marca la llave vieja de una
-- rotación: sigue viva hasta expires_at pero ya no cuenta contra el límite.
alter table api_keys add column if not exists permissions jsonb;
alter table api_keys add column if not exists allowed_ips text[];
alter table api_keys add column if not exists replaced_by uuid references api_keys(id) on delete set null;
create unique index if not exists uq_api_keys_hash on api_keys(hash);
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'api_keys_restricted_secret') then
    alter table api_keys add constraint api_keys_restricted_secret check ((permissions is null and allowed_ips is null) or type = 'secret');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'api_keys_permissions_object') then
    alter table api_keys add constraint api_keys_permissions_object check (permissions is null or jsonb_typeof(permissions) = 'object');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'api_keys_allowed_ips_size') then
    alter table api_keys add constraint api_keys_allowed_ips_size check (allowed_ips is null or cardinality(allowed_ips) between 1 and 20);
  end if;
end $$;
-- END api-key-security

-- BEGIN setup-plans
-- Configuración asistida (src/lib/setup/): un solo plan por propuesta, venga del
-- onboarding, de la app, del CLI o de un agente por MCP. Se propone, una persona
-- lo revisa en el navegador y solo entonces se aplica por los mismos caminos que
-- Ajustes. La entrada guarda referencias (sitio, descripción, nombre de archivo),
-- nunca el contenido de los archivos.
create table if not exists setup_plans (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references orgs(id) on delete cascade,
  origen       text not null check (origen in ('onboarding', 'app', 'cli', 'mcp')),
  estado       text not null default 'generando' check (estado in ('generando', 'propuesto', 'aplicado', 'descartado', 'fallido')),
  entrada      jsonb not null default '{}'::jsonb,
  propuesta    jsonb,
  descartado   jsonb not null default '[]'::jsonb,
  resultado    jsonb,
  creado_por   text,
  aplicado_por uuid references users(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  aplicado_at  timestamptz,
  expira_at    timestamptz not null default now() + interval '7 days'
);
create index if not exists idx_setup_plans_org on setup_plans(org_id, created_at desc);

alter table setup_plans enable row level security;
alter table setup_plans force row level security;
drop policy if exists rls_setup_plans on setup_plans;
create policy rls_setup_plans on setup_plans
  using (org_id = nullif(current_setting('app.org_id', true), '')::uuid)
  with check (org_id = nullif(current_setting('app.org_id', true), '')::uuid);

do $$ begin
  if exists (select 1 from pg_roles where rolname = 'cord_app') then
    grant select, insert, update, delete on setup_plans to cord_app;
  end if;
end $$;
-- END setup-plans

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

-- ── Impuesto predeterminado por producto (oct 2026) ─────────────────────────
-- Un negocio que vende servicios gravados y productos exentos (o a tasa
-- reducida) tenía que corregir el impuesto de cada línea a mano en cada
-- cotización: al agregar un producto la línea nacía con la tasa default de la
-- organización. `tax_rate` es la tasa SUGERIDA al agregarlo (fracción, como
-- `cotizacion_items.tax_rate`); la línea sigue tomando su propio snapshot al
-- capturar (regla 23), así que editar el producto no reescribe documentos ya
-- enviados. `null` = la tasa predeterminada de la organización. El servidor la
-- valida contra el catálogo `impuestos` al guardar (actions/products.ts).
alter table productos add column if not exists tax_rate numeric
  check (tax_rate is null or (tax_rate >= 0 and tax_rate <= 1));

-- ── Claves SAT por producto (oct 2026) ──────────────────────────────────────
-- Todo CFDI salía con 01010101 ("No existe en el catálogo") y H87 (pieza),
-- también una hora de consultoría o una licencia. `clave_sat` es
-- c_ClaveProdServ (8 dígitos) y `clave_unidad_sat` c_ClaveUnidad (1 a 3
-- alfanuméricos). `null` = sin clasificar: el CFDI usa los defaults del SAT y,
-- para la unidad, la deducida de `unidad` (src/lib/fiscal/sat-claves.ts). Se
-- leen al timbrar y quedan congeladas en `line_items_snapshot`.
alter table productos add column if not exists clave_sat text
  check (clave_sat is null or clave_sat ~ '^[0-9]{8}$');
alter table productos add column if not exists clave_unidad_sat text
  check (clave_unidad_sat is null or clave_unidad_sat ~ '^[A-Z0-9]{1,3}$');

-- BEGIN informes-guardados
-- Informes guardados (oct 2026): una configuración del explorador de informes
-- (agrupar por + métricas) con nombre, compartida por la organización. Si tiene
-- frecuencia, el cron /api/cron/informes-programados se la manda por correo a
-- quien la guardó: el destinatario no es libre, así nadie usa Cord para mandar
-- correo a terceros. `ultimo_envio_at` avanza ANTES de enviar (mismo patrón que
-- las recurrencias): un fallo a medio camino no repite el envío.
create table if not exists informes_guardados (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references orgs(id) on delete cascade,
  nombre           text not null check (char_length(nombre) between 1 and 80),
  config           jsonb not null,
  frecuencia       text not null default 'ninguna' check (frecuencia in ('ninguna', 'semanal', 'mensual')),
  creado_por       uuid references users(id) on delete set null,
  ultimo_envio_at  timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists idx_informes_guardados_org on informes_guardados(org_id, created_at desc);
create index if not exists idx_informes_guardados_programados on informes_guardados(frecuencia, ultimo_envio_at) where frecuencia <> 'ninguna';

alter table informes_guardados enable row level security;
alter table informes_guardados force row level security;
drop policy if exists rls_informes_guardados on informes_guardados;
create policy rls_informes_guardados on informes_guardados
  using (org_id = nullif(current_setting('app.org_id', true), '')::uuid)
  with check (org_id = nullif(current_setting('app.org_id', true), '')::uuid);
-- El cron solo DESCUBRE qué informes tocan (lectura cross-org, regla 30); el
-- trabajo de cada uno vuelve a withOrgTx con su org_id.
drop policy if exists system_informes_guardados on informes_guardados;
create policy system_informes_guardados on informes_guardados
  for select using (current_setting('app.scope', true) = 'system');

do $$ begin
  if exists (select 1 from pg_roles where rolname = 'cord_app') then
    grant select, insert, update, delete on informes_guardados to cord_app;
  end if;
end $$;
-- END informes-guardados

-- ── Tareas con dueño, prioridad y recordatorio real (oct 2026) ──────────────
-- Espejo de db/tareas-seguimiento.sql, que corre en cada build antes de servir.
alter table tareas add column if not exists notas text;
alter table tareas add column if not exists prioridad text not null default 'normal';
alter table tareas add column if not exists asignado_a uuid references users(id) on delete set null;
alter table tareas add column if not exists creado_por uuid references users(id) on delete set null;
alter table tareas add column if not exists completed_at timestamptz;
alter table tareas add column if not exists completed_by uuid references users(id) on delete set null;
alter table tareas add column if not exists recordada_el date;
alter table tareas drop constraint if exists tareas_prioridad_check;
alter table tareas add constraint tareas_prioridad_check check (prioridad in ('normal', 'alta'));
create index if not exists idx_tareas_asignado on tareas(org_id, asignado_a, due_date) where done = false;
create index if not exists idx_tareas_completadas on tareas(org_id, completed_at desc) where done = true;
-- END tareas-seguimiento

-- ═══════════════════════════════════════════════════════════════════════════
-- PORTAL DEL CLIENTE, COBRO AGRUPADO Y COBRO AUTOMÁTICO (oct 2026)
-- ═══════════════════════════════════════════════════════════════════════════
-- Espejo de db/deploy/2026-10-08-cobros-portal.sql, que corre en cada build.
--
-- El portal es un link POR CLIENTE con todas sus facturas, su saldo por divisa
-- y el pago de varias a la vez. El token es la credencial portadora (mismo
-- contrato que /i/[token], regla 30): lo traduce cord_resolve_portal y la
-- consulta vuelve a withOrgTx con ese org_id.
alter table clientes add column if not exists portal_token text;

alter table clientes add column if not exists portal_token_at timestamptz;

create unique index if not exists uq_clientes_portal_token on clientes(portal_token) where portal_token is not null;

-- El Customer del cliente vive en la cuenta CONECTADA del negocio (cargos
-- directos): ahí quedan sus métodos guardados. La cuenta va junto al id porque
-- un negocio que rehace su alta de cobros tiene otra cuenta, y ese Customer ya
-- no existe para ella.
alter table clientes add column if not exists stripe_customer_id text;

alter table clientes add column if not exists stripe_customer_account text;

-- Cobro automático: lo ACTIVA el cliente desde el portal, con su
-- consentimiento (fecha, IP y navegador los pone el servidor, como en
-- tos_acceptance). El negocio solo puede apagarlo: cargar a un método guardado
-- sin la autorización de su titular no es una preferencia del vendedor.
-- El consentimiento viaja PENDIENTE (con el id del intento que guarda el
-- método) hasta que el proveedor confirma ese método: un intento que falla no
-- puede reemplazar la evidencia del cobro automático que ya estaba activo.
-- `autopay_desactivado` guarda quién lo apagó y por qué (cliente, negocio, o
-- el sistema tras un mandato revocado o una tarjeta reportada).
alter table clientes add column if not exists autopay_activo boolean not null default false;

alter table clientes add column if not exists autopay_payment_method_id text;

alter table clientes add column if not exists autopay_metodo jsonb;

alter table clientes add column if not exists autopay_consentimiento jsonb;

alter table clientes add column if not exists autopay_consentimiento_pendiente jsonb;

alter table clientes add column if not exists autopay_desactivado jsonb;

-- Domiciliación bancaria (SEPA en la zona euro, ACH en EE. UU.): la decide el
-- negocio. Un cargo que tarda días en confirmarse y que el banco puede
-- devolver semanas después no es para todos. Sin la capacidad activa en el
-- proveedor (`stripe_capacidades`) no se ofrece aunque esté encendida.
alter table orgs add column if not exists acepta_domiciliacion boolean not null default false;

alter table orgs add column if not exists cobro_automatico_permitido boolean not null default true;

alter table orgs add column if not exists stripe_capacidades jsonb not null default '{}'::jsonb;

-- Un débito bancario queda días "en proceso": la factura todavía no está
-- pagada, pero no se puede volver a cobrar ni anular mientras tanto.
alter table documentos_fiscales add column if not exists pago_en_proceso_pi text;

alter table documentos_fiscales add column if not exists pago_en_proceso_at timestamptz;

-- Un cobro que paga VARIAS facturas (portal o cobro automático). El reparto
-- vive en pago_agrupado_documentos y lo decide Cord al crear el cobro, con el
-- saldo real de cada factura; el webhook solo lo aplica. Una sola fila viva por
-- cliente y divisa en el cobro automático: dos corridas del cron no pueden
-- cargar dos veces.
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

-- Reintentos del cobro automático por cliente y divisa. Lo calcula una
-- función pura (src/lib/cobros/reintentos.ts); aquí solo se guarda dónde va.
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

-- Reparto de un reembolso entre las facturas que pagó el mismo cobro. Sin él,
-- devolver 50 de un cobro que pagó dos facturas reabría 50 en CADA una. Un
-- reembolso sin reparto conserva la regla anterior solo si su cobro pagó una
-- sola factura (todo lo previo a esta migración).
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

-- Resolutor del portal: token → (cliente, organización). Estrecho a propósito.
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
-- END cobros-portal

-- ── SPEI con CLABE en facturas (oct 2026) ───────────────────────────────────
-- Espejo de db/deploy/2026-10-10-spei-facturas.sql, que corre en cada build.
--
-- La CLABE de SPEI es del Customer del proveedor, no del pago. Cada factura
-- tiene el SUYO en la cuenta conectada del negocio, así que todo lo que llegue
-- a esa CLABE solo puede fondear un pago de ESA factura (src/lib/cobros/spei.ts).
-- Se guarda en cuanto se crea, antes del primer pago: la CLABE es la misma en
-- cada visita y en cada abono, y la clave de idempotencia del proveedor (que
-- vence a las 24 horas) no basta para sostenerla. El índice único impide que
-- dos facturas compartan CLABE y resuelve la factura desde el saldo del cliente
-- (`cash_balance.funds_available`).
alter table documentos_fiscales add column if not exists stripe_spei_customer_id text;

create unique index if not exists uq_documentos_fiscales_spei_customer
  on documentos_fiscales(org_id, stripe_spei_customer_id) where stripe_spei_customer_id is not null;
-- END spei-facturas

-- ── Descuentos de documento y cupones (oct 2026) ────────────────────────────
-- Un descuento sobre la venta completa (porcentaje o monto), antes de
-- impuestos y repartido entre las líneas en proporción a su importe bruto
-- (calculateDocumentTotals, opción `descuento`). Antes la única forma de
-- rebajar era bajar el precio de cada línea a mano, y un "10 % de descuento
-- por pronto pago" no se podía expresar.
--
-- Contrato de las columnas:
--   - `cotizaciones.descuento` (ya existía, sin escritor) guarda el IMPORTE
--     del descuento antes de impuestos; `subtotal` sigue siendo la base NETA.
--     La hoja de cálculo lo exporta en su columna `descuento`.
--   - `*.descuento_def` / `documentos_fiscales.descuento`: la DEFINICIÓN
--     ({tipo, valor, codigo?, cupon_id?, iva_incluido?}) para reabrir el
--     borrador y recalcular una aprobación parcial o la factura de la
--     cotización. Nunca se confía en un importe que mande el navegador.
--   - `cotizacion_items.descuento_pct` NO se usa: Shopify y la contabilidad lo
--     aplican como descuento de línea y descontarían dos veces.
alter table cotizaciones add column if not exists descuento_def jsonb;
alter table documentos_fiscales add column if not exists descuento_total numeric not null default 0;
alter table documentos_fiscales add column if not exists descuento jsonb;
alter table documento_recurrencias add column if not exists descuento jsonb;

-- Cupones: códigos reutilizables que el negocio administra en Ajustes. El
-- código se normaliza a mayúsculas y es único por organización. Un cupón de
-- monto lleva su divisa (un "100" no es dinero sin ella, regla 21); uno de
-- porcentaje no.
create table if not exists cupones (
  id                    uuid        primary key default gen_random_uuid(),
  org_id                uuid        not null references orgs(id) on delete cascade,
  codigo                text        not null,
  nombre                text,
  tipo                  text        not null,
  valor                 numeric     not null,
  moneda                text,
  vigente_desde         date,
  vigente_hasta         date,
  max_usos              int,
  max_usos_por_cliente  int,
  usos                  int         not null default 0,
  activo                boolean     not null default true,
  created_by            uuid        references users(id) on delete set null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint chk_cupones_codigo check (codigo ~ '^[A-Z0-9_-]{3,32}$'),
  constraint chk_cupones_tipo check (tipo in ('porcentaje', 'monto')),
  constraint chk_cupones_valor check (valor > 0 and (tipo <> 'porcentaje' or valor <= 100)),
  constraint chk_cupones_moneda check ((tipo = 'monto') = (moneda is not null) and (moneda is null or moneda ~ '^[A-Z]{3}$')),
  constraint chk_cupones_vigencia check (vigente_desde is null or vigente_hasta is null or vigente_hasta >= vigente_desde),
  constraint chk_cupones_max_usos check (max_usos is null or max_usos > 0),
  constraint chk_cupones_max_usos_cliente check (max_usos_por_cliente is null or max_usos_por_cliente > 0),
  constraint chk_cupones_usos check (usos >= 0)
);
create unique index if not exists uq_cupones_org_codigo on cupones(org_id, codigo);

-- Una redención por documento que se vuelve vinculante: la factura al emitirse
-- o la cotización al aprobarse. La factura que nace de una cotización REUSA la
-- redención de la cotización (no cuenta dos veces), y anular la factura la
-- libera. Si el documento se borra la fila se queda, sin documento: el uso ya
-- ocurrió y el contador lo refleja.
create table if not exists cupon_redenciones (
  id             uuid        primary key default gen_random_uuid(),
  org_id         uuid        not null references orgs(id) on delete cascade,
  cupon_id       uuid        not null references cupones(id) on delete cascade,
  cliente_id     uuid        references clientes(id) on delete set null,
  cotizacion_id  uuid        references cotizaciones(id) on delete set null,
  documento_id   uuid        references documentos_fiscales(id) on delete set null,
  monto          numeric     not null default 0,
  moneda         text        not null,
  created_at     timestamptz not null default now()
);
create unique index if not exists uq_cupon_redenciones_cotizacion on cupon_redenciones(cupon_id, cotizacion_id);
create unique index if not exists uq_cupon_redenciones_documento on cupon_redenciones(cupon_id, documento_id);
create index if not exists idx_cupon_redenciones_cliente on cupon_redenciones(cupon_id, cliente_id);

alter table cupones enable row level security;
alter table cupones force row level security;
drop policy if exists rls_cupones on cupones;
create policy rls_cupones on cupones
  using (org_id = nullif(current_setting('app.org_id', true), '')::uuid)
  with check (org_id = nullif(current_setting('app.org_id', true), '')::uuid);

alter table cupon_redenciones enable row level security;
alter table cupon_redenciones force row level security;
drop policy if exists rls_cupon_redenciones on cupon_redenciones;
create policy rls_cupon_redenciones on cupon_redenciones
  using (org_id = nullif(current_setting('app.org_id', true), '')::uuid)
  with check (org_id = nullif(current_setting('app.org_id', true), '')::uuid);

-- Redime un cupón para un documento, atómicamente. El `for update` serializa
-- por cupón: dos emisiones simultáneas que compiten por el último uso no ganan
-- las dos. Corre con los permisos de quien llama (RLS de la organización en
-- contexto), no como `security definer`.
--   'ok'              redimido ahora, o ya lo estaba (reintento, o la factura
--                     de una cotización que ya lo redimió)
--   'agotado'         sin usos disponibles
--   'agotado_cliente' el cliente ya usó todos los que le tocan
--   'no_existe'       el cupón no es de esta organización
create or replace function cord_cupon_redimir(
  p_org uuid, p_cupon uuid, p_cliente uuid, p_cotizacion uuid, p_documento uuid, p_monto numeric, p_moneda text
) returns text
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_cupon cupones%rowtype;
  v_existente uuid;
  v_del_cliente int;
begin
  select * into v_cupon from cupones where id = p_cupon and org_id = p_org for update;
  if not found then
    return 'no_existe';
  end if;

  select id into v_existente from cupon_redenciones
   where cupon_id = p_cupon and org_id = p_org
     and ((p_documento is not null and documento_id = p_documento)
       or (p_cotizacion is not null and cotizacion_id = p_cotizacion))
   limit 1;
  if v_existente is not null then
    update cupon_redenciones set documento_id = coalesce(documento_id, p_documento)
     where id = v_existente and org_id = p_org;
    return 'ok';
  end if;

  if v_cupon.max_usos is not null and v_cupon.usos >= v_cupon.max_usos then
    return 'agotado';
  end if;
  if v_cupon.max_usos_por_cliente is not null and p_cliente is not null then
    select count(*) into v_del_cliente from cupon_redenciones
     where cupon_id = p_cupon and org_id = p_org and cliente_id = p_cliente;
    if v_del_cliente >= v_cupon.max_usos_por_cliente then
      return 'agotado_cliente';
    end if;
  end if;

  insert into cupon_redenciones (org_id, cupon_id, cliente_id, cotizacion_id, documento_id, monto, moneda)
  values (p_org, p_cupon, p_cliente, p_cotizacion, p_documento, coalesce(p_monto, 0), p_moneda);
  update cupones set usos = usos + 1, updated_at = now() where id = p_cupon and org_id = p_org;
  return 'ok';
end;
$$;

-- Libera las redenciones de un documento (factura anulada, cotización
-- rechazada) y devuelve sus usos al contador.
create or replace function cord_cupon_liberar(p_org uuid, p_cotizacion uuid, p_documento uuid)
returns int
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_liberadas int := 0;
  r record;
begin
  for r in
    delete from cupon_redenciones
     where org_id = p_org
       and ((p_documento is not null and documento_id = p_documento)
         or (p_cotizacion is not null and cotizacion_id = p_cotizacion))
    returning cupon_id
  loop
    update cupones set usos = greatest(usos - 1, 0), updated_at = now()
     where id = r.cupon_id and org_id = p_org;
    v_liberadas := v_liberadas + 1;
  end loop;
  return v_liberadas;
end;
$$;

do $$ begin
  if exists (select 1 from pg_roles where rolname = 'cord_app') then
    grant select, insert, update, delete on cupones to cord_app;
    grant select, insert, update, delete on cupon_redenciones to cord_app;
    grant execute on function cord_cupon_redimir(uuid, uuid, uuid, uuid, uuid, numeric, text) to cord_app;
    grant execute on function cord_cupon_liberar(uuid, uuid, uuid) to cord_app;
  end if;
end $$;
-- END descuentos

-- ── Rieles fiscales de LatAm: integración directa con la autoridad (oct 2026) ─
-- Argentina (ARCA) es el primero; Brasil (NFS-e Nacional), Colombia (DIAN),
-- Perú (SUNAT) y Chile (SII) se construyen sobre estas mismas tablas. Cord
-- habla DIRECTO con la autoridad, sin agregador: la respuesta de la autoridad
-- (código de autorización, observaciones, rechazo) queda guardada aquí como la
-- fuente de verdad del documento fiscal. Contrato completo en
-- docs/estado/cobros-facturacion.md, sección "Rieles fiscales de LatAm".

-- Condición frente al IVA del cliente (Argentina). Es el
-- CondicionIVAReceptorId que la RG 5616/2024 hizo obligatorio en cada pedido
-- de autorización; los códigos son los del método
-- FEParamGetCondicionIvaReceptor (anexo del manual del desarrollador de
-- WSFEv1, RG 4291 v4.7). Nulo = sin capturar.
alter table clientes add column if not exists condicion_iva smallint;
alter table clientes drop constraint if exists chk_clientes_condicion_iva;
alter table clientes add constraint chk_clientes_condicion_iva
  check (condicion_iva is null or condicion_iva in (1, 4, 5, 6, 7, 8, 9, 10, 13, 15, 16));

-- Ajustes de cada riel por organización (ARCA: punto de venta, condición
-- frente al IVA del emisor, concepto). Independientes del entorno.
create table if not exists fiscal_rail_ajustes (
  org_id      uuid        not null references orgs(id) on delete cascade,
  rail        text        not null,
  ajustes     jsonb       not null default '{}'::jsonb,
  updated_at  timestamptz not null default now(),
  primary key (org_id, rail)
);

-- Certificado y llave privada con que el contribuyente se identifica ante su
-- autoridad, uno por riel y ENTORNO (el de homologación no sirve en
-- producción). Cifrados con encryptRequiredSecret(); nunca vuelven al
-- navegador. `secretos_enc` guarda credenciales extra que algunas autoridades
-- piden además del certificado (usuario SOL de SUNAT, PIN de software de la
-- DIAN), como JSON cifrado.
create table if not exists fiscal_rail_credenciales (
  id                 uuid        default gen_random_uuid() primary key,
  org_id             uuid        not null references orgs(id) on delete cascade,
  rail               text        not null,
  entorno            text        not null,
  cert_enc           text        not null,
  llave_enc          text        not null,
  secretos_enc       text,
  identificador      text        not null,
  certificado_nombre text,
  sujeto             text,
  huella_sha256      text        not null,
  vigente_desde      timestamptz not null,
  caduca             timestamptz not null,
  verificado_at      timestamptz,
  verificacion_error text,
  subido_por         uuid,
  subido_at          timestamptz not null default now(),
  unique (org_id, rail, entorno),
  check (entorno in ('homologacion', 'produccion'))
);

-- Ticket de acceso de la autoridad (ARCA: token + sign del WSAA, 12 horas),
-- cacheado por organización, entorno y servicio. La autoridad castiga pedir
-- otro mientras uno sigue vigente, así que se guarda (cifrado) y se comparte
-- entre instancias; `lease_*` deja que UNA sola instancia lo renueve y
-- `bloqueado_hasta` respeta la espera que exige la autoridad tras un rechazo
-- por ticket duplicado.
create table if not exists fiscal_rail_accesos (
  org_id          uuid        not null references orgs(id) on delete cascade,
  rail            text        not null,
  entorno         text        not null,
  servicio        text        not null,
  token_enc       text,
  firma_enc       text,
  expira_at       timestamptz,
  obtenido_at     timestamptz,
  bloqueado_hasta timestamptz,
  lease_hasta     timestamptz,
  lease_token     text,
  updated_at      timestamptz not null default now(),
  primary key (org_id, rail, entorno, servicio),
  check (entorno in ('homologacion', 'produccion'))
);

-- Una autorización en vuelo por secuencia de la autoridad (ARCA: CUIT + punto
-- de venta + tipo de comprobante; el número es el último autorizado + 1). El
-- driver HTTP de Neon no sostiene un advisory lock entre dos llamadas, así que
-- la serialización es un lease por fila, igual que verifactu_envio_estado.
create table if not exists fiscal_rail_secuencias (
  org_id            uuid        not null references orgs(id) on delete cascade,
  rail              text        not null,
  entorno           text        not null,
  serie             text        not null,
  tipo              text        not null,
  lease_hasta       timestamptz,
  lease_token       text,
  ultimo_autorizado bigint,
  updated_at        timestamptz not null default now(),
  primary key (org_id, rail, entorno, serie, tipo),
  check (entorno in ('homologacion', 'produccion'))
);

-- Cada intento de autorizar un documento ante la autoridad, con su máquina de
-- estados (src/lib/fiscal/latam/rieles.ts):
--   pendiente → autorizado | rechazado | incierto | descartado
--   incierto  → autorizado | descartado   (solo tras consultar a la autoridad)
-- El número se reclama ANTES de enviar: los índices únicos parciales impiden
-- que dos documentos vivos compartan número y que un documento tenga dos
-- intentos vivos. Un rechazo o un descarte libera el número (la autoridad no
-- lo consumió). `solicitud` es exactamente lo que se envió: con eso se
-- reconoce el comprobante al consultarlo después de un corte de red.
create table if not exists fiscal_rail_comprobantes (
  id                 uuid        default gen_random_uuid() primary key,
  org_id             uuid        not null references orgs(id) on delete cascade,
  documento_id       uuid        not null references documentos_fiscales(id) on delete cascade,
  rail               text        not null,
  entorno            text        not null,
  serie              text        not null,
  tipo               text        not null,
  numero             bigint      not null,
  estado             text        not null default 'pendiente',
  solicitud          jsonb       not null,
  respuesta          jsonb,
  autorizacion       text,
  autorizacion_vence date,
  observaciones      jsonb       not null default '[]'::jsonb,
  error_codigo       text,
  error_mensaje      text,
  intentos           int         not null default 0,
  created_at         timestamptz not null default now(),
  enviado_at         timestamptz,
  consultado_at      timestamptz,
  resuelto_at        timestamptz,
  check (entorno in ('homologacion', 'produccion')),
  check (estado in ('pendiente', 'autorizado', 'rechazado', 'incierto', 'descartado')),
  check (numero > 0),
  check (estado <> 'autorizado' or autorizacion is not null)
);
create unique index if not exists uq_fiscal_rail_comprobantes_numero
  on fiscal_rail_comprobantes (org_id, rail, entorno, serie, tipo, numero)
  where estado in ('pendiente', 'incierto', 'autorizado');
create unique index if not exists uq_fiscal_rail_comprobantes_documento
  on fiscal_rail_comprobantes (documento_id, rail, entorno)
  where estado in ('pendiente', 'incierto', 'autorizado');
create index if not exists idx_fiscal_rail_comprobantes_por_resolver
  on fiscal_rail_comprobantes (rail, created_at)
  where estado in ('pendiente', 'incierto');

-- Lo que la autoridad ya autorizó no se reescribe ni se borra a mano (mismo
-- criterio que verifactu_registros): la identidad del intento y lo enviado
-- son inmutables desde el insert, un estado final no vuelve atrás y un
-- comprobante autorizado no admite ningún cambio. El borrado en cascada de la
-- organización o del documento sí pasa (profundidad de trigger > 1).
create or replace function cord_fiscal_rail_comprobante_inmutable()
returns trigger
language plpgsql
as $$
begin
  if TG_OP = 'DELETE' then
    if old.estado = 'autorizado' and pg_trigger_depth() <= 1 then
      raise exception 'fiscal_rail_comprobantes: un comprobante autorizado por la autoridad no se borra'
        using errcode = 'restrict_violation';
    end if;
    return old;
  end if;
  if new.org_id is distinct from old.org_id
     or new.documento_id is distinct from old.documento_id
     or new.rail is distinct from old.rail
     or new.entorno is distinct from old.entorno
     or new.serie is distinct from old.serie
     or new.tipo is distinct from old.tipo
     or new.numero is distinct from old.numero
     or new.solicitud is distinct from old.solicitud
     or new.created_at is distinct from old.created_at then
    raise exception 'fiscal_rail_comprobantes: la identidad y la solicitud de un intento no se modifican';
  end if;
  if old.estado = 'autorizado' and new is distinct from old then
    raise exception 'fiscal_rail_comprobantes: un comprobante autorizado es definitivo';
  end if;
  if old.estado in ('rechazado', 'descartado') and new.estado is distinct from old.estado then
    raise exception 'fiscal_rail_comprobantes: rechazado y descartado son estados finales';
  end if;
  if old.estado = 'incierto' and new.estado in ('pendiente', 'rechazado') then
    raise exception 'fiscal_rail_comprobantes: un intento incierto solo se resuelve consultando a la autoridad';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_fiscal_rail_comprobante_inmutable on fiscal_rail_comprobantes;
create trigger trg_fiscal_rail_comprobante_inmutable
  before update or delete on fiscal_rail_comprobantes
  for each row execute function cord_fiscal_rail_comprobante_inmutable();

alter table fiscal_rail_ajustes enable row level security;
drop policy if exists "rls_fiscal_rail_ajustes" on fiscal_rail_ajustes;
create policy "rls_fiscal_rail_ajustes" on fiscal_rail_ajustes
  using (org_id = nullif(current_setting('app.org_id', true), '')::uuid)
  with check (org_id = nullif(current_setting('app.org_id', true), '')::uuid);
alter table fiscal_rail_ajustes force row level security;

alter table fiscal_rail_credenciales enable row level security;
drop policy if exists "rls_fiscal_rail_credenciales" on fiscal_rail_credenciales;
create policy "rls_fiscal_rail_credenciales" on fiscal_rail_credenciales
  using (org_id = nullif(current_setting('app.org_id', true), '')::uuid)
  with check (org_id = nullif(current_setting('app.org_id', true), '')::uuid);
alter table fiscal_rail_credenciales force row level security;

alter table fiscal_rail_accesos enable row level security;
drop policy if exists "rls_fiscal_rail_accesos" on fiscal_rail_accesos;
create policy "rls_fiscal_rail_accesos" on fiscal_rail_accesos
  using (org_id = nullif(current_setting('app.org_id', true), '')::uuid)
  with check (org_id = nullif(current_setting('app.org_id', true), '')::uuid);
alter table fiscal_rail_accesos force row level security;

alter table fiscal_rail_secuencias enable row level security;
drop policy if exists "rls_fiscal_rail_secuencias" on fiscal_rail_secuencias;
create policy "rls_fiscal_rail_secuencias" on fiscal_rail_secuencias
  using (org_id = nullif(current_setting('app.org_id', true), '')::uuid)
  with check (org_id = nullif(current_setting('app.org_id', true), '')::uuid);
alter table fiscal_rail_secuencias force row level security;

alter table fiscal_rail_comprobantes enable row level security;
drop policy if exists "rls_fiscal_rail_comprobantes" on fiscal_rail_comprobantes;
create policy "rls_fiscal_rail_comprobantes" on fiscal_rail_comprobantes
  using (org_id = nullif(current_setting('app.org_id', true), '')::uuid)
  with check (org_id = nullif(current_setting('app.org_id', true), '')::uuid);
alter table fiscal_rail_comprobantes force row level security;

-- El cron que resuelve intentos sin respuesta (/api/cron/fiscal-latam) solo
-- necesita DESCUBRIR qué organizaciones tienen alguno: función estrecha, solo
-- en el carril de sistema y solo devuelve ids (regla 30). El trabajo de cada
-- organización vuelve a withOrgTx con su org_id.
create or replace function cord_fiscal_rail_orgs_por_resolver(p_rail text, p_antiguedad_s int)
returns setof uuid
language sql stable security definer
set search_path = public, pg_temp
as $$
  select distinct c.org_id
    from fiscal_rail_comprobantes c
   where current_setting('app.scope', true) = 'system'
     and c.rail = p_rail
     and c.estado in ('pendiente', 'incierto')
     and c.created_at < now() - make_interval(secs => greatest(p_antiguedad_s, 0))
$$;
revoke all on function cord_fiscal_rail_orgs_por_resolver(text, int) from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'cord_app') then
    grant select, insert, update, delete on fiscal_rail_ajustes to cord_app;
    grant select, insert, update, delete on fiscal_rail_credenciales to cord_app;
    grant select, insert, update, delete on fiscal_rail_accesos to cord_app;
    grant select, insert, update, delete on fiscal_rail_secuencias to cord_app;
    grant select, insert, update, delete on fiscal_rail_comprobantes to cord_app;
    grant execute on function cord_fiscal_rail_orgs_por_resolver(text, int) to cord_app;
  end if;
end
$$;
-- END rieles-latam

-- ── México: claves SAT por línea, factura global y sustitución (oct 2026) ───
-- Espejo de db/deploy/2026-10-08-mexico.sql, que corre en cada build antes de
-- servir (scripts/migrate-facturacion.mjs).
--
-- Claves SAT propias de la línea de una cotización. Antes solo un producto del
-- catálogo podía llevarlas: una línea libre se timbraba siempre 01010101. La
-- de la línea gana sobre la del producto al timbrar (src/lib/fiscal/sat-claves.ts);
-- `null` = sin clave propia.
alter table cotizacion_items add column if not exists clave_sat text
  check (clave_sat is null or clave_sat ~ '^[0-9]{8}$');
alter table cotizacion_items add column if not exists clave_unidad_sat text
  check (clave_unidad_sat is null or clave_unidad_sat ~ '^[A-Z0-9]{1,3}$');

-- Uso del CFDI y forma de pago fijados en el documento (México). `null` =
-- automáticos: el uso de la ficha del cliente y la forma según los cobros. La
-- forma solo aplica a un comprobante pagado al emitirse (PUE); un PPD es 99.
alter table documentos_fiscales add column if not exists cfdi_uso text;

alter table documentos_fiscales drop constraint if exists chk_documentos_cfdi_uso;

alter table documentos_fiscales add constraint chk_documentos_cfdi_uso
  check (cfdi_uso is null or cfdi_uso in ('G01','G02','G03','I01','I02','I03','I04','I05','I06','I07','I08',
    'D01','D02','D03','D04','D05','D06','D07','D08','D09','D10','S01','CP01','CN01'));

alter table documentos_fiscales add column if not exists cfdi_forma_pago text;

alter table documentos_fiscales drop constraint if exists chk_documentos_cfdi_forma_pago;

alter table documentos_fiscales add constraint chk_documentos_cfdi_forma_pago
  check (cfdi_forma_pago is null or cfdi_forma_pago in ('01','02','03','04','05','06','08','12','13','14','15',
    '17','23','24','25','26','27','28','29','30','31'));

-- Sustitución de un CFDI (relación 04 + cancelación con motivo 01). El
-- sustituto apunta a su original desde el borrador; el original apunta a su
-- sustituto cuando éste se timbra, y desde ahí sus cobros viven en el sustituto
-- (src/lib/fiscal/sustitucion.ts). Un solo sustituto vivo por original.
alter table documentos_fiscales add column if not exists sustituye_a uuid references documentos_fiscales(id) on delete set null;

alter table documentos_fiscales add column if not exists sustituida_por uuid references documentos_fiscales(id) on delete set null;

create unique index if not exists uq_documentos_sustituye_a
  on documentos_fiscales(sustituye_a)
  where sustituye_a is not null and lifecycle <> 'void';

-- Factura global a "PUBLICO EN GENERAL" (InformacionGlobal del CFDI 4.0):
-- periodicidad, meses, año, forma de pago y el rango de ventas que documenta.
-- No tiene cliente ni cotización propia: sus ventas viven en
-- factura_global_ventas, y por eso el origen admite este tercer caso.
alter table documentos_fiscales add column if not exists informacion_global jsonb;

alter table documentos_fiscales drop constraint if exists chk_documentos_fiscales_origen;

alter table documentos_fiscales add constraint chk_documentos_fiscales_origen
  check (cotizacion_id is not null or cliente_id is not null
    or (informacion_global is not null and document_type = 'cfdi_40'));

-- Ventas que documenta cada factura global. El índice ÚNICO por cotización
-- mientras el vínculo esté vivo es lo que impide facturar la misma venta en dos
-- globales; cancelar la global marca `liberada_at` en la misma transacción.
create table if not exists factura_global_ventas (
  id            uuid        default gen_random_uuid() primary key,
  org_id        uuid        not null references orgs(id) on delete cascade,
  documento_id  uuid        not null references documentos_fiscales(id) on delete cascade,
  cotizacion_id uuid        not null references cotizaciones(id) on delete cascade,
  folio         text        not null,
  liberada_at   timestamptz,
  created_at    timestamptz not null default now()
);

create unique index if not exists uq_factura_global_ventas_viva
  on factura_global_ventas(cotizacion_id)
  where liberada_at is null;

create index if not exists idx_factura_global_ventas_doc
  on factura_global_ventas(org_id, documento_id);

alter table factura_global_ventas enable row level security;

alter table factura_global_ventas force row level security;

drop policy if exists rls_factura_global_ventas on factura_global_ventas;

create policy rls_factura_global_ventas on factura_global_ventas
  using (org_id = nullif(current_setting('app.org_id', true), '')::uuid)
  with check (org_id = nullif(current_setting('app.org_id', true), '')::uuid);

do $$ begin
  if exists (select 1 from pg_roles where rolname = 'cord_app') then
    grant select, insert, update, delete on factura_global_ventas to cord_app;
  end if;
end $$;
-- END mexico

-- ── Factura electrónica europea (EN 16931), oct 2026 ────────────────────────
-- Factur-X, XRechnung y Peppol BIS Billing 3.0 se generan del snapshot de la
-- factura (src/lib/fiscal/einvoice/). Lo que el estándar pide y Cord no
-- guardaba: la referencia del comprador (BT-10; en Alemania, el Leitweg-ID de
-- la administración pública, obligatorio en XRechnung por BR-DE-15), la orden
-- de compra (BT-13) y la cuenta para transferencia vigente al emitir (BT-84 y
-- BT-86). `payee_account` guarda el IBAN CIFRADO (el mismo valor de
-- `orgs.banco_clabe_enc`), su terminación, el BIC y el titular: una factura de
-- marzo dice la cuenta de marzo aunque el negocio cambie de banco en junio, y
-- el snapshot no relaja la protección del dato de origen.
alter table documentos_fiscales add column if not exists buyer_reference text;
alter table documentos_fiscales add column if not exists purchase_order text;
alter table documentos_fiscales add column if not exists payee_account jsonb;
-- Del cliente: su dirección electrónica (BT-49, "esquema EAS:identificador",
-- p. ej. 0204:991-12345-67) y la referencia que sus facturas toman por defecto.
alter table clientes add column if not exists einvoice_address text;
alter table clientes add column if not exists buyer_reference text;
-- El perfil exento del catálogo lleva, fuera de España, la clasificación VATEX
-- de la factura electrónica (src/lib/fiscal/exemption.ts): exportación,
-- inversión del sujeto pasivo, entrega intracomunitaria, no sujeta, tipo cero o
-- un artículo de exención de la Directiva. España conserva E1–E6, N1, N2 y S2.
-- La definición nueva contiene todos los valores de la anterior: la migración
-- de despliegue no vuelve a tocar la restricción una vez aplicada.
alter table impuestos drop constraint if exists chk_impuestos_exemption_reason;
alter table impuestos add constraint chk_impuestos_exemption_reason
  check (exemption_reason is null or (kind = 'exento' and exemption_reason in ('E1','E2','E3','E4','E5','E6','N1','N2','S2','VATEX-EU-AE','VATEX-EU-IC','VATEX-EU-G','VATEX-EU-O','Z','VATEX-EU-132','VATEX-EU-135-1','VATEX-EU-79-C','VATEX-EU-148','VATEX-EU-151','VATEX-EU-309','VATEX-FR-FRANCHISE')));
alter table cotizacion_items drop constraint if exists chk_cotizacion_items_exemption_reason;
alter table cotizacion_items add constraint chk_cotizacion_items_exemption_reason
  check (exemption_reason is null or exemption_reason in ('E1','E2','E3','E4','E5','E6','N1','N2','S2','VATEX-EU-AE','VATEX-EU-IC','VATEX-EU-G','VATEX-EU-O','Z','VATEX-EU-132','VATEX-EU-135-1','VATEX-EU-79-C','VATEX-EU-148','VATEX-EU-151','VATEX-EU-309','VATEX-FR-FRANCHISE'));
-- END einvoice

-- ── Chile: factura electrónica con el SII (oct 2026) ─────────────────────────
-- Segundo riel fiscal de LatAm (src/lib/fiscal/latam/sii/), sobre las tablas
-- fiscal_rail_* de la sección "Rieles fiscales de LatAm". Lo propio de Chile:
-- los datos del receptor que el SII exige en la factura y los archivos de
-- folios (CAF) que el negocio descarga del SII.
--
-- Giro y comuna del cliente: obligatorios en la factura 33 y 34 (formato DTE
-- v2.2, campos 57 y 61). Nulos = sin capturar; la factura no se envía sin ellos.
alter table clientes add column if not exists giro text;
alter table clientes add column if not exists comuna text;

-- Código de Autorización de Folios (CAF): el rango de folios que el SII
-- autorizó para un tipo de documento, con la llave privada del timbre. Se
-- guarda cifrado entero con encryptRequiredSecret() y nunca vuelve al
-- navegador. `folio_siguiente` es el próximo folio por usar: SOLO avanza (un
-- folio rechazado o descartado no se reutiliza jamás) y un CAF con folios
-- usados no se borra. `vence` = seis meses desde la autorización para los
-- documentos con derecho a crédito fiscal (Res. Ex. SII N° 58/2017); nulo = sin
-- vencimiento (factura exenta).
create table if not exists fiscal_sii_cafs (
  id                 uuid        default gen_random_uuid() primary key,
  org_id             uuid        not null references orgs(id) on delete cascade,
  entorno            text        not null,
  tipo_dte           smallint    not null,
  folio_desde        bigint      not null,
  folio_hasta        bigint      not null,
  folio_siguiente    bigint      not null,
  fecha_autorizacion date        not null,
  vence              date,
  idk                int         not null,
  huella_sha256      text        not null,
  caf_enc            text        not null,
  archivo_nombre     text,
  subido_por         uuid,
  subido_at          timestamptz not null default now(),
  unique (org_id, entorno, tipo_dte, folio_desde),
  check (entorno in ('homologacion', 'produccion')),
  check (tipo_dte in (33, 34, 61)),
  check (folio_desde > 0 and folio_hasta >= folio_desde),
  check (folio_siguiente >= folio_desde and folio_siguiente <= folio_hasta + 1)
);
create index if not exists idx_fiscal_sii_cafs_disponibles
  on fiscal_sii_cafs (org_id, entorno, tipo_dte, folio_desde)
  where folio_siguiente <= folio_hasta;

-- Lo que hace imposible reutilizar un folio, en la base y no en el código:
-- dos CAF del mismo tipo no se solapan, la identidad de un CAF no cambia,
-- `folio_siguiente` no retrocede y un CAF con folios usados no se borra (salvo
-- en cascada, al borrarse la organización).
create or replace function cord_fiscal_sii_caf_guardas()
returns trigger
language plpgsql
as $$
begin
  if TG_OP = 'INSERT' then
    -- Dos cargas simultáneas del mismo tipo se ordenan: la segunda ve la primera.
    perform pg_advisory_xact_lock(hashtext('fiscal_sii_cafs:' || new.org_id::text || ':' || new.entorno || ':' || new.tipo_dte::text));
    if exists (
      select 1 from fiscal_sii_cafs c
       where c.org_id = new.org_id and c.entorno = new.entorno and c.tipo_dte = new.tipo_dte
         and c.folio_desde <= new.folio_hasta and new.folio_desde <= c.folio_hasta
    ) then
      raise exception 'fiscal_sii_cafs: el rango de folios se solapa con otro CAF del mismo tipo'
        using errcode = 'exclusion_violation';
    end if;
    return new;
  end if;
  if TG_OP = 'DELETE' then
    if old.folio_siguiente > old.folio_desde and pg_trigger_depth() <= 1 then
      raise exception 'fiscal_sii_cafs: un CAF con folios usados no se borra'
        using errcode = 'restrict_violation';
    end if;
    return old;
  end if;
  if new.org_id is distinct from old.org_id
     or new.entorno is distinct from old.entorno
     or new.tipo_dte is distinct from old.tipo_dte
     or new.folio_desde is distinct from old.folio_desde
     or new.folio_hasta is distinct from old.folio_hasta
     or new.fecha_autorizacion is distinct from old.fecha_autorizacion
     or new.huella_sha256 is distinct from old.huella_sha256
     or new.caf_enc is distinct from old.caf_enc then
    raise exception 'fiscal_sii_cafs: la identidad de un CAF no se modifica';
  end if;
  if new.folio_siguiente < old.folio_siguiente then
    raise exception 'fiscal_sii_cafs: un folio usado no se reutiliza';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_fiscal_sii_caf_guardas on fiscal_sii_cafs;
create trigger trg_fiscal_sii_caf_guardas
  before insert or update or delete on fiscal_sii_cafs
  for each row execute function cord_fiscal_sii_caf_guardas();

alter table fiscal_sii_cafs enable row level security;
drop policy if exists "rls_fiscal_sii_cafs" on fiscal_sii_cafs;
create policy "rls_fiscal_sii_cafs" on fiscal_sii_cafs
  using (org_id = nullif(current_setting('app.org_id', true), '')::uuid)
  with check (org_id = nullif(current_setting('app.org_id', true), '')::uuid);
alter table fiscal_sii_cafs force row level security;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'cord_app') then
    grant select, insert, update, delete on fiscal_sii_cafs to cord_app;
  end if;
end
$$;
-- END sii

-- ── DIAN: factura electrónica de venta de Colombia (oct 2026) ───────────────
-- Riel `dian` de los rieles fiscales de LatAm (src/lib/fiscal/latam/dian/):
-- validación previa directa ante la DIAN con software propio del facturador.
-- Lo que el marco común (fiscal_rail_*) no guarda y la DIAN exige conservar:
-- el XML FIRMADO exactamente como se envió y el ApplicationResponse con que la
-- DIAN lo validó. Con ambos se arma el contenedor (AttachedDocument) que se le
-- entrega al adquiriente, y son el documento legal que el facturador debe
-- conservar. Uno por intento enviado; se escribe ANTES de enviar.
create table if not exists dian_documentos (
  intento_id     uuid        primary key references fiscal_rail_comprobantes(id) on delete cascade,
  org_id         uuid        not null references orgs(id) on delete cascade,
  documento_id   uuid        not null references documentos_fiscales(id) on delete cascade,
  entorno        text        not null,
  nombre_xml     text        not null,
  xml_firmado    text        not null,
  xml_sha256     text        not null,
  respuesta_xml  text,
  validado_fecha date,
  validado_hora  text,
  created_at     timestamptz not null default now(),
  check (entorno in ('homologacion', 'produccion'))
);
create index if not exists idx_dian_documentos_documento on dian_documentos (org_id, documento_id);

-- Lo firmado no se reescribe: el XML, su nombre y su intento son inmutables;
-- la respuesta de la DIAN se une UNA vez y queda. Un documento validado no se
-- borra a mano (el borrado en cascada de la organización sí pasa).
create or replace function cord_dian_documento_inmutable()
returns trigger
language plpgsql
as $$
begin
  if TG_OP = 'DELETE' then
    if old.respuesta_xml is not null and pg_trigger_depth() <= 1 then
      raise exception 'dian_documentos: un documento validado por la DIAN no se borra'
        using errcode = 'restrict_violation';
    end if;
    return old;
  end if;
  if new.intento_id is distinct from old.intento_id
     or new.org_id is distinct from old.org_id
     or new.documento_id is distinct from old.documento_id
     or new.entorno is distinct from old.entorno
     or new.nombre_xml is distinct from old.nombre_xml
     or new.xml_firmado is distinct from old.xml_firmado
     or new.xml_sha256 is distinct from old.xml_sha256
     or new.created_at is distinct from old.created_at then
    raise exception 'dian_documentos: el documento firmado no se modifica';
  end if;
  if old.respuesta_xml is not null and new.respuesta_xml is distinct from old.respuesta_xml then
    raise exception 'dian_documentos: la respuesta de la DIAN es definitiva';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_dian_documento_inmutable on dian_documentos;
create trigger trg_dian_documento_inmutable
  before update or delete on dian_documentos
  for each row execute function cord_dian_documento_inmutable();

alter table dian_documentos enable row level security;
drop policy if exists "rls_dian_documentos" on dian_documentos;
create policy "rls_dian_documentos" on dian_documentos
  using (org_id = nullif(current_setting('app.org_id', true), '')::uuid)
  with check (org_id = nullif(current_setting('app.org_id', true), '')::uuid);
alter table dian_documentos force row level security;

-- Del cliente: lo que la DIAN exige del adquiriente y Cord no puede deducir de
-- su identificación (src/lib/fiscal/latam/dian/comprobante.ts,
-- resolverAdquiriente): tipo de documento (tabla 13.2.1), tipo de persona,
-- tributo (13.2.6.2) y responsabilidades fiscales (13.2.6.1). Nulo = sin
-- capturar: un cliente sin identificación se factura como consumidor final.
alter table clientes add column if not exists dian jsonb;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'cord_app') then
    grant select, insert, update, delete on dian_documentos to cord_app;
  end if;
end
$$;
-- END dian

-- ── Redondeo del impuesto por documento (oct 2026) ──────────────────────────
-- Con qué regla se calcularon los totales GUARDADOS de una cotización (opción
-- `taxRounding` del motor, packages/elements/src/engine.ts): 'line' (cada
-- concepto redondea su impuesto y el documento los suma; CFDI, Verifactu) o
-- 'document' (por tasa, round(Σ bases × tasa); la regla del DTE chileno).
-- Se fija con el país del emisor (src/lib/countries.ts, taxRoundingFor) al
-- crear o editar, y todo recálculo posterior —link público, aprobación
-- parcial, factura desde la cotización— usa el guardado: un documento no
-- cambia de aritmética por debajo. Nulo = 'line', la regla con la que se
-- guardaron todas las cotizaciones anteriores. Las facturas no la necesitan:
-- un borrador se recalcula entero al guardarse y una emitida no se recalcula
-- (su snapshot manda).
alter table cotizaciones add column if not exists tax_rounding text check (tax_rounding in ('line', 'document'));
-- END redondeo-impuesto

-- ── Factura electrónica entre empresarios: solución pública de la AEAT (oct 2026)
-- Ley 56/2007, art. 2 bis; RD 238/2026; Orden HAC/1028/2026 (BOE-A-2026-20587).
-- Cord envía la factura ORIGINAL por la solución pública (SPFE) como medio de
-- interconexión y comunica el cobro o el impago desde sus cobros reales
-- (src/lib/fiscal/spfe/). Nace apagado: la AEAT todavía no publicó el WSDL ni
-- los esquemas del servicio, y la pantalla dice "Próximamente". Contrato en
-- docs/estado/cobros-facturacion.md, sección "Factura electrónica entre
-- empresarios (solución pública de la AEAT)".
--
-- Cada mensaje hacia la SPFE (factura, baja, cobro, impago y sus
-- cancelaciones), con su máquina de estados:
--   pendiente → admitido | rechazado | incierto | descartado
--   incierto  → admitido | descartado   (solo tras CONSULTAR a la SPFE)
-- `orden` serializa los mensajes de cada factura: dos procesos que calculan el
-- siguiente compiten por el mismo número y gana uno (sin advisory locks: el
-- driver HTTP de Neon no los sostiene). `enviado_at` se marca ANTES de enviar;
-- un mensaje que salió y no tuvo respuesta nunca se reenvía: se consulta.
create table if not exists spfe_mensajes (
  id             uuid        default gen_random_uuid() primary key,
  org_id         uuid        not null references orgs(id) on delete cascade,
  documento_id   uuid        not null references documentos_fiscales(id) on delete cascade,
  entorno        text        not null,
  orden          int         not null,
  tipo           text        not null,
  codigo_unico   text        not null,
  estado         text        not null default 'pendiente',
  xml            text        not null,
  xml_sha256     text        not null,
  datos          jsonb       not null default '{}'::jsonb,
  respuesta      jsonb,
  csv            text,
  localizador    text,
  error_codigo   text,
  error_mensaje  text,
  intentos       int         not null default 0,
  created_at     timestamptz not null default now(),
  enviado_at     timestamptz,
  consultado_at  timestamptz,
  resuelto_at    timestamptz,
  unique (documento_id, entorno, orden),
  check (entorno in ('pruebas', 'produccion')),
  check (tipo in ('alta', 'baja', 'cobro', 'anula_cobro', 'impago', 'anula_impago')),
  check (estado in ('pendiente', 'incierto', 'admitido', 'rechazado', 'descartado')),
  check (orden > 0)
);
create unique index if not exists uq_spfe_mensajes_alta_viva
  on spfe_mensajes (documento_id, entorno)
  where tipo = 'alta' and estado in ('pendiente', 'incierto', 'admitido');
create index if not exists idx_spfe_mensajes_por_resolver
  on spfe_mensajes (org_id, created_at)
  where estado in ('pendiente', 'incierto');
create index if not exists idx_spfe_mensajes_documento on spfe_mensajes (org_id, documento_id);

-- Lo enviado no se reescribe: la identidad y el XML son inmutables desde el
-- insert, admitido/rechazado/descartado son finales y un incierto solo se
-- resuelve consultando. El borrado en cascada de la organización o del
-- documento sí pasa (profundidad de trigger > 1).
create or replace function cord_spfe_mensaje_inmutable()
returns trigger
language plpgsql
as $$
begin
  if TG_OP = 'DELETE' then
    if old.estado = 'admitido' and pg_trigger_depth() <= 1 then
      raise exception 'spfe_mensajes: un mensaje admitido por la solución pública no se borra'
        using errcode = 'restrict_violation';
    end if;
    return old;
  end if;
  if new.org_id is distinct from old.org_id
     or new.documento_id is distinct from old.documento_id
     or new.entorno is distinct from old.entorno
     or new.orden is distinct from old.orden
     or new.tipo is distinct from old.tipo
     or new.codigo_unico is distinct from old.codigo_unico
     or new.xml is distinct from old.xml
     or new.xml_sha256 is distinct from old.xml_sha256
     or new.datos is distinct from old.datos
     or new.created_at is distinct from old.created_at then
    raise exception 'spfe_mensajes: la identidad y el contenido de un mensaje no se modifican';
  end if;
  if old.estado in ('admitido', 'rechazado', 'descartado') and new is distinct from old then
    raise exception 'spfe_mensajes: admitido, rechazado y descartado son estados finales';
  end if;
  if old.estado = 'incierto' and new.estado in ('pendiente', 'rechazado') then
    raise exception 'spfe_mensajes: un mensaje incierto solo se resuelve consultando a la solución pública';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_spfe_mensaje_inmutable on spfe_mensajes;
create trigger trg_spfe_mensaje_inmutable
  before update or delete on spfe_mensajes
  for each row execute function cord_spfe_mensaje_inmutable();

-- Lo que el DESTINATARIO comunicó a la SPFE (pago completo o rechazo y sus
-- cancelaciones, Anexo II), tal como lo devuelve la consulta. Solo se agrega:
-- el estado vigente es la observación más reciente.
create table if not exists spfe_estados_destinatario (
  id            uuid        default gen_random_uuid() primary key,
  org_id        uuid        not null references orgs(id) on delete cascade,
  documento_id  uuid        not null references documentos_fiscales(id) on delete cascade,
  entorno       text        not null,
  codigo        text        not null,
  fecha         date        not null,
  motivo        text,
  vencimiento   date,
  recibido_at   timestamptz not null default now(),
  unique (documento_id, entorno, codigo, fecha),
  check (entorno in ('pruebas', 'produccion')),
  check (codigo in ('PAYMENT', 'CANCELPAYMENT', 'REJECTION', 'CANCELREJECTION')),
  check (motivo is null or motivo in ('01', '02'))
);
create index if not exists idx_spfe_estados_destinatario_documento on spfe_estados_destinatario (org_id, documento_id);

-- Estado de la cola por organización y entorno: un solo proceso en vuelo
-- (lease), la pausa tras un rechazo de la petición, la próxima consulta de
-- estados y desde cuándo entra cada factura (`activado_at`: las emitidas antes
-- de que el riel se encendiera no se envían de golpe).
create table if not exists spfe_envio_estado (
  org_id              uuid        not null references orgs(id) on delete cascade,
  entorno             text        not null,
  activado_at         timestamptz not null default now(),
  lease_hasta         timestamptz,
  lease_token         text,
  proximo_envio_at    timestamptz,
  proxima_consulta_at timestamptz,
  ultimo_envio_at     timestamptz,
  ultimo_error        text,
  updated_at          timestamptz not null default now(),
  primary key (org_id, entorno),
  check (entorno in ('pruebas', 'produccion'))
);

alter table spfe_mensajes enable row level security;
drop policy if exists "rls_spfe_mensajes" on spfe_mensajes;
create policy "rls_spfe_mensajes" on spfe_mensajes
  using (org_id = nullif(current_setting('app.org_id', true), '')::uuid)
  with check (org_id = nullif(current_setting('app.org_id', true), '')::uuid);
alter table spfe_mensajes force row level security;

alter table spfe_estados_destinatario enable row level security;
drop policy if exists "rls_spfe_estados_destinatario" on spfe_estados_destinatario;
create policy "rls_spfe_estados_destinatario" on spfe_estados_destinatario
  using (org_id = nullif(current_setting('app.org_id', true), '')::uuid)
  with check (org_id = nullif(current_setting('app.org_id', true), '')::uuid);
alter table spfe_estados_destinatario force row level security;

alter table spfe_envio_estado enable row level security;
drop policy if exists "rls_spfe_envio_estado" on spfe_envio_estado;
create policy "rls_spfe_envio_estado" on spfe_envio_estado
  using (org_id = nullif(current_setting('app.org_id', true), '')::uuid)
  with check (org_id = nullif(current_setting('app.org_id', true), '')::uuid);
alter table spfe_envio_estado force row level security;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'cord_app') then
    grant select, insert, update, delete on spfe_mensajes to cord_app;
    grant select, insert, update, delete on spfe_estados_destinatario to cord_app;
    grant select, insert, update, delete on spfe_envio_estado to cord_app;
  end if;
end
$$;
-- END spfe

-- ── Chile: nota de débito, set de pruebas e intercambio con el SII (oct 2026) ──
-- Lo que le faltaba al riel del SII (src/lib/fiscal/latam/sii/) para que un
-- negocio complete la certificación ante el SII con Cord:
--
-- Nota de débito (DTE 56): un documento del ciclo de la factura EXCLUSIVO del
-- riel del SII (`document_type = 'sii_debit_note'`, rieles.ts), como la nota
-- de crédito es de cada riel. `nota_debito_de` apunta al documento que
-- modifica (factura, nota de crédito o débito); es una cuenta por cobrar
-- propia y no reserva saldo del original. Nulo en todo documento de otro país.
alter table documentos_fiscales add column if not exists nota_debito_de uuid references documentos_fiscales(id) on delete set null;
create index if not exists idx_documentos_fiscales_nota_debito_de
  on documentos_fiscales (org_id, nota_debito_de) where nota_debito_de is not null;

-- Folios (CAF) de nota de débito: la restricción de tipos se reemplaza con nombre propio.
alter table fiscal_sii_cafs drop constraint if exists fiscal_sii_cafs_tipo_dte_check;
alter table fiscal_sii_cafs add constraint chk_fiscal_sii_cafs_tipo_dte check (tipo_dte in (33, 34, 56, 61));

-- Set de pruebas del SII: el que el negocio recibe al postular, cargado tal
-- cual y armado por Cord caso por caso (set-pruebas.ts). Una fila por set y
-- por intento de envío; un reenvío es otra fila (con folios nuevos: el SII
-- rechaza un folio repetido). Solo en el ambiente de certificación: los
-- documentos del set nunca son documentos_fiscales ni tocan la numeración de
-- producción. `documentos` guarda cada DTE firmado con su folio y receptor,
-- de donde salen las muestras impresas.
create table if not exists fiscal_sii_sets (
  id               uuid        default gen_random_uuid() primary key,
  org_id           uuid        not null references orgs(id) on delete cascade,
  entorno          text        not null default 'homologacion',
  numero_atencion  text        not null,
  nombre           text        not null,
  texto            text        not null,
  casos            jsonb       not null,
  estado           text        not null default 'cargado',
  documentos       jsonb,
  envio_xml        text,
  track_id         text,
  respuesta        jsonb,
  error_mensaje    text,
  creado_por       uuid,
  created_at       timestamptz not null default now(),
  enviado_at       timestamptz,
  updated_at       timestamptz not null default now(),
  check (entorno = 'homologacion'),
  check (estado in ('cargado', 'enviando', 'enviado', 'incierto', 'aceptado', 'reparos', 'rechazado')),
  check (numero_atencion ~ '^[0-9]{1,12}$'),
  check (length(texto) <= 200000)
);
create index if not exists idx_fiscal_sii_sets_org
  on fiscal_sii_sets (org_id, numero_atencion, created_at desc);

alter table fiscal_sii_sets enable row level security;
drop policy if exists "rls_fiscal_sii_sets" on fiscal_sii_sets;
create policy "rls_fiscal_sii_sets" on fiscal_sii_sets
  using (org_id = nullif(current_setting('app.org_id', true), '')::uuid)
  with check (org_id = nullif(current_setting('app.org_id', true), '')::uuid);
alter table fiscal_sii_sets force row level security;

-- Intercambio entre contribuyentes, del lado del receptor: la casilla de la
-- organización (un token por organización: `<token>@<dominio de intercambio>`),
-- los envíos de DTE que llegaron de un proveedor, cada DTE con su estado de
-- recepción y la decisión comercial, y las respuestas firmadas que se le
-- devolvieron (RespuestaDTE de recepción y de resultado, EnvioRecibos). Todo
-- por organización, con RLS forzada. El archivo recibido se guarda tal cual:
-- es la evidencia de lo que llegó.
create table if not exists fiscal_sii_buzones (
  org_id      uuid        primary key references orgs(id) on delete cascade,
  token       text        not null unique,
  created_at  timestamptz not null default now(),
  check (token ~ '^[a-z0-9]{24,40}$')
);

alter table fiscal_sii_buzones enable row level security;
drop policy if exists "rls_fiscal_sii_buzones" on fiscal_sii_buzones;
create policy "rls_fiscal_sii_buzones" on fiscal_sii_buzones
  using (org_id = nullif(current_setting('app.org_id', true), '')::uuid)
  with check (org_id = nullif(current_setting('app.org_id', true), '')::uuid);
alter table fiscal_sii_buzones force row level security;

-- El correo entrante no sabe de qué organización es: la casilla la resuelve
-- esta función acotada y el trabajo vuelve a withOrgTx con ese id (regla 30).
create or replace function cord_sii_buzon_org(p_token text)
returns uuid
language sql stable security definer
set search_path = public, pg_temp
as $$
  select b.org_id from fiscal_sii_buzones b
   where p_token is not null and length(p_token) between 24 and 40
     and b.token = lower(p_token)
   limit 1
$$;

revoke all on function cord_sii_buzon_org(text) from public;

create table if not exists fiscal_sii_recepciones (
  id                uuid        default gen_random_uuid() primary key,
  org_id            uuid        not null references orgs(id) on delete cascade,
  entorno           text        not null,
  cod_envio         bigint      generated always as identity,
  origen            text        not null,
  remitente         text,
  nombre_archivo    text,
  sha256            text        not null,
  xml               text        not null,
  set_id            text,
  digest            text,
  rut_emisor        text,
  rut_envia         text,
  rut_receptor      text,
  estado_recep_env  smallint    not null,
  glosa             text        not null,
  recibido_at       timestamptz not null default now(),
  unique (org_id, sha256),
  check (entorno in ('homologacion', 'produccion')),
  check (origen in ('correo', 'manual')),
  check (estado_recep_env in (0, 1, 2, 3, 90, 91, 99))
);
create index if not exists idx_fiscal_sii_recepciones_org
  on fiscal_sii_recepciones (org_id, recibido_at desc);

create table if not exists fiscal_sii_dte_recibidos (
  id                  uuid        default gen_random_uuid() primary key,
  org_id              uuid        not null references orgs(id) on delete cascade,
  recepcion_id        uuid        not null references fiscal_sii_recepciones(id) on delete cascade,
  tipo_dte            smallint    not null,
  folio               bigint      not null,
  fecha_emision       date        not null,
  rut_emisor          text        not null,
  razon_social_emisor text,
  correo_emisor       text,
  rut_receptor        text        not null,
  monto_total         bigint      not null,
  monto_neto          bigint,
  monto_exento        bigint,
  iva                 bigint,
  dte_xml             text        not null,
  estado_recep_dte    smallint    not null,
  glosa_recep         text        not null,
  resultado           text,
  resultado_motivo    text,
  resultado_at        timestamptz,
  recinto             text,
  recibo_at           timestamptz,
  reclamo_accion      text,
  reclamo_codigo      int,
  reclamo_mensaje     text,
  reclamo_at          timestamptz,
  created_at          timestamptz not null default now(),
  check (estado_recep_dte in (0, 1, 2, 3, 4, 99)),
  check (resultado is null or resultado in ('aceptado', 'aceptado_reparos', 'rechazado')),
  check (resultado is null or estado_recep_dte = 0),
  check (reclamo_accion is null or reclamo_accion in ('ACD', 'RCD', 'ERM', 'RFP', 'RFT'))
);
-- Un mismo DTE (emisor, tipo, folio) se recibe una sola vez: el segundo es "DTE Repetido" (estado 4).
create unique index if not exists uq_fiscal_sii_dte_recibidos_documento
  on fiscal_sii_dte_recibidos (org_id, rut_emisor, tipo_dte, folio) where estado_recep_dte = 0;
create index if not exists idx_fiscal_sii_dte_recibidos_recepcion
  on fiscal_sii_dte_recibidos (org_id, recepcion_id);

-- Lo recibido no se reescribe: el documento, su identidad y su estado de
-- recepción son evidencia, y la decisión comercial se toma UNA vez (la
-- aceptación o el reclamo ya viajaron al emisor y al SII).
create or replace function cord_fiscal_sii_dte_recibido_guardas()
returns trigger
language plpgsql
as $$
begin
  if new.dte_xml is distinct from old.dte_xml
     or new.tipo_dte is distinct from old.tipo_dte
     or new.folio is distinct from old.folio
     or new.rut_emisor is distinct from old.rut_emisor
     or new.rut_receptor is distinct from old.rut_receptor
     or new.monto_total is distinct from old.monto_total
     or new.estado_recep_dte is distinct from old.estado_recep_dte
     or new.recepcion_id is distinct from old.recepcion_id
     or new.org_id is distinct from old.org_id then
    raise exception 'fiscal_sii_dte_recibidos: un DTE recibido no se modifica';
  end if;
  if old.resultado is not null and new.resultado is distinct from old.resultado then
    raise exception 'fiscal_sii_dte_recibidos: la decisión sobre un DTE recibido no cambia';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_fiscal_sii_dte_recibido_guardas on fiscal_sii_dte_recibidos;
create trigger trg_fiscal_sii_dte_recibido_guardas
  before update on fiscal_sii_dte_recibidos
  for each row execute function cord_fiscal_sii_dte_recibido_guardas();

create sequence if not exists fiscal_sii_respuesta_seq;

create table if not exists fiscal_sii_respuestas (
  id            uuid        default gen_random_uuid() primary key,
  org_id        uuid        not null references orgs(id) on delete cascade,
  recepcion_id  uuid        not null references fiscal_sii_recepciones(id) on delete cascade,
  tipo          text        not null,
  id_respuesta  bigint      not null,
  xml           text        not null,
  destinatario  text,
  enviado_at    timestamptz,
  error_envio   text,
  created_at    timestamptz not null default now(),
  check (tipo in ('recepcion', 'resultado', 'recibos'))
);
create index if not exists idx_fiscal_sii_respuestas_recepcion
  on fiscal_sii_respuestas (org_id, recepcion_id, created_at);

alter table fiscal_sii_recepciones enable row level security;
drop policy if exists "rls_fiscal_sii_recepciones" on fiscal_sii_recepciones;
create policy "rls_fiscal_sii_recepciones" on fiscal_sii_recepciones
  using (org_id = nullif(current_setting('app.org_id', true), '')::uuid)
  with check (org_id = nullif(current_setting('app.org_id', true), '')::uuid);
alter table fiscal_sii_recepciones force row level security;

alter table fiscal_sii_dte_recibidos enable row level security;
drop policy if exists "rls_fiscal_sii_dte_recibidos" on fiscal_sii_dte_recibidos;
create policy "rls_fiscal_sii_dte_recibidos" on fiscal_sii_dte_recibidos
  using (org_id = nullif(current_setting('app.org_id', true), '')::uuid)
  with check (org_id = nullif(current_setting('app.org_id', true), '')::uuid);
alter table fiscal_sii_dte_recibidos force row level security;

alter table fiscal_sii_respuestas enable row level security;
drop policy if exists "rls_fiscal_sii_respuestas" on fiscal_sii_respuestas;
create policy "rls_fiscal_sii_respuestas" on fiscal_sii_respuestas
  using (org_id = nullif(current_setting('app.org_id', true), '')::uuid)
  with check (org_id = nullif(current_setting('app.org_id', true), '')::uuid);
alter table fiscal_sii_respuestas force row level security;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'cord_app') then
    grant select, insert, update, delete on fiscal_sii_sets, fiscal_sii_buzones, fiscal_sii_recepciones, fiscal_sii_dte_recibidos, fiscal_sii_respuestas to cord_app;
    grant usage, select on sequence fiscal_sii_respuesta_seq to cord_app;
    grant usage, select on sequence fiscal_sii_recepciones_cod_envio_seq to cord_app;
    grant execute on function cord_sii_buzon_org(text) to cord_app;
  end if;
end
$$;
-- END sii-certificacion

-- ── Sales tax de EE. UU. calculado por la dirección del cliente (oct 2026) ──
-- Cord sembraba solo la tasa ESTATAL mínima (`usStateTaxPresets`): un negocio
-- en Los Ángeles cobraba 7.25 % donde la tasa combinada de estado + condado +
-- ciudad + distritos es ~9.5 %. Con `us_tax_auto` encendido, la tasa de cada
-- línea de un documento para un cliente en EE. UU. sale de un cálculo real por
-- su dirección (src/lib/us-tax/), hecho EN LA CUENTA DE COBROS del negocio:
-- el negocio es quien recauda y declara, no Cord. Nace apagado.
--
-- `us_tax_origen` es el domicilio del negocio (dirección completa) y
-- `us_tax_codigo` la clasificación de lo que vende (código de producto del
-- proveedor). `us_tax_estado` guarda la última sincronización: lo que falta,
-- tal como lo reporta el proveedor, para que Ajustes lo diga sin adivinar.
alter table orgs add column if not exists us_tax_auto boolean not null default false;
alter table orgs add column if not exists us_tax_origen jsonb;
alter table orgs add column if not exists us_tax_codigo text;
alter table orgs add column if not exists us_tax_estado jsonb;

-- Estados donde el negocio está registrado para recaudar (nexus). Un estado
-- sin registro lleva 0 % legítimo y el documento lo dice. Un registro no se
-- borra: se da de BAJA (el proveedor tampoco permite borrarlo), porque los
-- cálculos ya hechos mientras estuvo vivo siguen siendo correctos.
create table if not exists us_tax_registros (
  id                      uuid        default gen_random_uuid() primary key,
  org_id                  uuid        not null references orgs(id) on delete cascade,
  estado                  text        not null,
  stripe_registration_id  text,
  activo_desde            timestamptz not null default now(),
  baja_at                 timestamptz,
  created_at              timestamptz not null default now(),
  constraint chk_us_tax_registros_estado check (estado ~ '^[A-Z]{2}$')
);
create unique index if not exists uq_us_tax_registros_vivo on us_tax_registros (org_id, estado) where baja_at is null;

-- Cada cálculo real, guardado. Es la ÚNICA fuente de una tasa calculada:
-- `taxCatalogFor()` acepta la tasa de una línea solo si viene de una fila de
-- aquí, de la misma organización y vigente (`expires_at`), nunca de lo que
-- mande el navegador. `huella` es el sha256 de lo que se calculó (divisa,
-- destino, exención, clasificación e importes por línea): si el documento ya
-- no coincide, se recalcula en vez de reusar una tasa de otro documento.
--
-- `lineas` lleva, por línea y en el mismo orden del documento, la tasa
-- EFECTIVA (impuesto / base del cálculo) y el desglose por jurisdicción. La
-- Tax Transaction (el registro para la declaración) se crea una sola vez por
-- cálculo: `transaccion_ref` es único y se reserva ANTES de llamar al
-- proveedor. `venta` es la venta que reclamó el cálculo ('cotizacion:<id>' o
-- 'documento:<id>'): una cotización y la factura que sale de ella son la misma
-- venta y comparten cálculo; dos documentos iguales del mismo día, no.
create table if not exists us_tax_calculos (
  id                     uuid        default gen_random_uuid() primary key,
  org_id                 uuid        not null references orgs(id) on delete cascade,
  stripe_calculation_id  text        not null,
  stripe_account_id      text        not null,
  huella                 text        not null,
  currency               text        not null,
  cliente_id             uuid        references clientes(id) on delete set null,
  destino                jsonb       not null,
  exento                 boolean     not null default false,
  incluido               boolean     not null default false,
  lineas                 jsonb       not null,
  amount_total           bigint      not null,
  tax_total              bigint      not null,
  expires_at             timestamptz not null,
  created_at             timestamptz not null default now(),
  venta                  text,
  transaccion_ref        text,
  transaccion_id         text,
  transaccion_at         timestamptz,
  transaccion_error      text,
  reverso_id             text,
  reverso_at             timestamptz,
  constraint chk_us_tax_calculos_currency check (currency ~ '^[A-Z]{3}$')
);
create unique index if not exists uq_us_tax_calculos_stripe on us_tax_calculos (org_id, stripe_calculation_id);
create unique index if not exists uq_us_tax_calculos_transaccion on us_tax_calculos (transaccion_ref) where transaccion_ref is not null;
create index if not exists idx_us_tax_calculos_huella on us_tax_calculos (org_id, huella, created_at desc);

-- El documento apunta a su cálculo, y la línea congela su desglose por
-- jurisdicción (lo que imprimen el PDF, /q y /i). `tax_rate` sigue siendo el
-- snapshot de la tasa (efectiva) de la línea, como en cualquier país.
alter table cotizaciones add column if not exists us_tax_calculo_id uuid references us_tax_calculos(id) on delete set null;
alter table documentos_fiscales add column if not exists us_tax_calculo_id uuid references us_tax_calculos(id) on delete set null;
alter table cotizacion_items add column if not exists tax_breakdown jsonb;

-- Cliente exento (reventa, organización sin fines de lucro, gobierno): la
-- exención exige su certificado — número, estado que lo expidió y vigencia.
-- Sin certificado no hay exención: un 0 % sin respaldo es una tasa inventada.
alter table clientes add column if not exists tax_exempt boolean not null default false;
alter table clientes add column if not exists tax_exempt_cert jsonb;

alter table us_tax_registros enable row level security;
alter table us_tax_registros force row level security;
drop policy if exists rls_us_tax_registros on us_tax_registros;
create policy rls_us_tax_registros on us_tax_registros
  using (org_id = nullif(current_setting('app.org_id', true), '')::uuid)
  with check (org_id = nullif(current_setting('app.org_id', true), '')::uuid);

alter table us_tax_calculos enable row level security;
alter table us_tax_calculos force row level security;
drop policy if exists rls_us_tax_calculos on us_tax_calculos;
create policy rls_us_tax_calculos on us_tax_calculos
  using (org_id = nullif(current_setting('app.org_id', true), '')::uuid)
  with check (org_id = nullif(current_setting('app.org_id', true), '')::uuid);

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'cord_app') then
    grant select, insert, update, delete on us_tax_registros to cord_app;
    grant select, insert, update, delete on us_tax_calculos to cord_app;
  end if;
end
$$;
-- END us-tax

-- ── Francia: emisión por plataforma autorizada (oct 2026)
-- Reforma de la facturación electrónica (CGI art. 289 bis y 290 A; DGFiP,
-- especificaciones externas v3.2). Cord EMITE las facturas entre empresas
-- francesas por la plataforma autorizada (PA) del negocio, reporta las
-- operaciones con particulares y con el extranjero (e-reporting) y comunica lo
-- cobrado cuando la TVA es exigible al cobro (estado 212 "Encaissée" o
-- e-reporting de pagos). Solo emisión: la recepción la lleva la plataforma de
-- recepción que el negocio ya tenga. Nace apagado (IOPOLE_ENABLED) y el
-- proveedor de transmisión es intercambiable (src/lib/fiscal/transmision/).
-- Contrato en docs/estado/cobros-facturacion.md, sección "Francia: emisión por
-- plataforma autorizada".
--
-- Menciones nuevas que el documento congela: la dirección de entrega de los
-- bienes (BG-15, si difiere de la del cliente) y si cada producto es un bien o
-- un servicio (categoría de la operación, BT-23).
alter table documentos_fiscales add column if not exists delivery_address jsonb;
alter table productos add column if not exists naturaleza text check (naturaleza in ('goods', 'services'));

-- El alta del negocio en la plataforma (enrollment): una viva por organización,
-- proveedor y entorno. `solicitado_at` se marca ANTES de llamar; un alta sin
-- respuesta (incierto) se resuelve CONSULTANDO por SIREN, nunca repitiendo la
-- creación (la API crea una nueva en cada llamada).
create table if not exists pa_altas (
  id             uuid        default gen_random_uuid() primary key,
  org_id         uuid        not null references orgs(id) on delete cascade,
  proveedor      text        not null,
  entorno        text        not null,
  siren          text        not null,
  estado         text        not null default 'solicitando',
  etapa          text,
  etapa_at       timestamptz,
  alta_id        text,
  entidad_id     text,
  enlace         text,
  regimen_tva    text        not null,
  datos          jsonb       not null default '{}'::jsonb,
  error_mensaje  text,
  solicitado_at  timestamptz,
  consultado_at  timestamptz,
  completada_at  timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  check (proveedor in ('iopole')),
  check (entorno in ('preproduccion', 'produccion')),
  check (estado in ('solicitando', 'incierto', 'en_curso', 'accion_requerida', 'completada', 'cancelada', 'rechazada', 'descartada')),
  check (siren ~ '^[0-9]{9}$'),
  check (regimen_tva in ('reel_mensuel', 'reel_trimestriel', 'simplifie', 'franchise'))
);
create unique index if not exists uq_pa_altas_viva
  on pa_altas (org_id, proveedor, entorno)
  where estado not in ('cancelada', 'rechazada', 'descartada');
create unique index if not exists uq_pa_altas_proveedor
  on pa_altas (proveedor, entorno, alta_id)
  where alta_id is not null;

-- Lo que Cord comunica a la plataforma, con su máquina de estados:
--   pendiente → aceptado | rechazado | incierto | descartado
--   incierto  → aceptado | descartado   (solo tras CONSULTAR a la plataforma)
--   aceptado  → rechazado              (rechazo asíncrono del e-reporting)
-- `clave` es la idempotencia: un intento vivo por clave (la factura, el cobro,
-- el día de e-reporting). `enviado_at` se marca ANTES de enviar; un envío que
-- salió sin respuesta nunca se repite: se consulta o queda a la vista.
create table if not exists pa_envios (
  id              uuid        default gen_random_uuid() primary key,
  org_id          uuid        not null references orgs(id) on delete cascade,
  documento_id    uuid        references documentos_fiscales(id) on delete cascade,
  proveedor       text        not null,
  entorno         text        not null,
  tipo            text        not null,
  clave           text        not null,
  estado          text        not null default 'pendiente',
  siren           text        not null,
  numero          text,
  datos           jsonb       not null default '{}'::jsonb,
  archivo         bytea,
  archivo_sha256  text,
  periodo         text,
  fecha_operacion date,
  fecha_limite    date,
  id_proveedor    text,
  respuesta       jsonb,
  error_codigo    text,
  error_mensaje   text,
  intentos        int         not null default 0,
  created_at      timestamptz not null default now(),
  enviado_at      timestamptz,
  consultado_at   timestamptz,
  resuelto_at     timestamptz,
  confirmado_at   timestamptz,
  check (proveedor in ('iopole')),
  check (entorno in ('preproduccion', 'produccion')),
  check (tipo in ('factura', 'cobro', 'reporte_factura', 'reporte_transacciones', 'reporte_pago_factura', 'reporte_pago_transacciones')),
  check (estado in ('pendiente', 'incierto', 'aceptado', 'rechazado', 'descartado')),
  check (tipo = 'reporte_transacciones' or tipo = 'reporte_pago_transacciones' or documento_id is not null)
);
create unique index if not exists uq_pa_envios_vivo
  on pa_envios (org_id, entorno, clave)
  where estado in ('pendiente', 'incierto', 'aceptado');
create unique index if not exists uq_pa_envios_proveedor
  on pa_envios (proveedor, entorno, id_proveedor)
  where id_proveedor is not null;
create index if not exists idx_pa_envios_por_resolver
  on pa_envios (org_id, created_at)
  where estado in ('pendiente', 'incierto');
create index if not exists idx_pa_envios_documento on pa_envios (org_id, documento_id);

-- Lo enviado no se reescribe: identidad y contenido son inmutables desde el
-- insert, rechazado y descartado son finales y un incierto solo se resuelve
-- consultando. El borrado en cascada de la organización o del documento sí
-- pasa (profundidad de trigger > 1).
create or replace function cord_pa_envio_inmutable()
returns trigger
language plpgsql
as $$
begin
  if TG_OP = 'DELETE' then
    if old.estado = 'aceptado' and pg_trigger_depth() <= 1 then
      raise exception 'pa_envios: un envío aceptado por la plataforma no se borra'
        using errcode = 'restrict_violation';
    end if;
    return old;
  end if;
  if new.org_id is distinct from old.org_id
     or new.documento_id is distinct from old.documento_id
     or new.proveedor is distinct from old.proveedor
     or new.entorno is distinct from old.entorno
     or new.tipo is distinct from old.tipo
     or new.clave is distinct from old.clave
     or new.siren is distinct from old.siren
     or new.numero is distinct from old.numero
     or new.datos is distinct from old.datos
     or new.archivo is distinct from old.archivo
     or new.archivo_sha256 is distinct from old.archivo_sha256
     or new.created_at is distinct from old.created_at then
    raise exception 'pa_envios: la identidad y el contenido de un envío no se modifican';
  end if;
  if old.estado in ('rechazado', 'descartado') and new is distinct from old then
    raise exception 'pa_envios: rechazado y descartado son estados finales';
  end if;
  if old.estado = 'aceptado' and new.estado not in ('aceptado', 'rechazado') then
    raise exception 'pa_envios: un envío aceptado solo puede pasar a rechazado';
  end if;
  if old.estado = 'incierto' and new.estado in ('pendiente', 'rechazado') then
    raise exception 'pa_envios: un envío incierto solo se resuelve consultando a la plataforma';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_pa_envio_inmutable on pa_envios;
create trigger trg_pa_envio_inmutable
  before update or delete on pa_envios
  for each row execute function cord_pa_envio_inmutable();

-- Los estados del ciclo de vida que la plataforma notifica de cada factura
-- (200 Déposée … 213 Rejetée), tal como llegan por el webhook verificado o
-- por la consulta de un envío incierto. Solo se agregan; el vigente es el más
-- reciente. `estado_id` es el del proveedor: un webhook repetido no duplica.
create table if not exists pa_estados (
  id                uuid        default gen_random_uuid() primary key,
  org_id            uuid        not null references orgs(id) on delete cascade,
  documento_id      uuid        not null references documentos_fiscales(id) on delete cascade,
  envio_id          uuid        references pa_envios(id) on delete set null,
  proveedor         text        not null,
  entorno           text        not null,
  estado_id         text        not null,
  codigo            text,
  codigo_proveedor  text        not null,
  fecha             timestamptz not null,
  motivo            text,
  detalle           jsonb,
  recibido_at       timestamptz not null default now(),
  check (proveedor in ('iopole')),
  check (entorno in ('preproduccion', 'produccion')),
  check (codigo is null or codigo ~ '^[0-9]{3}$')
);
create unique index if not exists uq_pa_estados_proveedor on pa_estados (proveedor, entorno, estado_id);
create index if not exists idx_pa_estados_documento on pa_estados (org_id, documento_id, fecha desc);

-- Estado de la cola por organización y entorno: un solo proceso en vuelo
-- (lease), la pausa tras un rechazo de la petición (credenciales, permisos) y
-- lo que la última pasada no pudo transmitir y necesita al negocio.
create table if not exists pa_cola (
  org_id            uuid        not null references orgs(id) on delete cascade,
  entorno           text        not null,
  lease_hasta       timestamptz,
  lease_token       text,
  proximo_envio_at  timestamptz,
  ultimo_envio_at   timestamptz,
  ultimo_error      text,
  bloqueados        jsonb       not null default '[]'::jsonb,
  updated_at        timestamptz not null default now(),
  primary key (org_id, entorno),
  check (entorno in ('preproduccion', 'produccion'))
);

alter table pa_altas enable row level security;
drop policy if exists "rls_pa_altas" on pa_altas;
create policy "rls_pa_altas" on pa_altas
  using (org_id = nullif(current_setting('app.org_id', true), '')::uuid)
  with check (org_id = nullif(current_setting('app.org_id', true), '')::uuid);
alter table pa_altas force row level security;

alter table pa_envios enable row level security;
drop policy if exists "rls_pa_envios" on pa_envios;
create policy "rls_pa_envios" on pa_envios
  using (org_id = nullif(current_setting('app.org_id', true), '')::uuid)
  with check (org_id = nullif(current_setting('app.org_id', true), '')::uuid);
alter table pa_envios force row level security;

alter table pa_estados enable row level security;
drop policy if exists "rls_pa_estados" on pa_estados;
create policy "rls_pa_estados" on pa_estados
  using (org_id = nullif(current_setting('app.org_id', true), '')::uuid)
  with check (org_id = nullif(current_setting('app.org_id', true), '')::uuid);
alter table pa_estados force row level security;

alter table pa_cola enable row level security;
drop policy if exists "rls_pa_cola" on pa_cola;
create policy "rls_pa_cola" on pa_cola
  using (org_id = nullif(current_setting('app.org_id', true), '')::uuid)
  with check (org_id = nullif(current_setting('app.org_id', true), '')::uuid);
alter table pa_cola force row level security;

-- El webhook de la plataforma llega sin organización: estas funciones
-- resuelven SOLO a quién pertenece lo que notifica (regla 30) y el trabajo
-- vuelve a withOrgTx con ese id. Un id de la plataforma identifica, no
-- autoriza: la firma del webhook ya se verificó antes de llamarlas.
create or replace function cord_pa_org_de_alta(p_proveedor text, p_entorno text, p_alta_id text)
returns uuid
language sql stable security definer
set search_path = public, pg_temp
as $$
  select a.org_id from pa_altas a
   where p_alta_id is not null and a.proveedor = p_proveedor and a.entorno = p_entorno and a.alta_id = p_alta_id
   limit 1
$$;
revoke all on function cord_pa_org_de_alta(text, text, text) from public;

create or replace function cord_pa_envio_de_proveedor(p_proveedor text, p_entorno text, p_id text)
returns table(org_id uuid, envio_id uuid, documento_id uuid)
language sql stable security definer
set search_path = public, pg_temp
as $$
  select e.org_id, e.id, e.documento_id from pa_envios e
   where p_id is not null and e.proveedor = p_proveedor and e.entorno = p_entorno and e.id_proveedor = p_id
   limit 1
$$;
revoke all on function cord_pa_envio_de_proveedor(text, text, text) from public;

-- Una factura que salió sin respuesta todavía no tiene el id de la
-- plataforma: su primer estado la encuentra por el SIREN del emisor y su número.
create or replace function cord_pa_factura_por_numero(p_proveedor text, p_entorno text, p_siren text, p_numero text)
returns table(org_id uuid, envio_id uuid, documento_id uuid)
language sql stable security definer
set search_path = public, pg_temp
as $$
  select e.org_id, e.id, e.documento_id from pa_envios e
   where p_siren is not null and p_numero is not null
     and e.proveedor = p_proveedor and e.entorno = p_entorno and e.tipo = 'factura'
     and e.siren = p_siren and e.numero = p_numero and e.estado in ('pendiente', 'incierto', 'aceptado')
   order by e.created_at desc
   limit 1
$$;
revoke all on function cord_pa_factura_por_numero(text, text, text, text) from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'cord_app') then
    grant select, insert, update, delete on pa_altas to cord_app;
    grant select, insert, update, delete on pa_envios to cord_app;
    grant select, insert, update, delete on pa_estados to cord_app;
    grant select, insert, update, delete on pa_cola to cord_app;
    grant execute on function cord_pa_org_de_alta(text, text, text) to cord_app;
    grant execute on function cord_pa_envio_de_proveedor(text, text, text) to cord_app;
    grant execute on function cord_pa_factura_por_numero(text, text, text, text) to cord_app;
  end if;
end
$$;
-- END fr-pa

-- ── NF-e modelo 55: Brasil, venta de mercancías (oct 2026) ──────────────────
-- Espejo de db/deploy/2026-10-09-nfe.sql, que corre en cada build antes de
-- servir (scripts/migrate-facturacion.mjs).
--
-- Riel `nfe` de los rieles fiscales de LatAm (src/lib/fiscal/latam/nfe/):
-- autorización directa ante la SEFAZ del estado del emisor. La nota, su número
-- y su protocolo viven en fiscal_rail_comprobantes como en los demás rieles;
-- aquí va lo que la NF-e tiene y el marco común no: los eventos de una nota
-- autorizada (cancelación 110111 y Carta de Correção 110110), la inutilização
-- de números y la contingencia en la SEFAZ Virtual (SVC).
--
-- Eventos: uno por (chave, tipo, secuencia) vivo. Un evento rechazado no
-- consume la secuencia: el índice único lo deja fuera para poder repetirla.
create table if not exists nfe_eventos (
  id             uuid        default gen_random_uuid() primary key,
  org_id         uuid        not null references orgs(id) on delete cascade,
  comprobante_id uuid        not null references fiscal_rail_comprobantes(id) on delete cascade,
  documento_id   uuid        not null references documentos_fiscales(id) on delete cascade,
  entorno        text        not null,
  chave          text        not null,
  tp_evento      text        not null,
  n_seq          int         not null,
  estado         text        not null default 'pendiente',
  pedido         jsonb       not null,
  xml_evento     text,
  respuesta      jsonb,
  n_prot         text,
  proc_xml       text,
  error_codigo   text,
  error_mensaje  text,
  creado_por     uuid,
  created_at     timestamptz not null default now(),
  registrado_at  timestamptz,
  check (entorno in ('homologacion', 'produccion')),
  check (tp_evento in ('110111', '110110')),
  check (n_seq between 1 and 20),
  check (estado in ('pendiente', 'registrado', 'rechazado', 'incierto'))
);
create unique index if not exists uq_nfe_eventos_vivo
  on nfe_eventos (org_id, chave, tp_evento, n_seq)
  where estado <> 'rechazado';
create index if not exists idx_nfe_eventos_documento on nfe_eventos (org_id, documento_id);

-- Inutilização de un rango de la serie que nunca se usó [MOC 5.3].
create table if not exists nfe_inutilizacoes (
  id             uuid        default gen_random_uuid() primary key,
  org_id         uuid        not null references orgs(id) on delete cascade,
  entorno        text        not null,
  serie          int         not null,
  n_ini          bigint      not null,
  n_fin          bigint      not null,
  justificativa  text        not null,
  estado         text        not null default 'pendiente',
  pedido         jsonb       not null,
  xml_pedido     text,
  respuesta      jsonb,
  n_prot         text,
  proc_xml       text,
  error_codigo   text,
  error_mensaje  text,
  creado_por     uuid,
  created_at     timestamptz not null default now(),
  homologada_at  timestamptz,
  check (entorno in ('homologacion', 'produccion')),
  check (serie between 0 and 999),
  check (n_ini > 0 and n_fin >= n_ini and n_fin - n_ini < 10000),
  check (estado in ('pendiente', 'homologada', 'rechazada', 'incierta'))
);
create index if not exists idx_nfe_inutilizacoes_serie on nfe_inutilizacoes (org_id, entorno, serie);

-- Lo que la SEFAZ ya registró no se reescribe ni se borra a mano: un evento
-- registrado y una inutilização homologada son definitivos (el borrado en
-- cascada de la organización o del documento sí pasa).
create or replace function cord_nfe_registro_inmutable()
returns trigger
language plpgsql
as $$
begin
  if TG_OP = 'DELETE' then
    if old.estado in ('registrado', 'homologada') and pg_trigger_depth() <= 1 then
      raise exception '%: un registro de la SEFAZ no se borra', TG_TABLE_NAME
        using errcode = 'restrict_violation';
    end if;
    return old;
  end if;
  if old.estado in ('registrado', 'homologada') and new is distinct from old then
    raise exception '%: un registro de la SEFAZ es definitivo', TG_TABLE_NAME;
  end if;
  if new.pedido is distinct from old.pedido or new.org_id is distinct from old.org_id
     or new.entorno is distinct from old.entorno or new.created_at is distinct from old.created_at then
    raise exception '%: el pedido no se modifica', TG_TABLE_NAME;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_nfe_evento_inmutable on nfe_eventos;
create trigger trg_nfe_evento_inmutable
  before update or delete on nfe_eventos
  for each row execute function cord_nfe_registro_inmutable();

drop trigger if exists trg_nfe_inutilizacao_inmutable on nfe_inutilizacoes;
create trigger trg_nfe_inutilizacao_inmutable
  before update or delete on nfe_inutilizacoes
  for each row execute function cord_nfe_registro_inmutable();

-- Contingencia en la SEFAZ Virtual (SVC-AN o SVC-RS) [MOC Anexo III]: una
-- abierta por organización y entorno. La abre la emisión cuando la SEFAZ
-- normal no recibe el pedido y la SVC de su estado responde 107; se cierra
-- sola cuando la SEFAZ normal vuelve a responder 107. `dh_cont` y `x_just`
-- son los que viajan en cada nota emitida en contingencia.
create table if not exists nfe_contingencias (
  id             uuid        default gen_random_uuid() primary key,
  org_id         uuid        not null references orgs(id) on delete cascade,
  entorno        text        not null,
  uf             text        not null,
  svc            text        not null,
  dh_cont        text        not null,
  x_just         text        not null,
  motivo         text,
  iniciada_at    timestamptz not null default now(),
  verificada_at  timestamptz,
  encerrada_at   timestamptz,
  check (entorno in ('homologacion', 'produccion')),
  check (svc in ('SVC-AN', 'SVC-RS'))
);
create unique index if not exists uq_nfe_contingencias_abierta
  on nfe_contingencias (org_id, entorno)
  where encerrada_at is null;

alter table nfe_eventos enable row level security;
drop policy if exists "rls_nfe_eventos" on nfe_eventos;
create policy "rls_nfe_eventos" on nfe_eventos
  using (org_id = nullif(current_setting('app.org_id', true), '')::uuid)
  with check (org_id = nullif(current_setting('app.org_id', true), '')::uuid);
alter table nfe_eventos force row level security;

alter table nfe_inutilizacoes enable row level security;
drop policy if exists "rls_nfe_inutilizacoes" on nfe_inutilizacoes;
create policy "rls_nfe_inutilizacoes" on nfe_inutilizacoes
  using (org_id = nullif(current_setting('app.org_id', true), '')::uuid)
  with check (org_id = nullif(current_setting('app.org_id', true), '')::uuid);
alter table nfe_inutilizacoes force row level security;

alter table nfe_contingencias enable row level security;
drop policy if exists "rls_nfe_contingencias" on nfe_contingencias;
create policy "rls_nfe_contingencias" on nfe_contingencias
  using (org_id = nullif(current_setting('app.org_id', true), '')::uuid)
  with check (org_id = nullif(current_setting('app.org_id', true), '')::uuid);
alter table nfe_contingencias force row level security;

-- Datos de NF-e del catálogo y del cliente (src/lib/fiscal/latam/nfe/produto.ts):
-- del producto, NCM, CEST, CFOP, origen, unidad, GTIN y su régimen del ICMS,
-- IPI, PIS/COFINS e IBS/CBS; del cliente, número, barrio, municipio IBGE,
-- indicador de IE e IE. Solo se capturan con la NF-e activa (regla 15) y se
-- congelan en la línea del documento al guardar el borrador. Nulo = sin NF-e.
alter table productos add column if not exists nfe jsonb;
alter table clientes add column if not exists nfe jsonb;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'cord_app') then
    grant select, insert, update, delete on nfe_eventos to cord_app;
    grant select, insert, update, delete on nfe_inutilizacoes to cord_app;
    grant select, insert, update, delete on nfe_contingencias to cord_app;
  end if;
end
$$;
-- END nfe

-- ── Chile: libros de compras y ventas del set de pruebas (oct 2026) ──
-- La certificación ante el SII pide, junto con el set de pruebas, el libro de
-- ventas y el de compras (información electrónica de compras y ventas, IECV:
-- formato v3.0 y LibroCV_v10.xsd de www.sii.cl). Cord los arma solo para la
-- certificación: desde el período de agosto de 2017 el Registro de Compras y
-- Ventas los reemplaza (Resolución Exenta SII N° 61 de 2017). El flujo vive en
-- src/lib/fiscal/latam/sii/libros-set.ts.
--
-- fiscal_sii_libros: un intento por fila, como fiscal_sii_sets. `entrada`
-- guarda lo que el set entrega (en compras, sus documentos y el factor de
-- proporcionalidad del IVA de uso común); `proveedores`, el RUT y la razón
-- social que el negocio agrega a cada documento de compra; `detalles` y
-- `resumen`, lo que el libro informa; `libro_xml`, el archivo firmado que se
-- subió al SII, que ya no cambia (trigger).
create table if not exists fiscal_sii_libros (
  id                  uuid        default gen_random_uuid() primary key,
  org_id              uuid        not null references orgs(id) on delete cascade,
  entorno             text        not null default 'homologacion',
  operacion           text        not null,
  numero_atencion     text        not null,
  nombre              text        not null,
  folio_notificacion  int         not null,
  entrada             jsonb       not null default '{}'::jsonb,
  proveedores         jsonb       not null default '{}'::jsonb,
  estado              text        not null default 'cargado',
  set_id              uuid        references fiscal_sii_sets(id) on delete set null,
  periodo             text,
  detalles            jsonb,
  resumen             jsonb,
  libro_xml           text,
  track_id            text,
  respuesta           jsonb,
  error_mensaje       text,
  creado_por          uuid,
  created_at          timestamptz not null default now(),
  enviado_at          timestamptz,
  updated_at          timestamptz not null default now(),
  check (entorno = 'homologacion'),
  check (operacion in ('VENTA', 'COMPRA')),
  check (estado in ('cargado', 'enviando', 'enviado', 'incierto', 'procesado', 'respondido', 'rechazado')),
  check (numero_atencion ~ '^[0-9]{1,12}$'),
  check (folio_notificacion > 0),
  check (periodo is null or periodo ~ '^[0-9]{4}-(0[1-9]|1[0-2])$')
);
create index if not exists idx_fiscal_sii_libros_org
  on fiscal_sii_libros (org_id, operacion, numero_atencion, created_at desc);

create or replace function cord_fiscal_sii_libro_guardas()
returns trigger
language plpgsql
as $$
begin
  if old.libro_xml is not null and (
       new.libro_xml is distinct from old.libro_xml
       or new.detalles is distinct from old.detalles
       or new.resumen is distinct from old.resumen
       or new.periodo is distinct from old.periodo
       or new.operacion is distinct from old.operacion
       or new.org_id is distinct from old.org_id) then
    raise exception 'fiscal_sii_libros: un libro firmado no se modifica';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_fiscal_sii_libro_guardas on fiscal_sii_libros;
create trigger trg_fiscal_sii_libro_guardas
  before update on fiscal_sii_libros
  for each row execute function cord_fiscal_sii_libro_guardas();

alter table fiscal_sii_libros enable row level security;
drop policy if exists "rls_fiscal_sii_libros" on fiscal_sii_libros;
create policy "rls_fiscal_sii_libros" on fiscal_sii_libros
  using (org_id = nullif(current_setting('app.org_id', true), '')::uuid)
  with check (org_id = nullif(current_setting('app.org_id', true), '')::uuid);
alter table fiscal_sii_libros force row level security;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'cord_app') then
    grant select, insert, update, delete on fiscal_sii_libros to cord_app;
  end if;
end
$$;
-- END sii-libros

-- ── Cuota del sales tax automático de EE. UU. (oct 2026) ────────────────────
-- Cada venta con sales tax por dirección que se registra para la declaración
-- del negocio (la Tax Transaction de us_tax_calculos) le cuesta a Cord USD 0.50
-- en el proveedor. Decisión de André: se cobra como los timbres de CFDI, con su
-- PROPIO contador y su propio precio — cuota incluida por plan (INCLUDED.us_tax
-- en src/lib/billing.ts: 10/25/60/150) y excedente medido. Reusar `cfdi` haría
-- perder dinero: su excedente es menor que el costo de la venta.
--
-- `uso_periodo.us_tax` cuenta las ventas registradas del mes (reservadas antes
-- de llamar al proveedor y liberadas si el registro falla). `us_tax_calculos.uso_id`
-- es la reserva de ESE registro: un reintento (o dos procesos a la vez) la
-- reusan en vez de contar dos veces la misma venta, y la reconciliación de
-- Billing confirma una reserva cuyo registro sí ocurrió.
--
-- El CHECK de usage_reservations se re-declara con las siete dimensiones que
-- usa el código: 'documento' (documentos comerciales) tampoco estaba, así que
-- en una base con este CHECK la reserva de un documento comercial fallaba.
alter table uso_periodo add column if not exists us_tax int not null default 0;
alter table usage_reservations drop constraint if exists usage_reservations_dimension_check;
alter table usage_reservations add constraint usage_reservations_dimension_check
  check (dimension in ('api','usuario','ia','timbrado','envios','documento','us_tax'));
alter table us_tax_calculos add column if not exists uso_id uuid;
create index if not exists idx_us_tax_calculos_uso on us_tax_calculos (uso_id) where uso_id is not null;
-- END sales-tax-cuota

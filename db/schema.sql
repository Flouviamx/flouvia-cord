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
  moneda        text        not null default 'MXN', -- Obsoleto, usar base_currency a futuro
  base_currency text        not null default 'MXN', -- Moneda de presentación (ej. USD)
  fiscal_currency text      not null default 'MXN', -- Moneda contable/fiscal (ej. MXN)
  fx_rate       numeric     not null default 1,     -- Tipo de cambio aplicado
  fx_rate_source text       not null default 'spot',-- 'spot' | 'buffer' | 'forward'
  fx_locked_until timestamptz,                      -- Fecha de expiración de cobertura
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

create table if not exists platform_health (
  key             text primary key,
  last_success_at timestamptz,
  last_alert_at   timestamptz,
  metadata        jsonb not null default '{}'::jsonb,
  updated_at      timestamptz not null default now()
);

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

create or replace function cord_effective_plan(p_org uuid)
returns text
language sql stable security definer
set search_path = public, pg_temp
as $$
  with requested as (
    select coalesce(sandbox_of, id) as billing_org_id
      from orgs where id = p_org
  ), billing as (
    select case
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
  )
  select case
    when stored_plan = 'free' then 'free'
    when subscription_status = 'active'
      and current_period_end is not null and current_period_end > now()
      and billing_paid_through is not null and billing_paid_through >= current_period_end
      and (case paid_plan when 'developer' then 4 when 'scale' then 3 when 'pro' then 2 when 'starter' then 1 else 0 end)
          >= (case stored_plan when 'developer' then 4 when 'scale' then 3 when 'pro' then 2 when 'starter' then 1 else 0 end)
      and stripe_subscription_id is not null and stripe_customer_id is not null
      then stored_plan
    else 'free'
  end
  from billing
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
  dimension        text        not null check (dimension in ('api','usuario','ia','timbrado','envios')),
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
alter table usage_reservations drop constraint if exists usage_reservations_dimension_check;
alter table usage_reservations add constraint usage_reservations_dimension_check
  check (dimension in ('api','usuario','ia','timbrado','envios'));
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

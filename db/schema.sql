-- ============================================================
-- Cord — schema multi-tenant (Neon / PostgreSQL)
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
  provider_data   jsonb,                             -- Data cruda del PAC/Stripe Tax/Avalara
  pdf_url         text,
  xml_url         text,
  created_at      timestamptz default now()
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

-- ── Clerk Organizations (híbrido, jun 2026) ────────────────────────────────
-- Clerk es la fuente de verdad de IDENTIDAD de org (switcher, invitaciones por
-- email, SSO, multi-org); Neon sigue siendo la fuente de los DATOS (RLS, billing,
-- permisos granulares). El mapeo Clerk↔Neon vive en orgs.clerk_org_id.
alter table orgs add column if not exists clerk_org_id text unique; -- org_xxx de Clerk
-- Las orgs creadas vía Clerk Organizations no tienen un "dueño único" reusable en
-- clerk_user_id (ese usuario ya tiene su org personal): se identifican por
-- clerk_org_id y el dueño vive como miembro 'owner' en org_members.
alter table orgs alter column clerk_user_id drop not null;

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
  cfdi       int         not null default 0,       -- timbres CFDI 4.0
  api        int         not null default 0,       -- llamadas a la API pública
  usuarios   int         not null default 0,       -- usuarios extra activos
  updated_at timestamptz not null default now(),
  primary key (org_id, periodo)
);

-- Idempotencia del webhook de Stripe: si un event.id ya se procesó, se ignora.
create table if not exists stripe_events (
  id          text        primary key,             -- evt_…
  type        text,
  received_at timestamptz not null default now()
);

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
-- Sin FORCE por ahora: los handlers de /api/* usan sql directamente (sin
-- withOrgTx) y el rol dueño de la tabla bypasea RLS sin FORCE.
-- Una vez que los handlers sean actualizados, agregar:
--   alter table <tabla> force row level security;
-- por cada tabla para enforcement total.
--
-- orgs / org_members: sin FORCE — las queries de bootstrap en getActiveOrgId()
-- necesitan acceso sin contexto establecido aún.
--
-- cotizaciones / cotizacion_items: política dual — contexto de org_id O de
-- public_token (para páginas públicas /q/[token] y /embed/[token]).
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

create policy "rls_orgs" on orgs
  using (id = nullif(current_setting('app.org_id', true), '')::uuid);

create policy "rls_org_members" on org_members
  using (org_id = nullif(current_setting('app.org_id', true), '')::uuid);

create policy "rls_productos" on productos
  using (org_id = nullif(current_setting('app.org_id', true), '')::uuid);

create policy "rls_clientes" on clientes
  using (org_id = nullif(current_setting('app.org_id', true), '')::uuid);

create policy "rls_cotizaciones" on cotizaciones
  using (
    org_id = nullif(current_setting('app.org_id', true), '')::uuid
    or public_token = nullif(current_setting('app.public_token', true), '')
  );

create policy "rls_cotizacion_items" on cotizacion_items
  using (
    cotizacion_id in (
      select id from cotizaciones
      where org_id = nullif(current_setting('app.org_id', true), '')::uuid
         or public_token = nullif(current_setting('app.public_token', true), '')
    )
  );

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

-- 1) Fecha de pago para predicciones
alter table cotizaciones add column if not exists paid_at timestamptz;

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
alter table orgs add column if not exists banco_beneficiario text;
alter table orgs add column if not exists cobro_spei_auto boolean not null default false;

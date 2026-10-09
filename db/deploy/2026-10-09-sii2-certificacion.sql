-- Chile: nota de débito (DTE 56), set de pruebas e intercambio con el SII (oct
-- 2026). Migración aditiva e idempotente; la aplica
-- scripts/migrate-facturacion.mjs en cada despliegue, ANTES del build. Cada
-- sentencia es espejo literal de la sección "Chile: nota de débito, set de
-- pruebas e intercambio con el SII" de db/schema.sql (lo verifica
-- test/migrate-facturacion.test.ts). El "sii2" del nombre la ordena DESPUÉS
-- de 2026-10-09-sii.sql, que crea fiscal_sii_cafs ("sii-…" se ordenaría antes).

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

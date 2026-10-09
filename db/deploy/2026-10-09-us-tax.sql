-- Migración aditiva e idempotente del sales tax de EE. UU. por dirección del
-- cliente (oct 2026): la preferencia y el domicilio de origen del negocio
-- (orgs.us_tax_*), los estados donde recauda (us_tax_registros), los cálculos
-- guardados (us_tax_calculos), el desglose por jurisdicción de cada línea
-- (cotizacion_items.tax_breakdown), el cálculo de cada documento y la
-- exención del cliente. Corre en cada despliegue ANTES del build
-- (vercel.json → scripts/migrate-facturacion.mjs). Cada sentencia es espejo
-- LITERAL de la sección "Sales tax de EE. UU." al final de db/schema.sql (lo
-- verifica test/migrate-facturacion.test.ts).

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

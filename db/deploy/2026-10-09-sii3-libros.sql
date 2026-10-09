-- Chile: libros de compras y ventas del set de pruebas de la certificación
-- ante el SII (oct 2026). Migración aditiva e idempotente; la aplica
-- scripts/migrate-facturacion.mjs en cada despliegue, ANTES del build. Cada
-- sentencia es espejo literal de la sección "Chile: libros de compras y
-- ventas del set de pruebas" de db/schema.sql (lo verifica
-- test/migrate-facturacion.test.ts). El "sii3" del nombre la ordena DESPUÉS
-- de 2026-10-09-sii2-certificacion.sql, que crea fiscal_sii_sets.

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

-- Migración aditiva e idempotente de México (oct 2026): claves SAT por línea,
-- factura global y sustitución de CFDI. Corre en cada despliegue
-- (vercel.json → scripts/migrate-facturacion.mjs, que lee todos los archivos de
-- db/deploy/ en orden de nombre) ANTES del build. Cada sentencia es espejo
-- LITERAL de db/schema.sql (lo verifica test/migrate-facturacion.test.ts).

-- Claves SAT propias de la línea de una cotización.

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

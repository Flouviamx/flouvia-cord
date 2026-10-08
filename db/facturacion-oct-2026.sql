-- Migración aditiva e idempotente de facturación (oct 2026). Corre en cada
-- despliegue (vercel.json → scripts/migrate-facturacion.mjs) ANTES del build,
-- para que el código que lee estas columnas y funciones nunca llegue a
-- producción sin ellas. Cada sentencia es espejo LITERAL de db/schema.sql (lo
-- verifica test/migrate-facturacion.test.ts); la sección de Verifactu no se
-- copia: el script la extrae del propio schema.
--
-- El script no ejecuta a ciegas: una columna o restricción ya presente, una
-- política o un trigger que ya existen se saltan, para no tomar un candado
-- ACCESS EXCLUSIVE en cada despliegue.

-- Fecha (o periodo) de prestación (Leistungsdatum).

alter table documentos_fiscales add column if not exists service_date date;

alter table documentos_fiscales add column if not exists service_date_end date;

alter table documentos_fiscales drop constraint if exists chk_documentos_service_period;

alter table documentos_fiscales add constraint chk_documentos_service_period
  check (service_date_end is null or (service_date is not null and service_date_end >= service_date));

-- Retención sobre la base gravada (México).

alter table impuestos add column if not exists retencion_base text not null default 'subtotal';

alter table impuestos drop constraint if exists chk_impuestos_retencion_base;

alter table impuestos add constraint chk_impuestos_retencion_base
    check (retencion_base in ('subtotal', 'impuesto', 'gravado'));

-- Datos del catálogo: México, Perú y Canadá.

update impuestos i set retencion_base = 'gravado'
  from orgs o
 where o.id = i.org_id and upper(coalesce(o.country_code, 'MX')) = 'MX'
   and i.tipo = 'ret_iva' and i.kind = 'retencion' and i.retencion_base = 'subtotal';

update impuestos set nombre = 'Retención IVA 10.6667%', tasa = 10.6667
 where tipo = 'ret_iva' and nombre = 'Retención IVA 10.667%' and tasa = 10.667;

delete from impuestos i
 using orgs o
 where o.id = i.org_id and upper(coalesce(o.country_code, '')) = 'PE'
   and i.nombre = 'Retención IGV 3%' and i.kind = 'retencion' and i.tasa = 3 and i.es_default is not true;

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

update orgs set iva_pct = case iva_pct when 9.975 then 14.975 when 7 then 12 when 6 then 11 end
 where upper(coalesce(country_code, '')) = 'CA' and iva_pct in (9.975, 7, 6);

-- Causa de exención por concepto (España).

alter table impuestos add column if not exists exemption_reason text;

alter table impuestos drop constraint if exists chk_impuestos_exemption_reason;

alter table impuestos add constraint chk_impuestos_exemption_reason
  check (exemption_reason is null or (kind = 'exento' and exemption_reason in ('E1','E2','E3','E4','E5','E6','N1','N2','S2')));

alter table cotizacion_items add column if not exists exemption_reason text;

alter table cotizacion_items drop constraint if exists chk_cotizacion_items_exemption_reason;

alter table cotizacion_items add constraint chk_cotizacion_items_exemption_reason
  check (exemption_reason is null or exemption_reason in ('E1','E2','E3','E4','E5','E6','N1','N2','S2'));

create table if not exists migraciones_datos (
  id          text        primary key,
  aplicada_at timestamptz not null default now()
);

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

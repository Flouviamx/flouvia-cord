-- Migración aditiva e idempotente del riel DIAN de Colombia (oct 2026): el
-- XML firmado y la respuesta de la DIAN de cada envío (dian_documentos) y la
-- ficha DIAN del cliente (clientes.dian). Corre en cada despliegue ANTES del
-- build (vercel.json → scripts/migrate-facturacion.mjs), después de
-- 2026-10-08-latam-arca.sql, que crea fiscal_rail_comprobantes. Cada sentencia
-- es espejo LITERAL de la sección "DIAN" al final de db/schema.sql (lo
-- verifica test/migrate-facturacion.test.ts).
--
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

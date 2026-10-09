-- Chile: factura electrónica con el SII (oct 2026). Migración aditiva e
-- idempotente; la aplica scripts/migrate-facturacion.mjs en cada despliegue,
-- ANTES del build. Cada sentencia es espejo literal de la sección "Chile:
-- factura electrónica con el SII" de db/schema.sql (lo verifica
-- test/migrate-facturacion.test.ts).

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

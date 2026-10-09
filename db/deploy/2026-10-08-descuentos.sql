-- Descuentos de documento y cupones (oct 2026). Corre en cada despliegue
-- (vercel.json → scripts/migrate-facturacion.mjs) ANTES del build: el código
-- que lee `documentos_fiscales.descuento_total`, `cotizaciones.descuento_def`,
-- `cupones` y `cord_cupon_redimir` no puede llegar a producción sin ellos.
-- Cada sentencia es espejo LITERAL de la sección "Descuentos de documento y
-- cupones" de db/schema.sql (lo verifica test/migrate-facturacion.test.ts).
-- No hay migración de datos: las columnas nuevas nacen vacías o en 0, que es
-- exactamente "sin descuento".

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

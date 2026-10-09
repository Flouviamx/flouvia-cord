-- Migración aditiva e idempotente de la factura electrónica entre empresarios
-- por la solución pública de la AEAT (oct 2026): la cola de mensajes
-- (spfe_mensajes), los estados que comunica el destinatario
-- (spfe_estados_destinatario) y el estado de la cola por organización
-- (spfe_envio_estado). Corre en cada despliegue ANTES del build (vercel.json →
-- scripts/migrate-facturacion.mjs). Cada sentencia es espejo LITERAL de la
-- sección "Factura electrónica entre empresarios" al final de db/schema.sql
-- (lo verifica test/migrate-facturacion.test.ts).
--
-- ── Factura electrónica entre empresarios: solución pública de la AEAT (oct 2026)
-- Ley 56/2007, art. 2 bis; RD 238/2026; Orden HAC/1028/2026 (BOE-A-2026-20587).
-- Cord envía la factura ORIGINAL por la solución pública (SPFE) como medio de
-- interconexión y comunica el cobro o el impago desde sus cobros reales
-- (src/lib/fiscal/spfe/). Nace apagado: la AEAT todavía no publicó el WSDL ni
-- los esquemas del servicio, y la pantalla dice "Próximamente". Contrato en
-- docs/estado/cobros-facturacion.md, sección "Factura electrónica entre
-- empresarios (solución pública de la AEAT)".
--
-- Cada mensaje hacia la SPFE (factura, baja, cobro, impago y sus
-- cancelaciones), con su máquina de estados:
--   pendiente → admitido | rechazado | incierto | descartado
--   incierto  → admitido | descartado   (solo tras CONSULTAR a la SPFE)
-- `orden` serializa los mensajes de cada factura: dos procesos que calculan el
-- siguiente compiten por el mismo número y gana uno (sin advisory locks: el
-- driver HTTP de Neon no los sostiene). `enviado_at` se marca ANTES de enviar;
-- un mensaje que salió y no tuvo respuesta nunca se reenvía: se consulta.
create table if not exists spfe_mensajes (
  id             uuid        default gen_random_uuid() primary key,
  org_id         uuid        not null references orgs(id) on delete cascade,
  documento_id   uuid        not null references documentos_fiscales(id) on delete cascade,
  entorno        text        not null,
  orden          int         not null,
  tipo           text        not null,
  codigo_unico   text        not null,
  estado         text        not null default 'pendiente',
  xml            text        not null,
  xml_sha256     text        not null,
  datos          jsonb       not null default '{}'::jsonb,
  respuesta      jsonb,
  csv            text,
  localizador    text,
  error_codigo   text,
  error_mensaje  text,
  intentos       int         not null default 0,
  created_at     timestamptz not null default now(),
  enviado_at     timestamptz,
  consultado_at  timestamptz,
  resuelto_at    timestamptz,
  unique (documento_id, entorno, orden),
  check (entorno in ('pruebas', 'produccion')),
  check (tipo in ('alta', 'baja', 'cobro', 'anula_cobro', 'impago', 'anula_impago')),
  check (estado in ('pendiente', 'incierto', 'admitido', 'rechazado', 'descartado')),
  check (orden > 0)
);
create unique index if not exists uq_spfe_mensajes_alta_viva
  on spfe_mensajes (documento_id, entorno)
  where tipo = 'alta' and estado in ('pendiente', 'incierto', 'admitido');
create index if not exists idx_spfe_mensajes_por_resolver
  on spfe_mensajes (org_id, created_at)
  where estado in ('pendiente', 'incierto');
create index if not exists idx_spfe_mensajes_documento on spfe_mensajes (org_id, documento_id);

-- Lo enviado no se reescribe: la identidad y el XML son inmutables desde el
-- insert, admitido/rechazado/descartado son finales y un incierto solo se
-- resuelve consultando. El borrado en cascada de la organización o del
-- documento sí pasa (profundidad de trigger > 1).
create or replace function cord_spfe_mensaje_inmutable()
returns trigger
language plpgsql
as $$
begin
  if TG_OP = 'DELETE' then
    if old.estado = 'admitido' and pg_trigger_depth() <= 1 then
      raise exception 'spfe_mensajes: un mensaje admitido por la solución pública no se borra'
        using errcode = 'restrict_violation';
    end if;
    return old;
  end if;
  if new.org_id is distinct from old.org_id
     or new.documento_id is distinct from old.documento_id
     or new.entorno is distinct from old.entorno
     or new.orden is distinct from old.orden
     or new.tipo is distinct from old.tipo
     or new.codigo_unico is distinct from old.codigo_unico
     or new.xml is distinct from old.xml
     or new.xml_sha256 is distinct from old.xml_sha256
     or new.datos is distinct from old.datos
     or new.created_at is distinct from old.created_at then
    raise exception 'spfe_mensajes: la identidad y el contenido de un mensaje no se modifican';
  end if;
  if old.estado in ('admitido', 'rechazado', 'descartado') and new is distinct from old then
    raise exception 'spfe_mensajes: admitido, rechazado y descartado son estados finales';
  end if;
  if old.estado = 'incierto' and new.estado in ('pendiente', 'rechazado') then
    raise exception 'spfe_mensajes: un mensaje incierto solo se resuelve consultando a la solución pública';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_spfe_mensaje_inmutable on spfe_mensajes;
create trigger trg_spfe_mensaje_inmutable
  before update or delete on spfe_mensajes
  for each row execute function cord_spfe_mensaje_inmutable();

-- Lo que el DESTINATARIO comunicó a la SPFE (pago completo o rechazo y sus
-- cancelaciones, Anexo II), tal como lo devuelve la consulta. Solo se agrega:
-- el estado vigente es la observación más reciente.
create table if not exists spfe_estados_destinatario (
  id            uuid        default gen_random_uuid() primary key,
  org_id        uuid        not null references orgs(id) on delete cascade,
  documento_id  uuid        not null references documentos_fiscales(id) on delete cascade,
  entorno       text        not null,
  codigo        text        not null,
  fecha         date        not null,
  motivo        text,
  vencimiento   date,
  recibido_at   timestamptz not null default now(),
  unique (documento_id, entorno, codigo, fecha),
  check (entorno in ('pruebas', 'produccion')),
  check (codigo in ('PAYMENT', 'CANCELPAYMENT', 'REJECTION', 'CANCELREJECTION')),
  check (motivo is null or motivo in ('01', '02'))
);
create index if not exists idx_spfe_estados_destinatario_documento on spfe_estados_destinatario (org_id, documento_id);

-- Estado de la cola por organización y entorno: un solo proceso en vuelo
-- (lease), la pausa tras un rechazo de la petición, la próxima consulta de
-- estados y desde cuándo entra cada factura (`activado_at`: las emitidas antes
-- de que el riel se encendiera no se envían de golpe).
create table if not exists spfe_envio_estado (
  org_id              uuid        not null references orgs(id) on delete cascade,
  entorno             text        not null,
  activado_at         timestamptz not null default now(),
  lease_hasta         timestamptz,
  lease_token         text,
  proximo_envio_at    timestamptz,
  proxima_consulta_at timestamptz,
  ultimo_envio_at     timestamptz,
  ultimo_error        text,
  updated_at          timestamptz not null default now(),
  primary key (org_id, entorno),
  check (entorno in ('pruebas', 'produccion'))
);

alter table spfe_mensajes enable row level security;
drop policy if exists "rls_spfe_mensajes" on spfe_mensajes;
create policy "rls_spfe_mensajes" on spfe_mensajes
  using (org_id = nullif(current_setting('app.org_id', true), '')::uuid)
  with check (org_id = nullif(current_setting('app.org_id', true), '')::uuid);
alter table spfe_mensajes force row level security;

alter table spfe_estados_destinatario enable row level security;
drop policy if exists "rls_spfe_estados_destinatario" on spfe_estados_destinatario;
create policy "rls_spfe_estados_destinatario" on spfe_estados_destinatario
  using (org_id = nullif(current_setting('app.org_id', true), '')::uuid)
  with check (org_id = nullif(current_setting('app.org_id', true), '')::uuid);
alter table spfe_estados_destinatario force row level security;

alter table spfe_envio_estado enable row level security;
drop policy if exists "rls_spfe_envio_estado" on spfe_envio_estado;
create policy "rls_spfe_envio_estado" on spfe_envio_estado
  using (org_id = nullif(current_setting('app.org_id', true), '')::uuid)
  with check (org_id = nullif(current_setting('app.org_id', true), '')::uuid);
alter table spfe_envio_estado force row level security;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'cord_app') then
    grant select, insert, update, delete on spfe_mensajes to cord_app;
    grant select, insert, update, delete on spfe_estados_destinatario to cord_app;
    grant select, insert, update, delete on spfe_envio_estado to cord_app;
  end if;
end
$$;

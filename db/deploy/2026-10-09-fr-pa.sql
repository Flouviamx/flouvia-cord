-- Migración aditiva e idempotente de la emisión por plataforma autorizada en
-- Francia (oct 2026): la dirección de entrega de la factura, la naturaleza del
-- producto (bien o servicio), el alta del negocio en la plataforma (pa_altas),
-- la cola de lo que Cord le comunica (pa_envios), los estados que notifica
-- (pa_estados), el estado de la cola (pa_cola) y los resolutores del webhook.
-- Corre en cada despliegue ANTES del build (vercel.json →
-- scripts/migrate-facturacion.mjs). Cada sentencia es espejo LITERAL de la
-- sección "Francia: emisión por plataforma autorizada" al final de
-- db/schema.sql (lo verifica test/migrate-facturacion.test.ts).
--
-- ── Francia: emisión por plataforma autorizada (oct 2026)
-- Reforma de la facturación electrónica (CGI art. 289 bis y 290 A; DGFiP,
-- especificaciones externas v3.2). Cord EMITE las facturas entre empresas
-- francesas por la plataforma autorizada (PA) del negocio, reporta las
-- operaciones con particulares y con el extranjero (e-reporting) y comunica lo
-- cobrado cuando la TVA es exigible al cobro (estado 212 "Encaissée" o
-- e-reporting de pagos). Solo emisión: la recepción la lleva la plataforma de
-- recepción que el negocio ya tenga. Nace apagado (IOPOLE_ENABLED) y el
-- proveedor de transmisión es intercambiable (src/lib/fiscal/transmision/).
-- Contrato en docs/estado/cobros-facturacion.md, sección "Francia: emisión por
-- plataforma autorizada".
--
-- Menciones nuevas que el documento congela: la dirección de entrega de los
-- bienes (BG-15, si difiere de la del cliente) y si cada producto es un bien o
-- un servicio (categoría de la operación, BT-23).
alter table documentos_fiscales add column if not exists delivery_address jsonb;
alter table productos add column if not exists naturaleza text check (naturaleza in ('goods', 'services'));

-- El alta del negocio en la plataforma (enrollment): una viva por organización,
-- proveedor y entorno. `solicitado_at` se marca ANTES de llamar; un alta sin
-- respuesta (incierto) se resuelve CONSULTANDO por SIREN, nunca repitiendo la
-- creación (la API crea una nueva en cada llamada).
create table if not exists pa_altas (
  id             uuid        default gen_random_uuid() primary key,
  org_id         uuid        not null references orgs(id) on delete cascade,
  proveedor      text        not null,
  entorno        text        not null,
  siren          text        not null,
  estado         text        not null default 'solicitando',
  etapa          text,
  etapa_at       timestamptz,
  alta_id        text,
  entidad_id     text,
  enlace         text,
  regimen_tva    text        not null,
  datos          jsonb       not null default '{}'::jsonb,
  error_mensaje  text,
  solicitado_at  timestamptz,
  consultado_at  timestamptz,
  completada_at  timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  check (proveedor in ('iopole')),
  check (entorno in ('preproduccion', 'produccion')),
  check (estado in ('solicitando', 'incierto', 'en_curso', 'accion_requerida', 'completada', 'cancelada', 'rechazada', 'descartada')),
  check (siren ~ '^[0-9]{9}$'),
  check (regimen_tva in ('reel_mensuel', 'reel_trimestriel', 'simplifie', 'franchise'))
);
create unique index if not exists uq_pa_altas_viva
  on pa_altas (org_id, proveedor, entorno)
  where estado not in ('cancelada', 'rechazada', 'descartada');
create unique index if not exists uq_pa_altas_proveedor
  on pa_altas (proveedor, entorno, alta_id)
  where alta_id is not null;

-- Lo que Cord comunica a la plataforma, con su máquina de estados:
--   pendiente → aceptado | rechazado | incierto | descartado
--   incierto  → aceptado | descartado   (solo tras CONSULTAR a la plataforma)
--   aceptado  → rechazado              (rechazo asíncrono del e-reporting)
-- `clave` es la idempotencia: un intento vivo por clave (la factura, el cobro,
-- el día de e-reporting). `enviado_at` se marca ANTES de enviar; un envío que
-- salió sin respuesta nunca se repite: se consulta o queda a la vista.
create table if not exists pa_envios (
  id              uuid        default gen_random_uuid() primary key,
  org_id          uuid        not null references orgs(id) on delete cascade,
  documento_id    uuid        references documentos_fiscales(id) on delete cascade,
  proveedor       text        not null,
  entorno         text        not null,
  tipo            text        not null,
  clave           text        not null,
  estado          text        not null default 'pendiente',
  siren           text        not null,
  numero          text,
  datos           jsonb       not null default '{}'::jsonb,
  archivo         bytea,
  archivo_sha256  text,
  periodo         text,
  fecha_operacion date,
  fecha_limite    date,
  id_proveedor    text,
  respuesta       jsonb,
  error_codigo    text,
  error_mensaje   text,
  intentos        int         not null default 0,
  created_at      timestamptz not null default now(),
  enviado_at      timestamptz,
  consultado_at   timestamptz,
  resuelto_at     timestamptz,
  confirmado_at   timestamptz,
  check (proveedor in ('iopole')),
  check (entorno in ('preproduccion', 'produccion')),
  check (tipo in ('factura', 'cobro', 'reporte_factura', 'reporte_transacciones', 'reporte_pago_factura', 'reporte_pago_transacciones')),
  check (estado in ('pendiente', 'incierto', 'aceptado', 'rechazado', 'descartado')),
  check (tipo = 'reporte_transacciones' or tipo = 'reporte_pago_transacciones' or documento_id is not null)
);
create unique index if not exists uq_pa_envios_vivo
  on pa_envios (org_id, entorno, clave)
  where estado in ('pendiente', 'incierto', 'aceptado');
create unique index if not exists uq_pa_envios_proveedor
  on pa_envios (proveedor, entorno, id_proveedor)
  where id_proveedor is not null;
create index if not exists idx_pa_envios_por_resolver
  on pa_envios (org_id, created_at)
  where estado in ('pendiente', 'incierto');
create index if not exists idx_pa_envios_documento on pa_envios (org_id, documento_id);

-- Lo enviado no se reescribe: identidad y contenido son inmutables desde el
-- insert, rechazado y descartado son finales y un incierto solo se resuelve
-- consultando. El borrado en cascada de la organización o del documento sí
-- pasa (profundidad de trigger > 1).
create or replace function cord_pa_envio_inmutable()
returns trigger
language plpgsql
as $$
begin
  if TG_OP = 'DELETE' then
    if old.estado = 'aceptado' and pg_trigger_depth() <= 1 then
      raise exception 'pa_envios: un envío aceptado por la plataforma no se borra'
        using errcode = 'restrict_violation';
    end if;
    return old;
  end if;
  if new.org_id is distinct from old.org_id
     or new.documento_id is distinct from old.documento_id
     or new.proveedor is distinct from old.proveedor
     or new.entorno is distinct from old.entorno
     or new.tipo is distinct from old.tipo
     or new.clave is distinct from old.clave
     or new.siren is distinct from old.siren
     or new.numero is distinct from old.numero
     or new.datos is distinct from old.datos
     or new.archivo is distinct from old.archivo
     or new.archivo_sha256 is distinct from old.archivo_sha256
     or new.created_at is distinct from old.created_at then
    raise exception 'pa_envios: la identidad y el contenido de un envío no se modifican';
  end if;
  if old.estado in ('rechazado', 'descartado') and new is distinct from old then
    raise exception 'pa_envios: rechazado y descartado son estados finales';
  end if;
  if old.estado = 'aceptado' and new.estado not in ('aceptado', 'rechazado') then
    raise exception 'pa_envios: un envío aceptado solo puede pasar a rechazado';
  end if;
  if old.estado = 'incierto' and new.estado in ('pendiente', 'rechazado') then
    raise exception 'pa_envios: un envío incierto solo se resuelve consultando a la plataforma';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_pa_envio_inmutable on pa_envios;
create trigger trg_pa_envio_inmutable
  before update or delete on pa_envios
  for each row execute function cord_pa_envio_inmutable();

-- Los estados del ciclo de vida que la plataforma notifica de cada factura
-- (200 Déposée … 213 Rejetée), tal como llegan por el webhook verificado o
-- por la consulta de un envío incierto. Solo se agregan; el vigente es el más
-- reciente. `estado_id` es el del proveedor: un webhook repetido no duplica.
create table if not exists pa_estados (
  id                uuid        default gen_random_uuid() primary key,
  org_id            uuid        not null references orgs(id) on delete cascade,
  documento_id      uuid        not null references documentos_fiscales(id) on delete cascade,
  envio_id          uuid        references pa_envios(id) on delete set null,
  proveedor         text        not null,
  entorno           text        not null,
  estado_id         text        not null,
  codigo            text,
  codigo_proveedor  text        not null,
  fecha             timestamptz not null,
  motivo            text,
  detalle           jsonb,
  recibido_at       timestamptz not null default now(),
  check (proveedor in ('iopole')),
  check (entorno in ('preproduccion', 'produccion')),
  check (codigo is null or codigo ~ '^[0-9]{3}$')
);
create unique index if not exists uq_pa_estados_proveedor on pa_estados (proveedor, entorno, estado_id);
create index if not exists idx_pa_estados_documento on pa_estados (org_id, documento_id, fecha desc);

-- Estado de la cola por organización y entorno: un solo proceso en vuelo
-- (lease), la pausa tras un rechazo de la petición (credenciales, permisos) y
-- lo que la última pasada no pudo transmitir y necesita al negocio.
create table if not exists pa_cola (
  org_id            uuid        not null references orgs(id) on delete cascade,
  entorno           text        not null,
  lease_hasta       timestamptz,
  lease_token       text,
  proximo_envio_at  timestamptz,
  ultimo_envio_at   timestamptz,
  ultimo_error      text,
  bloqueados        jsonb       not null default '[]'::jsonb,
  updated_at        timestamptz not null default now(),
  primary key (org_id, entorno),
  check (entorno in ('preproduccion', 'produccion'))
);

alter table pa_altas enable row level security;
drop policy if exists "rls_pa_altas" on pa_altas;
create policy "rls_pa_altas" on pa_altas
  using (org_id = nullif(current_setting('app.org_id', true), '')::uuid)
  with check (org_id = nullif(current_setting('app.org_id', true), '')::uuid);
alter table pa_altas force row level security;

alter table pa_envios enable row level security;
drop policy if exists "rls_pa_envios" on pa_envios;
create policy "rls_pa_envios" on pa_envios
  using (org_id = nullif(current_setting('app.org_id', true), '')::uuid)
  with check (org_id = nullif(current_setting('app.org_id', true), '')::uuid);
alter table pa_envios force row level security;

alter table pa_estados enable row level security;
drop policy if exists "rls_pa_estados" on pa_estados;
create policy "rls_pa_estados" on pa_estados
  using (org_id = nullif(current_setting('app.org_id', true), '')::uuid)
  with check (org_id = nullif(current_setting('app.org_id', true), '')::uuid);
alter table pa_estados force row level security;

alter table pa_cola enable row level security;
drop policy if exists "rls_pa_cola" on pa_cola;
create policy "rls_pa_cola" on pa_cola
  using (org_id = nullif(current_setting('app.org_id', true), '')::uuid)
  with check (org_id = nullif(current_setting('app.org_id', true), '')::uuid);
alter table pa_cola force row level security;

-- El webhook de la plataforma llega sin organización: estas funciones
-- resuelven SOLO a quién pertenece lo que notifica (regla 30) y el trabajo
-- vuelve a withOrgTx con ese id. Un id de la plataforma identifica, no
-- autoriza: la firma del webhook ya se verificó antes de llamarlas.
create or replace function cord_pa_org_de_alta(p_proveedor text, p_entorno text, p_alta_id text)
returns uuid
language sql stable security definer
set search_path = public, pg_temp
as $$
  select a.org_id from pa_altas a
   where p_alta_id is not null and a.proveedor = p_proveedor and a.entorno = p_entorno and a.alta_id = p_alta_id
   limit 1
$$;
revoke all on function cord_pa_org_de_alta(text, text, text) from public;

create or replace function cord_pa_envio_de_proveedor(p_proveedor text, p_entorno text, p_id text)
returns table(org_id uuid, envio_id uuid, documento_id uuid)
language sql stable security definer
set search_path = public, pg_temp
as $$
  select e.org_id, e.id, e.documento_id from pa_envios e
   where p_id is not null and e.proveedor = p_proveedor and e.entorno = p_entorno and e.id_proveedor = p_id
   limit 1
$$;
revoke all on function cord_pa_envio_de_proveedor(text, text, text) from public;

-- Una factura que salió sin respuesta todavía no tiene el id de la
-- plataforma: su primer estado la encuentra por el SIREN del emisor y su número.
create or replace function cord_pa_factura_por_numero(p_proveedor text, p_entorno text, p_siren text, p_numero text)
returns table(org_id uuid, envio_id uuid, documento_id uuid)
language sql stable security definer
set search_path = public, pg_temp
as $$
  select e.org_id, e.id, e.documento_id from pa_envios e
   where p_siren is not null and p_numero is not null
     and e.proveedor = p_proveedor and e.entorno = p_entorno and e.tipo = 'factura'
     and e.siren = p_siren and e.numero = p_numero and e.estado in ('pendiente', 'incierto', 'aceptado')
   order by e.created_at desc
   limit 1
$$;
revoke all on function cord_pa_factura_por_numero(text, text, text, text) from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'cord_app') then
    grant select, insert, update, delete on pa_altas to cord_app;
    grant select, insert, update, delete on pa_envios to cord_app;
    grant select, insert, update, delete on pa_estados to cord_app;
    grant select, insert, update, delete on pa_cola to cord_app;
    grant execute on function cord_pa_org_de_alta(text, text, text) to cord_app;
    grant execute on function cord_pa_envio_de_proveedor(text, text, text) to cord_app;
    grant execute on function cord_pa_factura_por_numero(text, text, text, text) to cord_app;
  end if;
end
$$;

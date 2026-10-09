-- Migración aditiva e idempotente de los rieles fiscales de LatAm (oct 2026):
-- condición frente al IVA del cliente (Argentina) y las tablas fiscal_rail_*
-- del marco común. Corre en cada despliegue ANTES del build (vercel.json →
-- scripts/migrate-facturacion.mjs). Cada sentencia es espejo LITERAL de la
-- sección "Rieles fiscales de LatAm" de db/schema.sql (lo verifica
-- test/migrate-facturacion.test.ts).
--
-- ── Rieles fiscales de LatAm: integración directa con la autoridad (oct 2026) ─
-- Argentina (ARCA) es el primero; Brasil (NFS-e Nacional), Colombia (DIAN),
-- Perú (SUNAT) y Chile (SII) se construyen sobre estas mismas tablas. Cord
-- habla DIRECTO con la autoridad, sin agregador: la respuesta de la autoridad
-- (código de autorización, observaciones, rechazo) queda guardada aquí como la
-- fuente de verdad del documento fiscal. Contrato completo en
-- docs/estado/cobros-facturacion.md, sección "Rieles fiscales de LatAm".

-- Condición frente al IVA del cliente (Argentina). Es el
-- CondicionIVAReceptorId que la RG 5616/2024 hizo obligatorio en cada pedido
-- de autorización; los códigos son los del método
-- FEParamGetCondicionIvaReceptor (anexo del manual del desarrollador de
-- WSFEv1, RG 4291 v4.7). Nulo = sin capturar.
alter table clientes add column if not exists condicion_iva smallint;
alter table clientes drop constraint if exists chk_clientes_condicion_iva;
alter table clientes add constraint chk_clientes_condicion_iva
  check (condicion_iva is null or condicion_iva in (1, 4, 5, 6, 7, 8, 9, 10, 13, 15, 16));

-- Ajustes de cada riel por organización (ARCA: punto de venta, condición
-- frente al IVA del emisor, concepto). Independientes del entorno.
create table if not exists fiscal_rail_ajustes (
  org_id      uuid        not null references orgs(id) on delete cascade,
  rail        text        not null,
  ajustes     jsonb       not null default '{}'::jsonb,
  updated_at  timestamptz not null default now(),
  primary key (org_id, rail)
);

-- Certificado y llave privada con que el contribuyente se identifica ante su
-- autoridad, uno por riel y ENTORNO (el de homologación no sirve en
-- producción). Cifrados con encryptRequiredSecret(); nunca vuelven al
-- navegador. `secretos_enc` guarda credenciales extra que algunas autoridades
-- piden además del certificado (usuario SOL de SUNAT, PIN de software de la
-- DIAN), como JSON cifrado.
create table if not exists fiscal_rail_credenciales (
  id                 uuid        default gen_random_uuid() primary key,
  org_id             uuid        not null references orgs(id) on delete cascade,
  rail               text        not null,
  entorno            text        not null,
  cert_enc           text        not null,
  llave_enc          text        not null,
  secretos_enc       text,
  identificador      text        not null,
  certificado_nombre text,
  sujeto             text,
  huella_sha256      text        not null,
  vigente_desde      timestamptz not null,
  caduca             timestamptz not null,
  verificado_at      timestamptz,
  verificacion_error text,
  subido_por         uuid,
  subido_at          timestamptz not null default now(),
  unique (org_id, rail, entorno),
  check (entorno in ('homologacion', 'produccion'))
);

-- Ticket de acceso de la autoridad (ARCA: token + sign del WSAA, 12 horas),
-- cacheado por organización, entorno y servicio. La autoridad castiga pedir
-- otro mientras uno sigue vigente, así que se guarda (cifrado) y se comparte
-- entre instancias; `lease_*` deja que UNA sola instancia lo renueve y
-- `bloqueado_hasta` respeta la espera que exige la autoridad tras un rechazo
-- por ticket duplicado.
create table if not exists fiscal_rail_accesos (
  org_id          uuid        not null references orgs(id) on delete cascade,
  rail            text        not null,
  entorno         text        not null,
  servicio        text        not null,
  token_enc       text,
  firma_enc       text,
  expira_at       timestamptz,
  obtenido_at     timestamptz,
  bloqueado_hasta timestamptz,
  lease_hasta     timestamptz,
  lease_token     text,
  updated_at      timestamptz not null default now(),
  primary key (org_id, rail, entorno, servicio),
  check (entorno in ('homologacion', 'produccion'))
);

-- Una autorización en vuelo por secuencia de la autoridad (ARCA: CUIT + punto
-- de venta + tipo de comprobante; el número es el último autorizado + 1). El
-- driver HTTP de Neon no sostiene un advisory lock entre dos llamadas, así que
-- la serialización es un lease por fila, igual que verifactu_envio_estado.
create table if not exists fiscal_rail_secuencias (
  org_id            uuid        not null references orgs(id) on delete cascade,
  rail              text        not null,
  entorno           text        not null,
  serie             text        not null,
  tipo              text        not null,
  lease_hasta       timestamptz,
  lease_token       text,
  ultimo_autorizado bigint,
  updated_at        timestamptz not null default now(),
  primary key (org_id, rail, entorno, serie, tipo),
  check (entorno in ('homologacion', 'produccion'))
);

-- Cada intento de autorizar un documento ante la autoridad, con su máquina de
-- estados (src/lib/fiscal/latam/rieles.ts):
--   pendiente → autorizado | rechazado | incierto | descartado
--   incierto  → autorizado | descartado   (solo tras consultar a la autoridad)
-- El número se reclama ANTES de enviar: los índices únicos parciales impiden
-- que dos documentos vivos compartan número y que un documento tenga dos
-- intentos vivos. Un rechazo o un descarte libera el número (la autoridad no
-- lo consumió). `solicitud` es exactamente lo que se envió: con eso se
-- reconoce el comprobante al consultarlo después de un corte de red.
create table if not exists fiscal_rail_comprobantes (
  id                 uuid        default gen_random_uuid() primary key,
  org_id             uuid        not null references orgs(id) on delete cascade,
  documento_id       uuid        not null references documentos_fiscales(id) on delete cascade,
  rail               text        not null,
  entorno            text        not null,
  serie              text        not null,
  tipo               text        not null,
  numero             bigint      not null,
  estado             text        not null default 'pendiente',
  solicitud          jsonb       not null,
  respuesta          jsonb,
  autorizacion       text,
  autorizacion_vence date,
  observaciones      jsonb       not null default '[]'::jsonb,
  error_codigo       text,
  error_mensaje      text,
  intentos           int         not null default 0,
  created_at         timestamptz not null default now(),
  enviado_at         timestamptz,
  consultado_at      timestamptz,
  resuelto_at        timestamptz,
  check (entorno in ('homologacion', 'produccion')),
  check (estado in ('pendiente', 'autorizado', 'rechazado', 'incierto', 'descartado')),
  check (numero > 0),
  check (estado <> 'autorizado' or autorizacion is not null)
);
create unique index if not exists uq_fiscal_rail_comprobantes_numero
  on fiscal_rail_comprobantes (org_id, rail, entorno, serie, tipo, numero)
  where estado in ('pendiente', 'incierto', 'autorizado');
create unique index if not exists uq_fiscal_rail_comprobantes_documento
  on fiscal_rail_comprobantes (documento_id, rail, entorno)
  where estado in ('pendiente', 'incierto', 'autorizado');
create index if not exists idx_fiscal_rail_comprobantes_por_resolver
  on fiscal_rail_comprobantes (rail, created_at)
  where estado in ('pendiente', 'incierto');

-- Lo que la autoridad ya autorizó no se reescribe ni se borra a mano (mismo
-- criterio que verifactu_registros): la identidad del intento y lo enviado
-- son inmutables desde el insert, un estado final no vuelve atrás y un
-- comprobante autorizado no admite ningún cambio. El borrado en cascada de la
-- organización o del documento sí pasa (profundidad de trigger > 1).
create or replace function cord_fiscal_rail_comprobante_inmutable()
returns trigger
language plpgsql
as $$
begin
  if TG_OP = 'DELETE' then
    if old.estado = 'autorizado' and pg_trigger_depth() <= 1 then
      raise exception 'fiscal_rail_comprobantes: un comprobante autorizado por la autoridad no se borra'
        using errcode = 'restrict_violation';
    end if;
    return old;
  end if;
  if new.org_id is distinct from old.org_id
     or new.documento_id is distinct from old.documento_id
     or new.rail is distinct from old.rail
     or new.entorno is distinct from old.entorno
     or new.serie is distinct from old.serie
     or new.tipo is distinct from old.tipo
     or new.numero is distinct from old.numero
     or new.solicitud is distinct from old.solicitud
     or new.created_at is distinct from old.created_at then
    raise exception 'fiscal_rail_comprobantes: la identidad y la solicitud de un intento no se modifican';
  end if;
  if old.estado = 'autorizado' and new is distinct from old then
    raise exception 'fiscal_rail_comprobantes: un comprobante autorizado es definitivo';
  end if;
  if old.estado in ('rechazado', 'descartado') and new.estado is distinct from old.estado then
    raise exception 'fiscal_rail_comprobantes: rechazado y descartado son estados finales';
  end if;
  if old.estado = 'incierto' and new.estado in ('pendiente', 'rechazado') then
    raise exception 'fiscal_rail_comprobantes: un intento incierto solo se resuelve consultando a la autoridad';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_fiscal_rail_comprobante_inmutable on fiscal_rail_comprobantes;
create trigger trg_fiscal_rail_comprobante_inmutable
  before update or delete on fiscal_rail_comprobantes
  for each row execute function cord_fiscal_rail_comprobante_inmutable();

alter table fiscal_rail_ajustes enable row level security;
drop policy if exists "rls_fiscal_rail_ajustes" on fiscal_rail_ajustes;
create policy "rls_fiscal_rail_ajustes" on fiscal_rail_ajustes
  using (org_id = nullif(current_setting('app.org_id', true), '')::uuid)
  with check (org_id = nullif(current_setting('app.org_id', true), '')::uuid);
alter table fiscal_rail_ajustes force row level security;

alter table fiscal_rail_credenciales enable row level security;
drop policy if exists "rls_fiscal_rail_credenciales" on fiscal_rail_credenciales;
create policy "rls_fiscal_rail_credenciales" on fiscal_rail_credenciales
  using (org_id = nullif(current_setting('app.org_id', true), '')::uuid)
  with check (org_id = nullif(current_setting('app.org_id', true), '')::uuid);
alter table fiscal_rail_credenciales force row level security;

alter table fiscal_rail_accesos enable row level security;
drop policy if exists "rls_fiscal_rail_accesos" on fiscal_rail_accesos;
create policy "rls_fiscal_rail_accesos" on fiscal_rail_accesos
  using (org_id = nullif(current_setting('app.org_id', true), '')::uuid)
  with check (org_id = nullif(current_setting('app.org_id', true), '')::uuid);
alter table fiscal_rail_accesos force row level security;

alter table fiscal_rail_secuencias enable row level security;
drop policy if exists "rls_fiscal_rail_secuencias" on fiscal_rail_secuencias;
create policy "rls_fiscal_rail_secuencias" on fiscal_rail_secuencias
  using (org_id = nullif(current_setting('app.org_id', true), '')::uuid)
  with check (org_id = nullif(current_setting('app.org_id', true), '')::uuid);
alter table fiscal_rail_secuencias force row level security;

alter table fiscal_rail_comprobantes enable row level security;
drop policy if exists "rls_fiscal_rail_comprobantes" on fiscal_rail_comprobantes;
create policy "rls_fiscal_rail_comprobantes" on fiscal_rail_comprobantes
  using (org_id = nullif(current_setting('app.org_id', true), '')::uuid)
  with check (org_id = nullif(current_setting('app.org_id', true), '')::uuid);
alter table fiscal_rail_comprobantes force row level security;

-- El cron que resuelve intentos sin respuesta (/api/cron/fiscal-latam) solo
-- necesita DESCUBRIR qué organizaciones tienen alguno: función estrecha, solo
-- en el carril de sistema y solo devuelve ids (regla 30). El trabajo de cada
-- organización vuelve a withOrgTx con su org_id.
create or replace function cord_fiscal_rail_orgs_por_resolver(p_rail text, p_antiguedad_s int)
returns setof uuid
language sql stable security definer
set search_path = public, pg_temp
as $$
  select distinct c.org_id
    from fiscal_rail_comprobantes c
   where current_setting('app.scope', true) = 'system'
     and c.rail = p_rail
     and c.estado in ('pendiente', 'incierto')
     and c.created_at < now() - make_interval(secs => greatest(p_antiguedad_s, 0))
$$;
revoke all on function cord_fiscal_rail_orgs_por_resolver(text, int) from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'cord_app') then
    grant select, insert, update, delete on fiscal_rail_ajustes to cord_app;
    grant select, insert, update, delete on fiscal_rail_credenciales to cord_app;
    grant select, insert, update, delete on fiscal_rail_accesos to cord_app;
    grant select, insert, update, delete on fiscal_rail_secuencias to cord_app;
    grant select, insert, update, delete on fiscal_rail_comprobantes to cord_app;
    grant execute on function cord_fiscal_rail_orgs_por_resolver(text, int) to cord_app;
  end if;
end
$$;
-- END rieles-latam

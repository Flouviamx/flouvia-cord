-- Migración aditiva e idempotente del riel NF-e de Brasil (oct 2026): eventos
-- (cancelación y Carta de Correção), inutilização de números, contingencia SVC
-- y los datos de NF-e del producto y del cliente. Corre en cada despliegue
-- ANTES del build (vercel.json → scripts/migrate-facturacion.mjs), después de
-- 2026-10-08-latam-arca.sql, que crea fiscal_rail_comprobantes. Cada sentencia
-- es espejo LITERAL de la sección "NF-e" al final de db/schema.sql (lo
-- verifica test/migrate-facturacion.test.ts).
--
-- ── NF-e modelo 55: Brasil, venta de mercancías (oct 2026) ──────────────────
--
-- Riel `nfe` de los rieles fiscales de LatAm (src/lib/fiscal/latam/nfe/):
-- autorización directa ante la SEFAZ del estado del emisor. La nota, su número
-- y su protocolo viven en fiscal_rail_comprobantes como en los demás rieles;
-- aquí va lo que la NF-e tiene y el marco común no: los eventos de una nota
-- autorizada (cancelación 110111 y Carta de Correção 110110), la inutilização
-- de números y la contingencia en la SEFAZ Virtual (SVC).
--
-- Eventos: uno por (chave, tipo, secuencia) vivo. Un evento rechazado no
-- consume la secuencia: el índice único lo deja fuera para poder repetirla.
create table if not exists nfe_eventos (
  id             uuid        default gen_random_uuid() primary key,
  org_id         uuid        not null references orgs(id) on delete cascade,
  comprobante_id uuid        not null references fiscal_rail_comprobantes(id) on delete cascade,
  documento_id   uuid        not null references documentos_fiscales(id) on delete cascade,
  entorno        text        not null,
  chave          text        not null,
  tp_evento      text        not null,
  n_seq          int         not null,
  estado         text        not null default 'pendiente',
  pedido         jsonb       not null,
  xml_evento     text,
  respuesta      jsonb,
  n_prot         text,
  proc_xml       text,
  error_codigo   text,
  error_mensaje  text,
  creado_por     uuid,
  created_at     timestamptz not null default now(),
  registrado_at  timestamptz,
  check (entorno in ('homologacion', 'produccion')),
  check (tp_evento in ('110111', '110110')),
  check (n_seq between 1 and 20),
  check (estado in ('pendiente', 'registrado', 'rechazado', 'incierto'))
);
create unique index if not exists uq_nfe_eventos_vivo
  on nfe_eventos (org_id, chave, tp_evento, n_seq)
  where estado <> 'rechazado';
create index if not exists idx_nfe_eventos_documento on nfe_eventos (org_id, documento_id);

-- Inutilização de un rango de la serie que nunca se usó [MOC 5.3].
create table if not exists nfe_inutilizacoes (
  id             uuid        default gen_random_uuid() primary key,
  org_id         uuid        not null references orgs(id) on delete cascade,
  entorno        text        not null,
  serie          int         not null,
  n_ini          bigint      not null,
  n_fin          bigint      not null,
  justificativa  text        not null,
  estado         text        not null default 'pendiente',
  pedido         jsonb       not null,
  xml_pedido     text,
  respuesta      jsonb,
  n_prot         text,
  proc_xml       text,
  error_codigo   text,
  error_mensaje  text,
  creado_por     uuid,
  created_at     timestamptz not null default now(),
  homologada_at  timestamptz,
  check (entorno in ('homologacion', 'produccion')),
  check (serie between 0 and 999),
  check (n_ini > 0 and n_fin >= n_ini and n_fin - n_ini < 10000),
  check (estado in ('pendiente', 'homologada', 'rechazada', 'incierta'))
);
create index if not exists idx_nfe_inutilizacoes_serie on nfe_inutilizacoes (org_id, entorno, serie);

-- Lo que la SEFAZ ya registró no se reescribe ni se borra a mano: un evento
-- registrado y una inutilização homologada son definitivos (el borrado en
-- cascada de la organización o del documento sí pasa).
create or replace function cord_nfe_registro_inmutable()
returns trigger
language plpgsql
as $$
begin
  if TG_OP = 'DELETE' then
    if old.estado in ('registrado', 'homologada') and pg_trigger_depth() <= 1 then
      raise exception '%: un registro de la SEFAZ no se borra', TG_TABLE_NAME
        using errcode = 'restrict_violation';
    end if;
    return old;
  end if;
  if old.estado in ('registrado', 'homologada') and new is distinct from old then
    raise exception '%: un registro de la SEFAZ es definitivo', TG_TABLE_NAME;
  end if;
  if new.pedido is distinct from old.pedido or new.org_id is distinct from old.org_id
     or new.entorno is distinct from old.entorno or new.created_at is distinct from old.created_at then
    raise exception '%: el pedido no se modifica', TG_TABLE_NAME;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_nfe_evento_inmutable on nfe_eventos;
create trigger trg_nfe_evento_inmutable
  before update or delete on nfe_eventos
  for each row execute function cord_nfe_registro_inmutable();

drop trigger if exists trg_nfe_inutilizacao_inmutable on nfe_inutilizacoes;
create trigger trg_nfe_inutilizacao_inmutable
  before update or delete on nfe_inutilizacoes
  for each row execute function cord_nfe_registro_inmutable();

-- Contingencia en la SEFAZ Virtual (SVC-AN o SVC-RS) [MOC Anexo III]: una
-- abierta por organización y entorno. La abre la emisión cuando la SEFAZ
-- normal no recibe el pedido y la SVC de su estado responde 107; se cierra
-- sola cuando la SEFAZ normal vuelve a responder 107. `dh_cont` y `x_just`
-- son los que viajan en cada nota emitida en contingencia.
create table if not exists nfe_contingencias (
  id             uuid        default gen_random_uuid() primary key,
  org_id         uuid        not null references orgs(id) on delete cascade,
  entorno        text        not null,
  uf             text        not null,
  svc            text        not null,
  dh_cont        text        not null,
  x_just         text        not null,
  motivo         text,
  iniciada_at    timestamptz not null default now(),
  verificada_at  timestamptz,
  encerrada_at   timestamptz,
  check (entorno in ('homologacion', 'produccion')),
  check (svc in ('SVC-AN', 'SVC-RS'))
);
create unique index if not exists uq_nfe_contingencias_abierta
  on nfe_contingencias (org_id, entorno)
  where encerrada_at is null;

alter table nfe_eventos enable row level security;
drop policy if exists "rls_nfe_eventos" on nfe_eventos;
create policy "rls_nfe_eventos" on nfe_eventos
  using (org_id = nullif(current_setting('app.org_id', true), '')::uuid)
  with check (org_id = nullif(current_setting('app.org_id', true), '')::uuid);
alter table nfe_eventos force row level security;

alter table nfe_inutilizacoes enable row level security;
drop policy if exists "rls_nfe_inutilizacoes" on nfe_inutilizacoes;
create policy "rls_nfe_inutilizacoes" on nfe_inutilizacoes
  using (org_id = nullif(current_setting('app.org_id', true), '')::uuid)
  with check (org_id = nullif(current_setting('app.org_id', true), '')::uuid);
alter table nfe_inutilizacoes force row level security;

alter table nfe_contingencias enable row level security;
drop policy if exists "rls_nfe_contingencias" on nfe_contingencias;
create policy "rls_nfe_contingencias" on nfe_contingencias
  using (org_id = nullif(current_setting('app.org_id', true), '')::uuid)
  with check (org_id = nullif(current_setting('app.org_id', true), '')::uuid);
alter table nfe_contingencias force row level security;

-- Datos de NF-e del catálogo y del cliente (src/lib/fiscal/latam/nfe/produto.ts):
-- del producto, NCM, CEST, CFOP, origen, unidad, GTIN y su régimen del ICMS,
-- IPI, PIS/COFINS e IBS/CBS; del cliente, número, barrio, municipio IBGE,
-- indicador de IE e IE. Solo se capturan con la NF-e activa (regla 15) y se
-- congelan en la línea del documento al guardar el borrador. Nulo = sin NF-e.
alter table productos add column if not exists nfe jsonb;
alter table clientes add column if not exists nfe jsonb;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'cord_app') then
    grant select, insert, update, delete on nfe_eventos to cord_app;
    grant select, insert, update, delete on nfe_inutilizacoes to cord_app;
    grant select, insert, update, delete on nfe_contingencias to cord_app;
  end if;
end
$$;
-- END nfe

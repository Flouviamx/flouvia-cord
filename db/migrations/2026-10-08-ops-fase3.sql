-- BEGIN ops-fase3
-- 2026-10-08: Cord Ops fase 3 — ficha de organización como centro de mando.
-- Aditiva e idempotente: corre en cada build (scripts/migrate-ops-fase3.mjs,
-- encadenado en el buildCommand de vercel.json) porque el código de esta fase
-- lee estas tablas en producción.
--
-- 1. Lectura de Ops sobre el dinero y la entrega de webhooks de una
--    organización. Mismo contrato que `ops_payouts`: política PERMISIVA aparte,
--    solo `for select` y solo con `app.scope='ops'`. Ops reintenta entregas y
--    workflows, pero lo hace con la misma función que usa la app y en el carril
--    de la organización (withOrgTx), no ampliando estas políticas.
do $$
declare t text;
begin
  foreach t in array array['cobro_reembolsos', 'cobro_disputas', 'webhook_events', 'suscripcion_facturas'] loop
    continue when to_regclass(t) is null;
    execute format('drop policy if exists %I on %I', 'ops_' || t, t);
    execute format(
      'create policy %I on %I for select using (current_setting(''app.scope'', true) = ''ops'')',
      'ops_' || t, t);
  end loop;
end $$;

-- 2. Notas y etiquetas INTERNAS de Ops sobre una organización. Son de Cord, no
--    del negocio: "sospecha de fraude", "cliente estratégico", "prometimos
--    migrarle facturas". Llevan org_id para borrarse con la organización, así
--    que entran al contrato de RLS como cualquier tabla multi-tenant (ENABLE +
--    FORCE + políticas) — pero SOLO el carril de Ops las ve. Ningún carril de
--    la organización las alcanza: el negocio no lee lo que Cord anota de él.
create table if not exists ops_org_notes (
  id                  uuid        primary key default gen_random_uuid(),
  org_id              uuid        not null references orgs(id) on delete cascade,
  author_operator_id  uuid        references ops_operators(user_id) on delete set null,
  author_email        text        not null,
  body                text        not null check (char_length(btrim(body)) between 1 and 2000),
  created_at          timestamptz not null default now()
);
create index if not exists idx_ops_org_notes_org on ops_org_notes(org_id, created_at desc);

create table if not exists ops_org_tags (
  org_id      uuid        not null references orgs(id) on delete cascade,
  tag         text        not null check (tag ~ '^[a-z0-9][a-z0-9-]{0,23}$'),
  created_by  text        not null,
  created_at  timestamptz not null default now(),
  primary key (org_id, tag)
);
create index if not exists idx_ops_org_tags_tag on ops_org_tags(tag);

alter table ops_org_notes enable row level security;
alter table ops_org_notes force row level security;
alter table ops_org_tags enable row level security;
alter table ops_org_tags force row level security;
do $$
declare t text;
begin
  foreach t in array array['ops_org_notes', 'ops_org_tags'] loop
    execute format('drop policy if exists %I on %I', t || '_select', t);
    execute format('create policy %I on %I for select using (current_setting(''app.scope'', true) = ''ops'')', t || '_select', t);
    execute format('drop policy if exists %I on %I', t || '_insert', t);
    execute format('create policy %I on %I for insert with check (current_setting(''app.scope'', true) = ''ops'')', t || '_insert', t);
    execute format('drop policy if exists %I on %I', t || '_delete', t);
    execute format('create policy %I on %I for delete using (current_setting(''app.scope'', true) = ''ops'')', t || '_delete', t);
  end loop;
end $$;
-- END ops-fase3

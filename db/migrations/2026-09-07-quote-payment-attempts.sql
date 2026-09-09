-- BEGIN quote-payment-attempts
-- One durable creation per predecessor, shared by competing payment methods.
-- Do not delete an unresolved attempt: the provider may already have created it.
create unique index if not exists uq_cotizacion_cobros_org_id_id
  on cotizacion_cobros(org_id, id);
create table if not exists cotizacion_pago_intentos (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id),
  cobro_id uuid not null,
  predecessor text not null,
  request_hash text not null check (request_hash ~ '^[0-9a-f]{64}$'),
  stripe_payment_intent_id text,
  created_at timestamptz not null default now(),
  unique (org_id, cobro_id, predecessor),
  foreign key (org_id, cobro_id) references cotizacion_cobros(org_id, id)
);
alter table cotizacion_pago_intentos enable row level security;
alter table cotizacion_pago_intentos force row level security;
drop policy if exists rls_cotizacion_pago_intentos on cotizacion_pago_intentos;
create policy rls_cotizacion_pago_intentos on cotizacion_pago_intentos
  using (org_id = nullif(current_setting('app.org_id', true), '')::uuid)
  with check (org_id = nullif(current_setting('app.org_id', true), '')::uuid);
-- END quote-payment-attempts

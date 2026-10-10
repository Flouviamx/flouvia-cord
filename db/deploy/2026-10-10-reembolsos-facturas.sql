-- Reembolso del pago de una factura desde Cord (oct 2026). Aditiva e
-- idempotente; cada sentencia es espejo LITERAL de db/schema.sql (sección
-- "reembolsos-facturas"). Corre antes del build: la ruta de reembolso y el
-- reparto (allocateInvoiceRefund) leen esta tabla.

create table if not exists documento_reembolso_solicitudes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  documento_id uuid not null references documentos_fiscales(id) on delete cascade,
  pago_id uuid not null,
  proveedor text not null check (proveedor in ('stripe', 'mercadopago')),
  stripe_payment_intent_id text,
  mp_payment_id text,
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  nonce_hash text not null unique,
  max_factura numeric not null check (max_factura >= 0),
  max_cobro numeric not null check (max_cobro >= 0),
  expires_at timestamptz not null,
  estado text not null default 'autorizada' check (estado in ('autorizada', 'enviada', 'registrada', 'fallida')),
  alcance text check (alcance is null or alcance in ('factura', 'cobro')),
  monto numeric check (monto is null or monto > 0),
  motivo text,
  stripe_refund_id text,
  mp_refund_id text,
  error_ref text,
  creado_por uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((proveedor = 'stripe' and stripe_payment_intent_id is not null)
      or (proveedor = 'mercadopago' and mp_payment_id is not null))
);

create unique index if not exists uq_documento_reembolso_solicitudes_stripe
  on documento_reembolso_solicitudes(org_id, stripe_refund_id) where stripe_refund_id is not null;

create unique index if not exists uq_documento_reembolso_solicitudes_mp
  on documento_reembolso_solicitudes(org_id, mp_refund_id) where mp_refund_id is not null;

create index if not exists idx_documento_reembolso_solicitudes_pi
  on documento_reembolso_solicitudes(org_id, stripe_payment_intent_id) where stripe_payment_intent_id is not null;

create index if not exists idx_documento_reembolso_solicitudes_mp
  on documento_reembolso_solicitudes(org_id, mp_payment_id) where mp_payment_id is not null;

alter table documento_reembolso_solicitudes enable row level security;

alter table documento_reembolso_solicitudes force row level security;

drop policy if exists rls_documento_reembolso_solicitudes on documento_reembolso_solicitudes;

create policy rls_documento_reembolso_solicitudes on documento_reembolso_solicitudes
  using (org_id = nullif(current_setting('app.org_id', true), '')::uuid)
  with check (org_id = nullif(current_setting('app.org_id', true), '')::uuid);

do $$ begin
  if exists (select 1 from pg_roles where rolname = 'cord_app') then
    grant select, insert, update on documento_reembolso_solicitudes to cord_app;
  end if;
end $$;

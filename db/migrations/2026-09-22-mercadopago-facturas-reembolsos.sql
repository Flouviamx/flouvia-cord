-- Mercado Pago en facturas y lectura de reembolsos.
alter table documentos_fiscales add column if not exists mp_preference_id text;
alter table documentos_fiscales add column if not exists mp_preference_at timestamptz;
alter table documento_pagos add column if not exists mp_payment_id text;
create unique index if not exists uq_documento_pagos_mp
  on documento_pagos(documento_id, mp_payment_id) where mp_payment_id is not null;

alter table cobro_reembolsos add column if not exists mp_refund_id text;
create unique index if not exists uq_cobro_reembolsos_mp
  on cobro_reembolsos(mp_refund_id) where mp_refund_id is not null;

alter table documento_reembolsos add column if not exists mp_refund_id text;
alter table documento_reembolsos add column if not exists mp_payment_id text;
alter table documento_reembolsos drop constraint if exists documento_reembolsos_pkey;
alter table documento_reembolsos alter column stripe_refund_id drop not null;
alter table documento_reembolsos alter column stripe_payment_intent_id drop not null;
create unique index if not exists uq_documento_reembolsos_stripe
  on documento_reembolsos(org_id, stripe_refund_id) where stripe_refund_id is not null;
create unique index if not exists uq_documento_reembolsos_mp
  on documento_reembolsos(org_id, mp_refund_id) where mp_refund_id is not null;
alter table documento_reembolsos drop constraint if exists documento_reembolsos_proveedor_ck;
alter table documento_reembolsos add constraint documento_reembolsos_proveedor_ck
  check ((stripe_refund_id is not null and stripe_payment_intent_id is not null)
      or (mp_refund_id is not null and mp_payment_id is not null));
create index if not exists idx_documento_reembolsos_mp on documento_reembolsos(org_id, mp_payment_id);

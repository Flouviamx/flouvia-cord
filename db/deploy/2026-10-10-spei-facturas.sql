-- SPEI con CLABE en facturas (oct 2026). Aditiva e idempotente; cada sentencia
-- es espejo LITERAL de db/schema.sql (sección "SPEI con CLABE en facturas").
-- Corre antes del build: /api/i/[token]/payment-intent y el webhook leen esta
-- columna, y no llegan a producción sin ella.

alter table documentos_fiscales add column if not exists stripe_spei_customer_id text;

create unique index if not exists uq_documentos_fiscales_spei_customer
  on documentos_fiscales(org_id, stripe_spei_customer_id) where stripe_spei_customer_id is not null;

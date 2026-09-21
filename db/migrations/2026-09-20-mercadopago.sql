-- Mercado Pago como segundo riel de cobro en línea.
--
-- Stripe no abre cuentas conectadas en Colombia, Argentina, Chile ni Perú, así
-- que esas cuentas cotizaban y facturaban pero no podían cobrar con tarjeta.
-- Mercado Pago cubre ese hueco con el mismo modelo: el dinero llega a la cuenta
-- del negocio, no a Cord.
--
-- Los tokens son credenciales de dinero: van CIFRADOS, nunca en claro.
alter table orgs add column if not exists mp_user_id text;
alter table orgs add column if not exists mp_access_token_enc text;
alter table orgs add column if not exists mp_refresh_token_enc text;
alter table orgs add column if not exists mp_token_expira timestamptz;
alter table orgs add column if not exists mp_charges_enabled boolean not null default false;

-- Un cobro guarda su preferencia y, al liquidarse, el pago que lo saldó. El
-- `unique` del pago es lo que hace idempotente el webhook: Mercado Pago reenvía
-- la misma notificación varias veces por diseño.
alter table cotizacion_cobros add column if not exists mp_preference_id text;
alter table cotizacion_cobros add column if not exists mp_payment_id text;
create unique index if not exists uq_cobros_mp_payment on cotizacion_cobros(org_id, mp_payment_id)
  where mp_payment_id is not null;

-- El alta de Mercado Pago reusa la tabla de estados de OAuth: es el mismo
-- problema (un state de un solo uso, atado a la persona y con vencimiento).
alter table integracion_oauth_estados drop constraint if exists integracion_oauth_estados_proveedor_check;
alter table integracion_oauth_estados add constraint integracion_oauth_estados_proveedor_check
  check (proveedor in ('hubspot', 'mercadopago'));

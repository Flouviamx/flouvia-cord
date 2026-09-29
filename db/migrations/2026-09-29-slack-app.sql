-- 2026-09-29: la app de Slack guarda su conexión (bot token y team id).

alter table integracion_conexiones drop constraint if exists integracion_conexiones_proveedor_check;
alter table integracion_conexiones add constraint integracion_conexiones_proveedor_check
  check (proveedor in ('hubspot', 'shopify', 'google_sheets', 'excel', 'quickbooks', 'xero', 'gmail', 'slack'));
alter table integracion_conexiones drop constraint if exists integracion_conexiones_cuenta_externa_check;
alter table integracion_conexiones add constraint integracion_conexiones_cuenta_externa_check
  check (
    cuenta_externa ~ '^[0-9]{1,20}$'
    or cuenta_externa ~ '^[a-z0-9][a-z0-9-]{0,59}\.myshopify\.com$'
    or cuenta_externa ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    or (cuenta_externa ~ '^[^@[:space:]]{1,128}@[^@[:space:]]{1,127}$' and length(cuenta_externa) <= 254)
    or cuenta_externa ~ '^T[A-Z0-9]{6,20}$'
  );

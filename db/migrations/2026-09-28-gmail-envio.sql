-- 2026-09-28: el negocio conecta su Gmail para que Cord mande desde ahí los
-- correos a sus clientes (cotización, factura, recordatorio de pago).

alter table integracion_conexiones drop constraint if exists integracion_conexiones_proveedor_check;
alter table integracion_conexiones add constraint integracion_conexiones_proveedor_check
  check (proveedor in ('hubspot', 'shopify', 'google_sheets', 'excel', 'quickbooks', 'xero', 'gmail'));

alter table integracion_oauth_estados drop constraint if exists integracion_oauth_estados_proveedor_check;
alter table integracion_oauth_estados add constraint integracion_oauth_estados_proveedor_check
  check (proveedor in ('hubspot', 'mercadopago', 'slack', 'teams', 'shopify',
                       'google_sheets', 'excel', 'quickbooks', 'xero', 'gmail'));

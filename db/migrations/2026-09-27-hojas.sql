-- Google Sheets y Excel entran al mismo carril que HubSpot y Shopify: una
-- conexión por organización. La cuenta es el correo con el que la persona
-- autorizó, porque es lo único que identifica al dueño del archivo en ambos
-- proveedores.
alter table integracion_conexiones drop constraint if exists integracion_conexiones_proveedor_check;
alter table integracion_conexiones add constraint integracion_conexiones_proveedor_check
  check (proveedor in ('hubspot', 'shopify', 'google_sheets', 'excel'));

alter table integracion_conexiones drop constraint if exists integracion_conexiones_cuenta_externa_check;
alter table integracion_conexiones add constraint integracion_conexiones_cuenta_externa_check
  check (
    cuenta_externa ~ '^[0-9]{1,20}$'
    or cuenta_externa ~ '^[a-z0-9][a-z0-9-]{0,59}\.myshopify\.com$'
    or (cuenta_externa ~ '^[^@[:space:]]{1,128}@[^@[:space:]]{1,127}$' and length(cuenta_externa) <= 254)
  );

alter table integracion_oauth_estados drop constraint if exists integracion_oauth_estados_proveedor_check;
alter table integracion_oauth_estados add constraint integracion_oauth_estados_proveedor_check
  check (proveedor in ('hubspot', 'mercadopago', 'slack', 'teams', 'shopify', 'google_sheets', 'excel'));

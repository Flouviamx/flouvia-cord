-- Shopify entra al mismo carril que HubSpot: una conexión por organización, con
-- el dominio de la tienda como cuenta. Los checks originales eran de HubSpot.
alter table integracion_conexiones drop constraint if exists integracion_conexiones_proveedor_check;
alter table integracion_conexiones add constraint integracion_conexiones_proveedor_check
  check (proveedor in ('hubspot', 'shopify'));
alter table integracion_conexiones drop constraint if exists integracion_conexiones_cuenta_externa_check;
alter table integracion_conexiones add constraint integracion_conexiones_cuenta_externa_check
  check (cuenta_externa ~ '^[0-9]{1,20}$' or cuenta_externa ~ '^[a-z0-9][a-z0-9-]{0,59}\.myshopify\.com$');
alter table integracion_vinculos drop constraint if exists integracion_vinculos_objeto_check;
alter table integracion_vinculos add constraint integracion_vinculos_objeto_check
  check (objeto in ('client', 'client_contact', 'quote', 'product'));
alter table integracion_vinculos drop constraint if exists integracion_vinculos_externo_tipo_check;
alter table integracion_vinculos add constraint integracion_vinculos_externo_tipo_check
  check (externo_tipo in ('company', 'contact', 'deal', 'shopify_product', 'shopify_customer'));
alter table integracion_oauth_estados drop constraint if exists integracion_oauth_estados_proveedor_check;
alter table integracion_oauth_estados add constraint integracion_oauth_estados_proveedor_check
  check (proveedor in ('hubspot', 'mercadopago', 'slack', 'teams', 'shopify'));

-- El token de Shopify es "offline": no vence y no hay refresh que guardar. La
-- condición original era de HubSpot, donde el refresh ES la credencial viva.
alter table integracion_conexiones drop constraint if exists integracion_conexiones_check;
alter table integracion_conexiones add constraint integracion_conexiones_credencial_viva_check
  check (estado = 'desconectada' or proveedor = 'shopify' or refresh_token_enc is not null);
alter table integracion_conexiones drop constraint if exists integracion_conexiones_credencial_activa_check;
alter table integracion_conexiones add constraint integracion_conexiones_credencial_activa_check
  check (estado <> 'desconectada' or (refresh_token_enc is null and access_token_enc is null));
alter table integracion_conexiones drop constraint if exists integracion_conexiones_check1;

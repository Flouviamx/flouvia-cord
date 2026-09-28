-- QuickBooks Online y Xero entran al mismo carril que HubSpot, Shopify y las
-- hojas. La cuenta es el identificador de la EMPRESA del lado del proveedor:
-- QuickBooks usa un realmId numérico y Xero un tenantId con forma de UUID.
alter table integracion_conexiones drop constraint if exists integracion_conexiones_proveedor_check;
alter table integracion_conexiones add constraint integracion_conexiones_proveedor_check
  check (proveedor in ('hubspot', 'shopify', 'google_sheets', 'excel', 'quickbooks', 'xero'));

alter table integracion_conexiones drop constraint if exists integracion_conexiones_cuenta_externa_check;
alter table integracion_conexiones add constraint integracion_conexiones_cuenta_externa_check
  check (
    cuenta_externa ~ '^[0-9]{1,20}$'
    or cuenta_externa ~ '^[a-z0-9][a-z0-9-]{0,59}\.myshopify\.com$'
    or cuenta_externa ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    or (cuenta_externa ~ '^[^@[:space:]]{1,128}@[^@[:space:]]{1,127}$' and length(cuenta_externa) <= 254)
  );

alter table integracion_oauth_estados drop constraint if exists integracion_oauth_estados_proveedor_check;
alter table integracion_oauth_estados add constraint integracion_oauth_estados_proveedor_check
  check (proveedor in ('hubspot', 'mercadopago', 'slack', 'teams', 'shopify',
                       'google_sheets', 'excel', 'quickbooks', 'xero'));

-- Una factura de Cord se vincula con su documento en la contabilidad, y un
-- cliente con su Customer (QuickBooks) o Contact (Xero). El vínculo es lo que
-- impide contabilizar dos veces la misma factura.
alter table integracion_vinculos drop constraint if exists integracion_vinculos_objeto_check;
alter table integracion_vinculos add constraint integracion_vinculos_objeto_check
  check (objeto in ('client', 'client_contact', 'quote', 'product', 'invoice'));

alter table integracion_vinculos drop constraint if exists integracion_vinculos_externo_tipo_check;
alter table integracion_vinculos add constraint integracion_vinculos_externo_tipo_check
  check (externo_tipo in ('company', 'contact', 'deal',
                          'shopify_product', 'shopify_customer', 'shopify_draft_order', 'shopify_order',
                          'qbo_customer', 'qbo_invoice', 'xero_contact', 'xero_invoice'));

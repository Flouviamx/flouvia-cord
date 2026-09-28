-- El identificador externo no siempre es numérico. HubSpot, Shopify y
-- QuickBooks usan números, así que la restricción original —solo dígitos— nunca
-- estorbó; Xero usa UUID, y ahí el vínculo no se podía guardar: la factura se
-- creaba del lado del proveedor y Cord no podía recordarla, que es exactamente
-- el camino a contabilizar la misma factura dos veces.
--
-- Sigue siendo estricta a propósito: con este valor se arman rutas hacia el
-- proveedor, así que se admite lo que esos proveedores emiten y nada más. Un
-- formato nuevo se agrega aquí, igual que la lista de proveedores.
alter table integracion_vinculos drop constraint if exists integracion_vinculos_externo_id_check;
alter table integracion_vinculos add constraint integracion_vinculos_externo_id_check
  check (
    externo_id ~ '^[0-9]{1,20}$'
    or externo_id ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
  );

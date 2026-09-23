-- Fase 2 de Shopify: el pedido que Cord crea al cerrar la cotización.
alter table integracion_vinculos drop constraint if exists integracion_vinculos_externo_tipo_check;
alter table integracion_vinculos add constraint integracion_vinculos_externo_tipo_check
  check (externo_tipo in ('company', 'contact', 'deal', 'shopify_product', 'shopify_customer', 'shopify_draft_order', 'shopify_order'));

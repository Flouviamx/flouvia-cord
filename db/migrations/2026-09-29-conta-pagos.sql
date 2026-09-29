-- 2026-09-29: pagos entre Cord y QuickBooks/Xero se ligan como vinculo `payment`.

alter table integracion_vinculos drop constraint if exists integracion_vinculos_objeto_check;
alter table integracion_vinculos add constraint integracion_vinculos_objeto_check
  check (objeto in ('client', 'client_contact', 'quote', 'product', 'invoice', 'payment'));
alter table integracion_vinculos drop constraint if exists integracion_vinculos_externo_tipo_check;
alter table integracion_vinculos add constraint integracion_vinculos_externo_tipo_check
  check (externo_tipo in ('company', 'contact', 'deal',
                          'shopify_product', 'shopify_customer', 'shopify_draft_order', 'shopify_order',
                          'qbo_customer', 'qbo_invoice', 'qbo_payment', 'xero_contact', 'xero_invoice', 'xero_payment'));

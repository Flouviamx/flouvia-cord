-- Factura electrónica europea (EN 16931: Factur-X, XRechnung, Peppol BIS
-- Billing 3.0), oct 2026. Aditiva e idempotente; la aplica
-- scripts/migrate-facturacion.mjs en cada despliegue, ANTES del build. Cada
-- sentencia es espejo literal de db/schema.sql (test/migrate-facturacion.test.ts).

-- Referencia del comprador (BT-10, Leitweg-ID) y orden de compra (BT-13) de
-- cada factura, y la cuenta para transferencia congelada al emitir (BT-84/86).

alter table documentos_fiscales add column if not exists buyer_reference text;

alter table documentos_fiscales add column if not exists purchase_order text;

alter table documentos_fiscales add column if not exists payee_account jsonb;

-- Del cliente: su dirección electrónica (BT-49) y la referencia que la factura
-- toma por defecto.

alter table clientes add column if not exists einvoice_address text;

alter table clientes add column if not exists buyer_reference text;

-- El perfil exento del catálogo admite también la clasificación VATEX para
-- los países de la UE fuera de España.

alter table impuestos drop constraint if exists chk_impuestos_exemption_reason;

alter table impuestos add constraint chk_impuestos_exemption_reason
  check (exemption_reason is null or (kind = 'exento' and exemption_reason in ('E1','E2','E3','E4','E5','E6','N1','N2','S2','VATEX-EU-AE','VATEX-EU-IC','VATEX-EU-G','VATEX-EU-O','Z','VATEX-EU-132','VATEX-EU-135-1','VATEX-EU-79-C','VATEX-EU-148','VATEX-EU-151','VATEX-EU-309','VATEX-FR-FRANCHISE')));

alter table cotizacion_items drop constraint if exists chk_cotizacion_items_exemption_reason;

alter table cotizacion_items add constraint chk_cotizacion_items_exemption_reason
  check (exemption_reason is null or exemption_reason in ('E1','E2','E3','E4','E5','E6','N1','N2','S2','VATEX-EU-AE','VATEX-EU-IC','VATEX-EU-G','VATEX-EU-O','Z','VATEX-EU-132','VATEX-EU-135-1','VATEX-EU-79-C','VATEX-EU-148','VATEX-EU-151','VATEX-EU-309','VATEX-FR-FRANCHISE'));

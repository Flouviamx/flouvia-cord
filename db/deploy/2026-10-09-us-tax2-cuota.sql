-- Migración aditiva e idempotente de la cuota del sales tax automático de
-- EE. UU. (oct 2026): el contador mensual `uso_periodo.us_tax`, la reserva de
-- cada registro (`us_tax_calculos.uso_id`) y el CHECK de dimensiones de
-- `usage_reservations` con 'documento' y 'us_tax'. Corre en cada despliegue
-- ANTES del build (vercel.json → scripts/migrate-facturacion.mjs), después de
-- 2026-10-09-us-tax.sql, que crea us_tax_calculos: el nombre `us-tax2` ordena
-- detrás de `us-tax.` a propósito (`-` ordena antes que `.`). Cada sentencia
-- es espejo LITERAL de la sección "Cuota del sales tax automático de EE. UU."
-- al final de db/schema.sql (lo verifica test/migrate-facturacion.test.ts).
-- El CHECK solo se re-declara si a la restricción viva le falta alguna de sus
-- dimensiones; una vez aplicada, el despliegue siguiente no toma candados.

-- ── Cuota del sales tax automático de EE. UU. (oct 2026) ────────────────────
-- Cada venta con sales tax por dirección que se registra para la declaración
-- del negocio (la Tax Transaction de us_tax_calculos) le cuesta a Cord USD 0.50
-- en el proveedor. Decisión de André: se cobra como los timbres de CFDI, con su
-- PROPIO contador y su propio precio — cuota incluida por plan (INCLUDED.us_tax
-- en src/lib/billing.ts: 10/25/60/150) y excedente medido. Reusar `cfdi` haría
-- perder dinero: su excedente es menor que el costo de la venta.
--
-- `uso_periodo.us_tax` cuenta las ventas registradas del mes (reservadas antes
-- de llamar al proveedor y liberadas si el registro falla). `us_tax_calculos.uso_id`
-- es la reserva de ESE registro: un reintento (o dos procesos a la vez) la
-- reusan en vez de contar dos veces la misma venta, y la reconciliación de
-- Billing confirma una reserva cuyo registro sí ocurrió.
--
-- El CHECK de usage_reservations se re-declara con las siete dimensiones que
-- usa el código: 'documento' (documentos comerciales) tampoco estaba, así que
-- en una base con este CHECK la reserva de un documento comercial fallaba.
alter table uso_periodo add column if not exists us_tax int not null default 0;
alter table usage_reservations drop constraint if exists usage_reservations_dimension_check;
alter table usage_reservations add constraint usage_reservations_dimension_check
  check (dimension in ('api','usuario','ia','timbrado','envios','documento','us_tax'));
alter table us_tax_calculos add column if not exists uso_id uuid;
create index if not exists idx_us_tax_calculos_uso on us_tax_calculos (uso_id) where uso_id is not null;
-- END sales-tax-cuota

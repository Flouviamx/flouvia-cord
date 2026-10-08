-- Migración aditiva e idempotente de México (oct 2026): claves SAT por línea,
-- factura global y sustitución de CFDI. Corre en cada despliegue
-- (vercel.json → scripts/migrate-facturacion.mjs, que lee todos los archivos de
-- db/deploy/ en orden de nombre) ANTES del build. Cada sentencia es espejo
-- LITERAL de db/schema.sql (lo verifica test/migrate-facturacion.test.ts).

-- Claves SAT propias de la línea de una cotización.

alter table cotizacion_items add column if not exists clave_sat text
  check (clave_sat is null or clave_sat ~ '^[0-9]{8}$');

alter table cotizacion_items add column if not exists clave_unidad_sat text
  check (clave_unidad_sat is null or clave_unidad_sat ~ '^[A-Z0-9]{1,3}$');

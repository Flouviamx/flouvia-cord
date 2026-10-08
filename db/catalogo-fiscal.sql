-- Migración aditiva e idempotente que corre en cada despliegue (vercel.json →
-- scripts/migrate-catalogo-fiscal.mjs) ANTES del build, para que el código que
-- lee estas columnas nunca llegue a producción sin ellas. Espejo exacto de
-- db/schema.sql; la función cord_term_days() y la vista cuentas_por_cobrar se
-- toman de ahí mismo por el script, no se copian.

-- Impuesto sugerido por producto (fracción; null = default de la org).
alter table productos add column if not exists tax_rate numeric
  check (tax_rate is null or (tax_rate >= 0 and tax_rate <= 1));

-- Claves SAT del CFDI por producto.
alter table productos add column if not exists clave_sat text
  check (clave_sat is null or clave_sat ~ '^[0-9]{8}$');
alter table productos add column if not exists clave_unidad_sat text
  check (clave_unidad_sat is null or clave_unidad_sat ~ '^[A-Z0-9]{1,3}$');

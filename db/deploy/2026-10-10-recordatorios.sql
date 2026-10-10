-- Migración aditiva e idempotente (oct 2026): el calendario de recordatorios
-- de factura se configura desde Ajustes › Recordatorios. Corre en cada
-- despliegue ANTES del build (vercel.json → scripts/migrate-facturacion.mjs).
-- Cada sentencia es espejo LITERAL de la sección "Escalera de recordatorios"
-- de db/schema.sql (lo verifica test/migrate-facturacion.test.ts).
--
-- `recordatorio_etapas` ya existía (ago 2026) sin pantalla que la editara; se
-- repite aquí para que el código que ahora la escribe no dependa de que la
-- migración completa se haya corrido. Si ya está, el script la salta sin tomar
-- candados.
alter table orgs add column if not exists recordatorio_etapas int[] not null default '{-7,-1,3,7,14,30}';
alter table orgs add column if not exists recordatorios_activos boolean not null default true;
-- END recordatorios

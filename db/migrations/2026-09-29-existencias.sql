-- 2026-09-29: existencias de productos que vienen de Shopify.

-- Existencias de la tienda conectada: null = el producto no controla inventario.
alter table productos add column if not exists existencias numeric;
alter table productos add column if not exists existencias_at timestamptz;

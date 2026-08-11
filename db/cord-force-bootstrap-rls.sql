-- SEGUNDA ventana, nunca junto con db/cord-app-role.sql.
-- Requisitos antes de ejecutar:
--   1. DATABASE_URL de staging usa cord_app por al menos 48 horas.
--   2. npm run security:rls solo reporta orgs/org_members sin FORCE.
--   3. Login, cambio de organización, sandbox, webhook y portal público pasan.
alter table orgs force row level security;
alter table org_members force row level security;

-- Revert de esta ventana. No desactiva RLS ni cambia DATABASE_URL.
-- alter table orgs no force row level security;
-- alter table org_members no force row level security;

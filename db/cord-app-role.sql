-- Ejecutar como dueño de la base durante la ventana F10. No define password:
-- establécelo fuera del repo y construye DATABASE_URL con esa credencial.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'cord_app') then
    create role cord_app login nobypassrls;
  end if;
end $$;
alter role cord_app nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
grant usage on schema public to cord_app;
grant select, insert, update, delete on all tables in schema public to cord_app;
grant usage, select on all sequences in schema public to cord_app;
alter default privileges in schema public grant select, insert, update, delete on tables to cord_app;
alter default privileges in schema public grant usage, select on sequences to cord_app;
grant execute on function cord_resolve_org_for_connected_account(text) to cord_app;
grant execute on function cord_demo_org_id() to cord_app;
grant execute on function cord_resolve_public_quote(text) to cord_app;
grant execute on function cord_pending_payment_count() to cord_app;
grant execute on function cord_resolve_org_for_quote(uuid, text) to cord_app;
grant execute on function cord_resolve_org_for_billing(text, text) to cord_app;
grant execute on function cord_resolve_org_for_quote_subscription(text, text) to cord_app;

-- ⚠️ Faltaba: `cord_effective_plan` está revocada de public en db/schema.sql y
-- nunca se le concedió a cord_app. La consultan las políticas y media aplicación
-- (entitlements, webhooks, SSO, cobranza): sin este grant, la ventana 1 rompe
-- todo lo que dependa del plan efectivo, que es casi todo lo de pago.
grant execute on function cord_effective_plan(uuid) to cord_app;

-- Gemela de cord_resolve_public_quote para la factura pública /i/[token]; seguía
-- accesible solo porque nadie la había revocado de public.
grant execute on function cord_resolve_public_invoice(text) to cord_app;

-- Carriles resueltos en la auditoría de ago 2026 (ver db/RUNBOOK-cord-app.md).
-- Todos son funciones ESTRECHAS para flujos que corren antes de que exista
-- membresía, o que cruzan organizaciones por necesidad.
grant execute on function cord_account_owned_orgs(uuid) to cord_app;
grant execute on function cord_account_scrub(uuid, text) to cord_app;
grant execute on function cord_resolve_invitation(text) to cord_app;
grant execute on function cord_resolve_sso_connection(uuid) to cord_app;
grant execute on function cord_resolve_sso_domain(text) to cord_app;
grant execute on function cord_sso_record_error(uuid, text) to cord_app;
grant execute on function cord_sso_requirement_for(uuid) to cord_app;
grant execute on function cord_resolve_inbound_email(text, text) to cord_app;

-- Revert operativo (ejecutar solo si la ventana falla): cambiar DATABASE_URL
-- al rol dueño anterior. No se elimina cord_app ni se desactiva RLS.

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

-- Revert operativo (ejecutar solo si la ventana falla): cambiar DATABASE_URL
-- al rol dueño anterior. No se elimina cord_app ni se desactiva RLS.

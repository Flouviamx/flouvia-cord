// Additive only. Dry-run by default. Never prints connection strings or tenant data.
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { neon } from '@neondatabase/serverless';
import { customerDomainStatements } from './lib/customer-domain-migration.mjs';

const connection = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
assert.ok(connection, 'DATABASE_URL no configurada');
const sql = neon(connection);
const source = readFileSync(new URL('../db/migrations/custom-domains.sql', import.meta.url), 'utf8');
assert.ok(readFileSync(new URL('../db/schema.sql', import.meta.url), 'utf8').includes(source.trim()), 'schema.sql y migración divergen');
const statements = customerDomainStatements(source);
const [before] = await sql`select
  to_regclass('public.org_domains') is not null as table_exists,
  to_regclass('public.orgs') is not null as orgs_exists,
  exists(select 1 from pg_roles where rolname='cord_app') as app_role_exists,
  exists(select 1 from pg_roles where rolname='cord_app' and not rolbypassrls and not rolsuper) as app_role_safe,
  (select rolsuper or rolbypassrls from pg_roles where rolname=current_user) as can_create_discovery`;
console.log(JSON.stringify({ phase: 'preflight', ...before, statements: statements.length }));
assert.equal(before.orgs_exists, true, 'No es una base Cord');
if (before.app_role_exists) assert.equal(before.app_role_safe, true, 'cord_app no debe tener bypass RLS');
else console.log('Aviso: cord_app no está provisionado. Esta migración no crea credenciales ni cambia el rol de la aplicación; queda pendiente el runbook de aislamiento.');
assert.equal(before.can_create_discovery, true, 'Ejecuta como dueño autorizado para crear el resolver SECURITY DEFINER');
if (!process.argv.includes('--apply')) {
  console.log('Dry-run: ninguna escritura. --apply instala solo dominios propios.');
  process.exit(0);
}
await sql.transaction([
  sql`select set_config('lock_timeout','5s',true), set_config('statement_timeout','30s',true)`,
  ...statements.map(statement => sql.query(statement, [])),
  // Assertions run before commit so a bad security contract rolls back the DDL.
  sql`do $$ begin
    if not exists(select 1 from pg_class where oid='public.org_domains'::regclass and relrowsecurity and relforcerowsecurity) then
      raise exception 'org_domains requires FORCE RLS';
    end if;
    if exists(select 1 from pg_roles where rolname='cord_app') then
      if not has_function_privilege('cord_app','public.cord_resolve_customer_domain(text)','EXECUTE') then
        raise exception 'cord_app requires discovery execute';
      end if;
      if not has_table_privilege('cord_app','public.org_domains','SELECT,INSERT,UPDATE,DELETE') then
        raise exception 'cord_app requires domain CRUD';
      end if;
    end if;
    if exists(select 1 from pg_proc p, lateral aclexplode(p.proacl) a
      where p.oid='public.cord_resolve_customer_domain(text)'::regprocedure and a.grantee=0 and a.privilege_type='EXECUTE') then
      raise exception 'Public discovery permission must be revoked';
    end if;
  end $$`,
]);
console.log(`Dominios instalados: ENABLE/FORCE RLS y resolver limitado; permisos cord_app ${before.app_role_exists ? 'verificados' : 'pendientes del aprovisionamiento de ese rol'}. Sin modificar cotizaciones, pagos ni DNS.`);

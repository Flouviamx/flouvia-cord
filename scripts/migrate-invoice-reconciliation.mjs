// Additive, bounded migration. Dry-run by default; --apply commits atomically.
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { neon } from '@neondatabase/serverless';

const connection = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
assert.ok(connection, 'DATABASE_URL no configurada');
const sql = neon(connection);
const source = readFileSync(new URL('../db/schema.sql', import.meta.url), 'utf8');
const start = source.indexOf('-- Conciliación de facturas:');
const end = source.indexOf('-- Fin de migración de conciliación de facturas.', start);
assert.ok(start >= 0 && end > start, 'Faltan límites de la migración');
// This bounded block has only DDL; remove line comments before splitting so a
// semicolon in explanatory prose can never become an executable fragment.
const statements = source.slice(start, end).replace(/^\s*--.*$/gm, '').split(';').map(s => s.trim()).filter(Boolean);
const [before] = await sql`
  select (select count(*) from documentos_fiscales)::int as documents,
    (select count(*) from documentos_fiscales where credit_note_of is not null and status='issued' and lifecycle<>'void')::int as active_credit_notes,
    (select count(*) from documentos_fiscales n join documentos_fiscales d on d.id=n.credit_note_of
      where n.org_id<>d.org_id or n.currency<>d.currency or d.credit_note_of is not null)::int as invalid_relations,
    (select count(*) from information_schema.columns where table_schema='public' and table_name='documentos_fiscales'
      and column_name in ('amount_credited','amount_refunded','refund_due'))::int as balance_columns`;
console.log(JSON.stringify({ phase: 'preflight', ...before }));
if (!process.argv.includes('--apply')) {
  console.log('Dry-run: ninguna escritura. Usa --apply para ejecutar la migración preparada.');
  process.exit(0);
}

await sql.transaction([
  sql`select set_config('lock_timeout','5s',true), set_config('statement_timeout','30s',true)`,
  sql`lock table documentos_fiscales in share row exclusive mode`,
  sql`do $$ begin
    if exists(select 1 from documentos_fiscales where credit_note_of is not null and status='issued' and lifecycle<>'void') then
      raise exception 'Revisar y conciliar notas históricas antes de esta migración';
    end if;
    if exists(select 1 from documentos_fiscales n join documentos_fiscales d on d.id=n.credit_note_of
      where n.org_id<>d.org_id or n.currency<>d.currency or d.credit_note_of is not null) then
      raise exception 'Relaciones de notas incompatibles';
    end if;
  end $$`,
  ...statements.map(statement => sql.query(statement, [])),
  sql`do $$ begin
    if exists(select 1 from pg_roles where rolname='cord_app') then
      grant select,insert,update,delete on documento_reembolsos to cord_app;
    end if;
  end $$`,
]);
const [[columns], [rls]] = await sql.transaction([
  sql`select count(*)::int as n from information_schema.columns where table_schema='public'
    and table_name='documentos_fiscales' and column_name in ('amount_credited','amount_refunded','refund_due')
    and data_type='numeric' and is_nullable='NO'`,
  sql`select relrowsecurity,relforcerowsecurity from pg_class where oid='public.documento_reembolsos'::regclass`,
]);
assert.equal(columns.n, 3);
assert.equal(rls.relrowsecurity, true);
assert.equal(rls.relforcerowsecurity, true);
console.log('Conciliación instalada: 3 columnas y ledger con ENABLE/FORCE RLS. Sin modificar pagos ni saldos históricos.');

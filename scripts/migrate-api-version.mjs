// Aditiva. Dry-run por default. Nunca imprime la cadena de conexión ni datos de orgs.
//   node --env-file=.env.local scripts/migrate-sandbox-simulaciones.mjs [--apply]
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { neon } from '@neondatabase/serverless';

const connection = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
assert.ok(connection, 'DATABASE_URL no configurada');
const sql = neon(connection);
const source = readFileSync(new URL('../db/migrations/2026-10-05-api-version.sql', import.meta.url), 'utf8');
assert.ok(readFileSync(new URL('../db/schema.sql', import.meta.url), 'utf8').includes(source.trim()), 'schema.sql y migración divergen');

// Separa sentencias respetando bloques $$…$$ y comillas.
function split(src) {
    const out = [];
    let cur = '', quote = null, tag = null;
    for (let i = 0; i < src.length; i++) {
        const ch = src[i];
        if (tag) { if (src.startsWith(tag, i)) { cur += tag; i += tag.length - 1; tag = null; } else cur += ch; continue; }
        if (quote) { cur += ch; if (ch === quote) quote = null; continue; }
        if (ch === '-' && src[i + 1] === '-') { const nl = src.indexOf('\n', i); i = nl < 0 ? src.length : nl; cur += '\n'; continue; }
        if (ch === "'" || ch === '"') { quote = ch; cur += ch; continue; }
        if (ch === '$') { const m = src.slice(i).match(/^\$[A-Za-z_]*\$/); if (m) { tag = m[0]; cur += tag; i += tag.length - 1; continue; } }
        if (ch === ';') { if (cur.trim()) out.push(cur.trim()); cur = ''; continue; }
        cur += ch;
    }
    if (cur.trim()) out.push(cur.trim());
    return out;
}

const statements = split(source);
const [before] = await sql`select
  to_regclass('public.orgs') is not null as orgs_exists,
  exists(select 1 from information_schema.columns where table_name='api_keys' and column_name='api_version') as column_exists,
  exists(select 1 from pg_roles where rolname='cord_app') as app_role_exists`;
console.log(JSON.stringify({ phase: 'preflight', ...before, statements: statements.length }));
assert.equal(before.orgs_exists, true, 'No es una base Cord');
if (!process.argv.includes('--apply')) {
    console.log('Dry-run: ninguna escritura. --apply agrega api_version a api_keys y webhooks.');
    process.exit(0);
}
await sql.transaction([
    sql`select set_config('lock_timeout','5s',true), set_config('statement_timeout','30s',true)`,
    ...statements.map((s) => sql.query(s, [])),
    sql`do $$ begin
      if not exists(select 1 from information_schema.columns where table_name='api_keys' and column_name='api_version')
         or not exists(select 1 from information_schema.columns where table_name='webhooks' and column_name='api_version') then
        raise exception 'faltan las columnas api_version';
      end if;
    end $$`,
]);
const [after] = await sql`select
  exists(select 1 from information_schema.columns where table_name='api_keys' and column_name='api_version') as api_keys_column,
  exists(select 1 from information_schema.columns where table_name='webhooks' and column_name='api_version') as webhooks_column`;
console.log(JSON.stringify({ phase: 'applied', ...after }));

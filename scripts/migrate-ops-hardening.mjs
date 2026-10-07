// Endurecimiento de Cord Ops (2026-10-07): passkeys propias, bloqueo propio,
// bitácora de solo agregar y políticas de Ops por comando.
// Dry-run por default. Nunca imprime la cadena de conexión ni datos de orgs.
//   node --env-file=.env.local scripts/migrate-ops-hardening.mjs [--apply]
//
// Antes de --apply: cada operador debe poder entrar con contraseña + TOTP. Las
// sesiones Ops abiertas con una passkey de la app se cierran, y esas passkeys
// dejan de servir en Ops; la passkey nueva se registra desde /ops/security.
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { neon } from '@neondatabase/serverless';

const connection = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
assert.ok(connection, 'DATABASE_URL no configurada');
const sql = neon(connection);
const source = readFileSync(new URL('../db/migrations/2026-10-07-ops-hardening.sql', import.meta.url), 'utf8');
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
  to_regclass('public.ops_passkeys') is not null as ops_passkeys_exists,
  (select count(*)::int from ops_operators o join users u on u.id = o.user_id
    where o.active and u.totp_enabled and u.totp_confirmed_at is not null) as operators_with_totp,
  (select count(*)::int from ops_operators where active) as operators_active`;
console.log(JSON.stringify({ phase: 'preflight', ...before, statements: statements.length }));
assert.equal(before.orgs_exists, true, 'No es una base Cord');
if (before.operators_with_totp < before.operators_active) {
    console.log('Aviso: hay operadores activos sin TOTP confirmado. Tras aplicar no podrán entrar a Ops hasta activarlo en la app.');
}
if (!process.argv.includes('--apply')) {
    console.log('Dry-run: ninguna escritura. --apply crea ops_passkeys y endurece la bitácora y las políticas.');
    process.exit(0);
}
await sql.transaction([
    sql`select set_config('lock_timeout','5s',true), set_config('statement_timeout','30s',true)`,
    ...statements.map((s) => sql.query(s, [])),
    sql`do $$ begin
      if to_regclass('public.ops_passkeys') is null then raise exception 'falta ops_passkeys'; end if;
      if not exists (select 1 from pg_trigger where tgname = 'trg_ops_audit_log_append_only') then raise exception 'bitácora sin trigger'; end if;
      if exists (select 1 from pg_policies where tablename = 'api_keys' and policyname = 'ops_revoke_api_keys' and cmd <> 'UPDATE') then raise exception 'política de Ops mal formada'; end if;
    end $$`,
]);
const [after] = await sql`select to_regclass('public.ops_passkeys') is not null as ops_passkeys,
  (select count(*)::int from pg_policies where policyname like 'ops\\_%' and cmd = 'ALL') as ops_policies_for_all`;
console.log(JSON.stringify({ phase: 'applied', ...after }));

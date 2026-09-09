// Add only the quote payment attempt registry. Read-only unless --apply is passed.
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import { neon } from '@neondatabase/serverless';

export async function migrateQuotePaymentAttempts(sql, { apply = false } = {}) {
    const [before] = await sql`select count(*)::int as cobros,
        count(stripe_payment_intent_id)::int as linked_intents,
        to_regclass('public.cotizacion_pago_intentos') is not null as installed from cotizacion_cobros`;
    if (!apply) return { applied: false, ...before };
    const source = readFileSync(new URL('../db/migrations/2026-09-07-quote-payment-attempts.sql', import.meta.url), 'utf8');
    const statements = source.replace(/^\s*--.*$/gm, '').split(';').map(s => s.trim()).filter(Boolean);
    await sql.transaction([
        sql`select set_config('lock_timeout','5s',true), set_config('statement_timeout','30s',true)`,
        ...statements.map(statement => sql.query(statement, [])),
        sql`do $$ begin
            if exists(select 1 from pg_roles where rolname='cord_app') then
                grant select,insert,update on cotizacion_pago_intentos to cord_app;
            end if;
        end $$`,
    ]);
    const [[rls], [relation]] = await sql.transaction([
        sql`select relrowsecurity,relforcerowsecurity from pg_class where oid='public.cotizacion_pago_intentos'::regclass`,
        sql`select count(*)::int as n from pg_constraint
            where conrelid='public.cotizacion_pago_intentos'::regclass and contype='f'
              and confrelid='public.cotizacion_cobros'::regclass and array_length(conkey,1)=2`,
    ]);
    assert.equal(rls.relrowsecurity, true); assert.equal(rls.relforcerowsecurity, true);
    assert.equal(relation.n, 1, 'Falta la relación cobro/organización');
    return { applied: true, previous_cobros: before.cobros, previous_linked_intents: before.linked_intents, tenant_rls: true, composite_parent: true };
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
    const connection = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
    assert.ok(connection, 'DATABASE_URL no configurada');
    console.log(JSON.stringify(await migrateQuotePaymentAttempts(neon(connection), { apply: process.argv.includes('--apply') })));
}

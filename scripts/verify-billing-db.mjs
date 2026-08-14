// Auditoría read-only de la migración de Billing en Neon. No imprime ids,
// correos ni información de clientes; solo estructura y conteos agregados.
import assert from 'node:assert/strict';
import { neon } from '@neondatabase/serverless';

const databaseUrl = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
assert.ok(databaseUrl, 'Falta DATABASE_URL_UNPOOLED o DATABASE_URL.');
const sql = neon(databaseUrl);

const [schema] = await sql`
  select
    to_regclass('public.billing_checkout_attempts') is not null as checkout_attempts,
    to_regclass('public.usage_reservations') is not null as usage_reservations,
    to_regprocedure('public.cord_effective_plan(uuid)') is not null as effective_plan_function,
    exists (
      select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'orgs' and column_name = 'billing_paid_plan'
    ) as paid_plan_evidence`;
assert.equal(schema.checkout_attempts, true, 'Falta billing_checkout_attempts.');
assert.equal(schema.usage_reservations, true, 'Falta usage_reservations.');
assert.equal(schema.effective_plan_function, true, 'Falta cord_effective_plan(uuid).');
assert.equal(schema.paid_plan_evidence, true, 'Falta billing_paid_plan.');

const [triggers] = await sql`
  select count(*)::int as n
    from pg_trigger
   where tgname in ('trg_limit_productos','trg_limit_clientes','trg_limit_cotizaciones','trg_limit_org_members')
     and not tgisinternal`;
assert.equal(triggers.n, 4, 'Faltan triggers de límites de recursos.');

const [rls] = await sql`
  select count(*) filter (where relrowsecurity and relforcerowsecurity)::int as forced
    from pg_class
   where oid in ('billing_checkout_attempts'::regclass, 'usage_reservations'::regclass)`;
assert.equal(rls.forced, 2, 'Las tablas de Billing deben tener FORCE RLS.');

const [billing] = await sql`
  select count(*) filter (where stripe_subscription_id is not null)::int as linked,
         count(*) filter (
           where stripe_subscription_id is not null and subscription_status = 'active'
         )::int as active,
         count(*) filter (
           where stripe_subscription_id is not null and cord_effective_plan(id) != 'free'
         )::int as effective_paid
    from orgs
   where sandbox_of is null`;

console.log(`Neon Billing verificado: 2 tablas FORCE RLS, 4 triggers; suscripciones ligadas=${billing.linked}, active=${billing.active}, con evidencia pagada=${billing.effective_paid}.`);

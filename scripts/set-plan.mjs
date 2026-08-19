// scripts/set-plan.mjs — cambia el plan de una org. ESCRIBE en la DB (producción).
//
//   node scripts/set-plan.mjs --list                         (solo muestra las orgs)
//   node scripts/set-plan.mjs --plan=developer --all          (todas las orgs)
//   node scripts/set-plan.mjs --plan=developer --org=<id>     (uuid de orgs.id u orgs.owner_id)
//   node scripts/set-plan.mjs --comp --org=<id> --sub=sub_... (cortesía: liga y desbloquea)
//
// Planes válidos: free | starter | pro | scale | developer
//
// ⚠️ SIN --comp, este script escribe ÚNICAMENTE `orgs.plan`, que por la Regla 17
// es una PROYECCIÓN de lectura y UI: no autoriza nada. Una org con
// plan='developer' y el resto de las columnas de billing en NULL resuelve a
// Gratis en `cord_effective_plan()`, y así debe ser. Si lo que buscabas era
// desbloquear capacidades, usa --comp.
//
// ── --comp (cortesía interna) ────────────────────────────────────────────────
// Una suscripción creada A MANO en el dashboard de Stripe nunca queda ligada a
// una org: no trae `metadata.org_id` y `cord_resolve_org_for_billing` solo
// encuentra la org por un stripe_customer_id/stripe_subscription_id ya
// guardado. El webhook llega y no sabe a quién aplicarla.
//
// --comp cierra ese hueco: lee la suscripción REAL de Stripe, verifica que esté
// activa y que su precio corresponda a un plan del catálogo, y sella en la org
// las seis columnas que `hasPaidBillingEvidence()` exige. A partir de ahí el
// webhook la mantiene sincronizada sola (renovación, cancelación, downgrade).
//
// Lo que NO hace: relajar la regla de "factura pagada". La evidencia se sella
// aquí de forma explícita, deliberada y auditada porque un humano decidió
// regalar el plan — no porque una factura de $0 haya colado por la puerta de
// atrás en el webhook, que sigue exigiendo amount_paid > 0 para todas las orgs.
//
// ⚠️ Reescrito (ago 2026): usaba clerk_user_id/clerk_org_id, columnas que la
// migración a auth propio (scripts/migrate-to-custom-auth.mjs) ya eliminó —
// cada ejecución tronaba con "column does not exist". Ahora usa owner_id
// (users.id, fuente de verdad post-migración).
import { neon } from '@neondatabase/serverless';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
function readVar(name) {
  if (process.env[name]) return process.env[name];
  for (const f of ['.env', '.env.local']) {
    const p = join(root, f);
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, 'utf8').split('\n')) {
      const m = line.match(new RegExp(`^\\s*(?:export\\s+)?${name}\\s*=\\s*(.+)\\s*$`));
      if (m) return m[1].replace(/^["']|["']$/g, '');
    }
  }
  return null;
}
const sql = neon(readVar('DATABASE_URL_UNPOOLED') || readVar('DATABASE_URL'));

const args = process.argv.slice(2);
const arg = (k) => { const a = args.find((x) => x.startsWith(`--${k}=`)); return a ? a.split('=')[1] : null; };
const has = (k) => args.includes(`--${k}`);

const PLANES = ['free', 'starter', 'pro', 'scale', 'developer'];

// ── Catálogo de precios, leído de la fuente única ────────────────────────────
// Mismo criterio que scripts/verify-stripe-billing.mjs: se parsea billing.ts en
// vez de copiar los price ids aquí. Una segunda lista es una lista que se
// desincroniza en el primer cambio de precios.
function priceToPlan(testMode) {
  const source = readFileSync(join(root, 'src/lib/billing.ts'), 'utf8');
  const start = source.indexOf('export const PLAN_PRICES');
  if (start < 0) throw new Error('No se encontró PLAN_PRICES en src/lib/billing.ts');
  const block = source.slice(start, source.indexOf('\n};', start) + 3);
  const marker = block.indexOf('} : {');
  if (marker < 0) throw new Error('PLAN_PRICES no conserva la separación test/live.');
  const variant = testMode ? block.slice(0, marker) : block.slice(marker + 5);
  const map = {};
  for (const m of variant.matchAll(/(\w+):\s*\{\s*mensual:\s*'([^']+)',\s*anual:\s*'([^']+)'/g)) {
    map[m[2]] = m[1];
    map[m[3]] = m[1];
  }
  return map;
}

async function stripeGet(key, path) {
  const res = await fetch('https://api.stripe.com/v1' + path, { headers: { Authorization: `Bearer ${key}` } });
  const data = await res.json();
  if (!res.ok) throw new Error(`${path}: ${data?.error?.message || res.status}`);
  return data;
}

async function comp(orgSelector, subId) {
  const key = readVar('STRIPE_SECRET_KEY');
  if (!key) { console.error('✗ Falta STRIPE_SECRET_KEY.'); process.exit(1); }
  if (!orgSelector) { console.error('✗ Falta --org=<id>.'); process.exit(1); }
  if (!subId) { console.error('✗ Falta --sub=<stripe_subscription_id>.'); process.exit(1); }

  const [org] = await sql`select id, nombre, plan, sandbox_of, stripe_subscription_id
                            from orgs
                           where id::text = ${orgSelector} or owner_id::text = ${orgSelector}
                           limit 1`;
  if (!org) { console.error('✗ No encontré esa org.'); process.exit(1); }
  // Una sandbox hereda el estado efectivo de su padre en cada consulta: sellarle
  // evidencia propia no serviría de nada y dejaría datos contradictorios.
  if (org.sandbox_of) { console.error('✗ Esa org es una sandbox; aplica la cortesía a su organización padre.'); process.exit(1); }

  const sub = await stripeGet(key, `/subscriptions/${subId}`);
  if (sub.status !== 'active') {
    console.error(`✗ La suscripción está en '${sub.status}', no 'active'. No se sella evidencia de algo que Stripe no considera vigente.`);
    process.exit(1);
  }

  const catalogo = priceToPlan(key.startsWith('sk_test_') || key.startsWith('rk_test_'));
  const items = sub.items?.data ?? [];
  const planes = items.map((i) => catalogo[i.price?.id]).filter(Boolean);
  if (!planes.length) {
    console.error('✗ Ningún precio de esa suscripción corresponde a un plan del catálogo (¿modo test/live cruzado?).');
    console.error('  Precios:', items.map((i) => i.price?.id).join(', ') || '(ninguno)');
    process.exit(1);
  }
  const rank = { free: 0, starter: 1, pro: 2, scale: 3, developer: 4 };
  const plan = planes.sort((a, b) => rank[b] - rank[a])[0];

  // `current_period_end` se mudó al ITEM en la API Basil; el campo de la
  // suscripción sigue existiendo en versiones viejas. Se leen los dos.
  const endSeconds = Math.max(
    Number(sub.current_period_end || 0),
    ...items.map((i) => Number(i.current_period_end || 0)),
  );
  if (!endSeconds) { console.error('✗ La suscripción no expone un fin de periodo.'); process.exit(1); }
  const periodEnd = new Date(endSeconds * 1000);
  if (periodEnd.getTime() <= Date.now()) {
    console.error(`✗ El periodo ya venció (${periodEnd.toISOString()}).`);
    process.exit(1);
  }
  const customer = typeof sub.customer === 'string' ? sub.customer : sub.customer?.id;
  if (!customer) { console.error('✗ La suscripción no trae customer.'); process.exit(1); }

  // Las seis columnas que exige hasPaidBillingEvidence(), en una sola escritura.
  // `billing_paid_through` = fin del periodo vigente: la cortesía cubre
  // exactamente lo que Stripe considera vigente, ni un día más.
  const [row] = await sql`
    update orgs set
      plan = ${plan},
      stripe_subscription_id = ${sub.id},
      stripe_customer_id = ${customer},
      subscription_status = 'active',
      current_period_end = ${periodEnd.toISOString()}::timestamptz,
      billing_paid_through = ${periodEnd.toISOString()}::timestamptz,
      billing_paid_plan = ${plan}
    where id = ${org.id}
    returning id, nombre, plan`;

  const [check] = await sql`select cord_effective_plan(${org.id}) as efectivo`;
  console.log(`\n✓ Cortesía aplicada a ${row.nombre}`);
  console.log(`  plan            : ${row.plan}`);
  console.log(`  suscripción     : ${sub.id}`);
  console.log(`  customer        : ${customer}`);
  console.log(`  vigente hasta   : ${periodEnd.toISOString()}`);
  console.log(`  plan EFECTIVO   : ${check.efectivo}${check.efectivo === plan ? '' : '  ← revisar'}`);
  console.log('\n  El webhook de Stripe la mantiene sincronizada desde ahora.');
  console.log('  Al renovar, la factura real vuelve a sellar billing_paid_through sola.\n');
}

async function list() {
  const orgs = await sql`select id, nombre, plan, owner_id from orgs order by created_at`;
  console.log('\nOrgs:');
  for (const o of orgs) console.log(`  • ${o.id} | plan=${o.plan} | ${o.nombre} | owner=${o.owner_id || '—'}`);
  console.log('');
}

(async () => {
  if (has('comp')) { await comp(arg('org'), arg('sub')); return; }
  if (has('list') || (!arg('plan'))) { await list(); if (!arg('plan')) return; }

  const plan = arg('plan');
  if (!PLANES.includes(plan)) { console.error(`✗ Plan inválido: ${plan}. Usa uno de: ${PLANES.join(', ')}`); process.exit(1); }

  let rows;
  if (has('all')) {
    rows = await sql`update orgs set plan = ${plan} returning nombre, plan`;
  } else {
    const org = arg('org');
    if (!org) { console.error('✗ Falta --org=<id> o --all'); process.exit(1); }
    rows = await sql`update orgs set plan = ${plan}
      where id::text = ${org} or owner_id::text = ${org}
      returning nombre, plan`;
  }
  if (!rows.length) { console.error('✗ No se actualizó ninguna org (¿selector correcto?).'); process.exit(1); }
  console.log(`\n✓ Plan = ${plan} aplicado a ${rows.length} org(s):`);
  for (const r of rows) console.log(`  • ${r.nombre} → ${r.plan}`);
  console.log('');
})().catch((e) => { console.error('✗ Error:', e.message); process.exit(1); });

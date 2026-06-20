// scripts/set-plan.mjs — cambia el plan de una org. ESCRIBE en la DB (producción).
//
//   node scripts/set-plan.mjs --list                         (solo muestra las orgs)
//   node scripts/set-plan.mjs --plan=developer --all          (todas las orgs)
//   node scripts/set-plan.mjs --plan=developer --org=<id>     (uuid | clerk_user_id | clerk_org_id)
//
// Planes válidos: free | starter | pro | scale | developer
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

async function list() {
  const orgs = await sql`select id, nombre, plan, clerk_user_id, clerk_org_id from orgs order by created_at`;
  console.log('\nOrgs:');
  for (const o of orgs) console.log(`  • ${o.id} | plan=${o.plan} | ${o.nombre} | clerk_user=${o.clerk_user_id || '—'} | clerk_org=${o.clerk_org_id || '—'}`);
  console.log('');
}

(async () => {
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
      where id::text = ${org} or clerk_user_id = ${org} or clerk_org_id = ${org}
      returning nombre, plan`;
  }
  if (!rows.length) { console.error('✗ No se actualizó ninguna org (¿selector correcto?).'); process.exit(1); }
  console.log(`\n✓ Plan = ${plan} aplicado a ${rows.length} org(s):`);
  for (const r of rows) console.log(`  • ${r.nombre} → ${r.plan}`);
  console.log('');
})().catch((e) => { console.error('✗ Error:', e.message); process.exit(1); });

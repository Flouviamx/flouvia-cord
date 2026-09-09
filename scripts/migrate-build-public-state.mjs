import { neon } from '@neondatabase/serverless';

// Additive repair for the public auction feed. Does not change bids, prices,
// auction dates, payment gates, subscriptions, or entitlement functions.
const connection = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!connection) throw new Error('DATABASE_URL no configurada');
const sql = neon(connection);
await sql.transaction([
  sql`alter table build_positions add column if not exists current_logo_url text`,
  sql`alter table build_positions add column if not exists current_website_url text`,
]);
const [result] = await sql`select count(*)::int as positions from build_positions`;
console.log(`Public auction schema ready: ${result.positions} positions. No payment state changed.`);

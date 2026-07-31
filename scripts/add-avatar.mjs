import 'dotenv/config';
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL);

async function run() {
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url text;`;
  console.log('Done');
}
run();

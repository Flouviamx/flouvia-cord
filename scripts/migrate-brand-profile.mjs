// Additive migration for the brand editor; never runs the full schema.
// node --env-file-if-exists=.env --env-file-if-exists=.env.local scripts/migrate-brand-profile.mjs
import { neon } from '@neondatabase/serverless';
import { readFile } from 'node:fs/promises';
const connection = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!connection) throw new Error('DATABASE_URL is required');
try {
    const sql = neon(connection);
    await sql.query(await readFile(new URL('../db/brand-profile.sql', import.meta.url), 'utf8'));
    console.log('brand_profile migration applied');
} catch { console.error('brand_profile migration failed; database credentials and query details omitted.'); process.exitCode=1; }

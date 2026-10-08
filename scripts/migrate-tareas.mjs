// Additive migration for task ownership and reminders; never runs the full schema.
// node --env-file-if-exists=.env --env-file-if-exists=.env.local scripts/migrate-tareas.mjs
import { neon } from '@neondatabase/serverless';
import { readFile } from 'node:fs/promises';
const connection = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!connection) throw new Error('DATABASE_URL is required');
try {
    const sql = neon(connection);
    const ddl = await readFile(new URL('../db/tareas-seguimiento.sql', import.meta.url), 'utf8');
    // The HTTP driver runs one statement per call.
    for (const stmt of ddl.replace(/^--.*$/gm, '').split(';').map((s) => s.trim()).filter(Boolean)) await sql.query(stmt);
    console.log('tareas migration applied');
} catch { console.error('tareas migration failed; database credentials and query details omitted.'); process.exitCode=1; }

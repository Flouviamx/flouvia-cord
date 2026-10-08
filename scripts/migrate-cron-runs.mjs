// Migración de despliegue: tabla `cron_runs` (reclamo por periodo de los crons).
// Aditiva e idempotente; NUNCA corre el schema completo. Va en el buildCommand
// de vercel.json antes de `npm run build`: si falla, el despliegue se detiene y
// queda vivo el anterior. Aun así, src/lib/cron-runs.ts falla ABIERTO si la
// tabla no existe: un cron nunca deja de correr por la bitácora.
//
//   node --env-file-if-exists=.env --env-file-if-exists=.env.local scripts/migrate-cron-runs.mjs
import { neon } from '@neondatabase/serverless';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Parte el DDL en sentencias: el driver HTTP corre una por llamada. Respeta los
 * bloques `$$ … $$` (los `do` llevan `;` dentro) y quita comentarios de línea.
 */
export function splitStatements(ddl) {
    const text = ddl.replace(/^\s*--.*$/gm, '');
    const out = [];
    let current = '';
    let inDollar = false;
    for (let i = 0; i < text.length; i++) {
        if (text.startsWith('$$', i)) { inDollar = !inDollar; current += '$$'; i++; continue; }
        const c = text[i];
        if (c === ';' && !inDollar) {
            if (current.trim()) out.push(current.trim());
            current = '';
            continue;
        }
        current += c;
    }
    if (current.trim()) out.push(current.trim());
    return out;
}

async function main() {
    const connection = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
    if (!connection) throw new Error('DATABASE_URL is required');
    const sql = neon(connection);
    const ddl = await readFile(new URL('../db/cron-runs.sql', import.meta.url), 'utf8');
    for (const statement of splitStatements(ddl)) await sql.query(statement);
    console.log('cron_runs migration applied');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
    main().catch(() => {
        // Sin credenciales ni SQL en el log del build.
        console.error('cron_runs migration failed; database credentials and query details omitted.');
        process.exitCode = 1;
    });
}

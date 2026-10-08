// Migración de despliegue: impuesto y claves SAT por producto, y los términos
// de pago net<N> en la cartera. Aditiva e idempotente; NUNCA corre el schema
// completo. Va en el buildCommand de vercel.json antes de `npm run build`: si
// falla, el despliegue se detiene y queda vivo el anterior (que no lee nada de
// esto), en vez de publicar código que consulta columnas inexistentes.
//
//   node --env-file-if-exists=.env --env-file-if-exists=.env.local scripts/migrate-catalogo-fiscal.mjs
//
// La función cord_term_days() y la vista cuentas_por_cobrar se extraen de
// db/schema.sql (misma extracción que usan los tests): una sola definición.
import { neon } from '@neondatabase/serverless';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function extractStatements(schema) {
    const fn = /create or replace function cord_term_days[\s\S]*?\$\$;/.exec(schema)?.[0];
    const start = schema.indexOf('create or replace view cuentas_por_cobrar as');
    const tail = schema.indexOf('where d2.cotizacion_id = c.id', start);
    const end = tail < 0 ? -1 : schema.indexOf(';', tail) + 1;
    if (!fn || start < 0 || end <= 0) throw new Error('db/schema.sql ya no contiene cord_term_days() o la vista cuentas_por_cobrar.');
    return { fn, view: schema.slice(start, end) };
}

async function main() {
    const connection = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
    if (!connection) throw new Error('DATABASE_URL is required');
    const sql = neon(connection);
    const [columns, schema] = await Promise.all([
        readFile(new URL('../db/catalogo-fiscal.sql', import.meta.url), 'utf8'),
        readFile(new URL('../db/schema.sql', import.meta.url), 'utf8'),
    ]);
    const { fn, view } = extractStatements(schema);
    // Orden: columnas → función → vista (la vista usa la función).
    // `alter table … add column if not exists` toma ACCESS EXCLUSIVE aunque la
    // columna ya exista: en cada deploy se encolaría detrás de cualquier
    // transacción larga sobre `productos`. Una columna ya presente se salta.
    for (const statement of columns.split(/;\s*\n/).map((s) => s.replace(/^\s*--.*$/gm, '').trim()).filter(Boolean)) {
        const m = /^alter table (\w+) add column if not exists (\w+)/i.exec(statement);
        if (m) {
            const present = await sql.query(
                'select 1 from information_schema.columns where table_schema = current_schema() and table_name = $1 and column_name = $2',
                [m[1], m[2]],
            );
            if (present.length) continue;
        }
        await sql.query(statement);
    }
    await sql.query(fn);
    await sql.query(view);
    console.log('catalogo_fiscal migration applied');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
    main().catch(() => {
        // Sin credenciales ni SQL en el log del build.
        console.error('catalogo_fiscal migration failed; database credentials and query details omitted.');
        process.exitCode = 1;
    });
}

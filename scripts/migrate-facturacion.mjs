// Migración de despliegue de facturación (oct 2026): fecha de prestación,
// retención sobre lo gravado, impuestos compuestos de Canadá, causa de
// exención de España, serie por emisor, la cadena de Verifactu con sus
// correcciones y su estado de envío, y el portal del cliente con el cobro
// agrupado y automático. Aditiva e idempotente; NUNCA corre el
// schema completo. Va en el buildCommand de vercel.json antes de
// `npm run build`: si falla, el despliegue se detiene y queda vivo el anterior,
// en vez de publicar código que consulta columnas o funciones inexistentes
// (`cord_serie_en_uso` se llama al emitir CUALQUIER factura fuera de México).
//
//   node --env-file-if-exists=.env --env-file-if-exists=.env.local scripts/migrate-facturacion.mjs
//
// Dos fuentes, ninguna copiada a mano:
//   - los archivos de db/deploy/ en orden de nombre (`AAAA-MM-DD-tema.sql`),
//     cada uno espejo literal de db/schema.sql (lo verifica
//     test/migrate-facturacion.test.ts). Un cambio de esquema nuevo agrega SU
//     archivo: dos frentes de trabajo no editan el mismo;
//   - la sección de Verifactu, extraída del propio db/schema.sql.
//
// No ejecuta a ciegas. `alter table … add column if not exists` y
// `drop/add constraint` toman ACCESS EXCLUSIVE aunque no haya nada que hacer, y
// en cada despliegue se encolarían detrás de cualquier transacción larga sobre
// tablas calientes (`documentos_fiscales`, `cotizacion_items`). Lo que ya está
// —columna, restricción con la misma definición, índice, política, trigger,
// RLS— se salta.
import { neon } from '@neondatabase/serverless';
import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const VERIFACTU_INICIO = '-- ── Verifactu: cadena de registros de facturación (España)';
const VERIFACTU_FIN = '-- Carril de OPS';

/** La sección de Verifactu de db/schema.sql (sin el encabezado de la siguiente). */
export function extractVerifactu(schema) {
    const inicio = schema.indexOf(VERIFACTU_INICIO);
    const fin = schema.indexOf(VERIFACTU_FIN, inicio);
    if (inicio < 0 || fin < 0) throw new Error('db/schema.sql ya no contiene la sección de Verifactu.');
    return schema.slice(inicio, schema.lastIndexOf('\n-- ═', fin));
}

/**
 * Parte un script SQL en sentencias. Respeta comillas simples, comentarios de
 * línea y cuerpos `$$`/`$tag$` (funciones y bloques `do`): un `;` dentro de
 * ellos no termina la sentencia.
 */
export function splitStatements(text) {
    const out = [];
    let buf = '';
    let i = 0;
    let dollar = null;
    let quote = false;
    while (i < text.length) {
        const ch = text[i];
        if (dollar) {
            if (text.startsWith(dollar, i)) { buf += dollar; i += dollar.length; dollar = null; continue; }
            buf += ch; i++; continue;
        }
        if (quote) {
            buf += ch;
            if (ch === "'") quote = false;
            i++; continue;
        }
        if (ch === '-' && text[i + 1] === '-') {
            const nl = text.indexOf('\n', i);
            i = nl < 0 ? text.length : nl + 1;
            buf += '\n';
            continue;
        }
        if (ch === "'") { quote = true; buf += ch; i++; continue; }
        if (ch === '$') {
            const m = /^\$[A-Za-z_]*\$/.exec(text.slice(i));
            if (m) { dollar = m[0]; buf += dollar; i += dollar.length; continue; }
        }
        if (ch === ';') {
            const s = buf.trim();
            if (s) out.push(s);
            buf = ''; i++; continue;
        }
        buf += ch; i++;
    }
    const s = buf.trim();
    if (s) out.push(s);
    return out;
}

const squash = (s) => s.replace(/\s+/g, ' ').trim();
const literals = (s) => [...s.matchAll(/'([^']*)'/g)].map((m) => m[1]);

const RE = {
    addColumn: /^alter table (\w+) add column if not exists (\w+)/i,
    dropConstraint: /^alter table (\w+) drop constraint if exists (\w+)$/i,
    addConstraint: /^alter table (\w+) add constraint (\w+) /i,
    rls: /^alter table (\w+) (enable|force) row level security$/i,
    dropPolicy: /^drop policy if exists "?(\w+)"? on (\w+)$/i,
    createPolicy: /^create policy "?(\w+)"? on (\w+)/i,
    dropTrigger: /^drop trigger if exists (\w+) on (\w+)$/i,
    createTrigger: /^create trigger (\w+)/i,
    createIndex: /^create (?:unique )?index if not exists (\w+) on (\w+)/i,
};

/**
 * Aplica las sentencias con guardas. `query(text, params)` devuelve filas.
 * Devuelve qué se ejecutó y qué se saltó, para el log del build y las pruebas.
 */
export async function applyStatements(statements, query) {
    const ejecutadas = [];
    const saltadas = [];
    const exists = async (text, params) => (await query(text, params)).length > 0;
    const run = async (s) => { await query(s, []); ejecutadas.push(s); };

    for (let k = 0; k < statements.length; k++) {
        const s = squash(statements[k]);
        const next = k + 1 < statements.length ? squash(statements[k + 1]) : '';
        let m;

        if ((m = RE.addColumn.exec(s))) {
            const present = await exists(
                'select 1 from information_schema.columns where table_schema = current_schema() and table_name = $1 and column_name = $2',
                [m[1], m[2]]);
            if (present) saltadas.push(s); else await run(s);
            continue;
        }

        if ((m = RE.dropConstraint.exec(s))) {
            const [, tabla, nombre] = m;
            const rows = await query(
                `select pg_get_constraintdef(c.oid) as def from pg_constraint c
                   join pg_class t on t.oid = c.conrelid
                  where t.relname = $1 and c.conname = $2 and t.relnamespace = current_schema()::regnamespace`,
                [tabla, nombre]);
            const add = RE.addConstraint.exec(next);
            if (add && add[1] === tabla && add[2] === nombre) {
                // drop + add de la MISMA restricción: si ya existe con la misma
                // definición (sus literales están todos), no hay nada que hacer.
                const actual = rows[0]?.def ?? null;
                if (actual !== null && literals(next).every((l) => actual.includes(`'${l}'`))) {
                    saltadas.push(s, next);
                } else {
                    await run(s);
                    await run(next);
                }
                k++;
                continue;
            }
            // Drop suelto de una restricción heredada: solo si sigue ahí.
            if (rows.length) await run(s); else saltadas.push(s);
            continue;
        }

        if ((m = RE.addConstraint.exec(s))) {
            const present = await exists(
                `select 1 from pg_constraint c join pg_class t on t.oid = c.conrelid
                  where t.relname = $1 and c.conname = $2 and t.relnamespace = current_schema()::regnamespace`,
                [m[1], m[2]]);
            if (present) saltadas.push(s); else await run(s);
            continue;
        }

        if ((m = RE.rls.exec(s))) {
            const col = m[2].toLowerCase() === 'force' ? 'relforcerowsecurity' : 'relrowsecurity';
            const on = await exists(
                `select 1 from pg_class where relname = $1 and relnamespace = current_schema()::regnamespace and ${col}`,
                [m[1]]);
            if (on) saltadas.push(s); else await run(s);
            continue;
        }

        if ((m = RE.dropPolicy.exec(s))) {
            const create = RE.createPolicy.exec(next);
            if (create && create[1] === m[1] && create[2] === m[2]) {
                const present = await exists(
                    'select 1 from pg_policies where schemaname = current_schema() and tablename = $1 and policyname = $2',
                    [m[2], m[1]]);
                if (present) saltadas.push(s, next); else { await run(s); await run(next); }
                k++;
                continue;
            }
            await run(s);
            continue;
        }

        if ((m = RE.dropTrigger.exec(s))) {
            const create = RE.createTrigger.exec(next);
            if (create && create[1] === m[1]) {
                const present = await exists(
                    `select 1 from pg_trigger g join pg_class t on t.oid = g.tgrelid
                      where g.tgname = $1 and t.relname = $2 and not g.tgisinternal`,
                    [m[1], m[2]]);
                if (present) saltadas.push(s, next); else { await run(s); await run(next); }
                k++;
                continue;
            }
            await run(s);
            continue;
        }

        // `create index if not exists` toma su candado sobre la tabla ANTES de
        // ver que el índice ya existe: en una tabla caliente se encolaría en
        // cada despliegue detrás de cualquier transacción larga.
        if ((m = RE.createIndex.exec(s))) {
            const present = await exists(
                `select 1 from pg_class i join pg_index x on x.indexrelid = i.oid join pg_class t on t.oid = x.indrelid
                  where i.relname = $1 and t.relname = $2 and i.relnamespace = current_schema()::regnamespace`,
                [m[1], m[2]]);
            if (present) saltadas.push(s); else await run(statements[k]);
            continue;
        }

        // create table if not exists, create or replace function, revoke,
        // bloques `do` con grants y sentencias de datos idempotentes.
        await run(statements[k]);
    }
    return { ejecutadas, saltadas };
}

/** Los archivos de db/deploy/, en orden de nombre. */
export async function archivosDeploy(base = new URL('..', import.meta.url)) {
    const dir = new URL('db/deploy/', base);
    return (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort().map((f) => new URL(f, dir));
}

/**
 * Las fuentes, en orden: los archivos de db/deploy/ y después Verifactu. La
 * sección de Verifactu va al final porque sus funciones leen columnas que
 * agregan los archivos (p. ej. `cord_serie_en_uso` lee `fiscal_metadata`).
 */
export async function cargarSentencias(base = new URL('..', import.meta.url)) {
    const archivos = await archivosDeploy(base);
    const [propios, schema] = await Promise.all([
        Promise.all(archivos.map((f) => readFile(f, 'utf8'))),
        readFile(new URL('db/schema.sql', base), 'utf8'),
    ]);
    return [...propios.flatMap((t) => splitStatements(t)), ...splitStatements(extractVerifactu(schema))];
}

async function main() {
    const connection = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
    if (!connection) throw new Error('DATABASE_URL is required');
    const sql = neon(connection);
    const statements = await cargarSentencias();
    const { ejecutadas, saltadas } = await applyStatements(statements, (text, params) => sql.query(text, params));
    console.log(`facturacion migration applied (${ejecutadas.length} ejecutadas, ${saltadas.length} ya presentes)`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
    main().catch(() => {
        // Sin credenciales ni SQL en el log del build.
        console.error('facturacion migration failed; database credentials and query details omitted.');
        process.exitCode = 1;
    });
}

// Migraciones aditivas de Cord Ops que corren en cada build (buildCommand de
// vercel.json), en orden, porque el código de Ops las lee en producción:
//   fase 3 — lectura sobre reembolsos, disputas, outbox y facturas de
//            suscripción; notas y etiquetas internas.
//   fase 4 — lectura de cron_runs; reglas y estado de alertas; métricas.
//   fase 5 — cortesías de Ops (ops_plan_grants) y cord_access_grant() en el
//            plan efectivo.
// Cada archivo es idempotente y es espejo literal de su bloque en db/schema.sql.
// Nunca imprime la cadena de conexión ni datos de organizaciones.
//   node --env-file-if-exists=.env --env-file-if-exists=.env.local scripts/migrate-ops.mjs
import { readFileSync } from 'node:fs';
import { neon } from '@neondatabase/serverless';

const connection = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!connection) throw new Error('DATABASE_URL is required');
export const OPS_MIGRATIONS = ['2026-10-08-ops-fase3.sql', '2026-10-08-ops-fase4.sql', '2026-10-08-ops-fase5.sql'];
const schema = readFileSync(new URL('../db/schema.sql', import.meta.url), 'utf8');
const sources = OPS_MIGRATIONS.map((name) => {
    const source = readFileSync(new URL(`../db/migrations/${name}`, import.meta.url), 'utf8');
    if (!schema.includes(source.trim())) throw new Error(`schema.sql y db/migrations/${name} divergen`);
    return { name, source };
});

// Separa sentencias respetando bloques $$…$$, comillas y comentarios: el
// driver HTTP corre una sentencia por llamada.
function split(src) {
    const out = [];
    let cur = '', quote = null, tag = null;
    for (let i = 0; i < src.length; i++) {
        const ch = src[i];
        if (tag) { if (src.startsWith(tag, i)) { cur += tag; i += tag.length - 1; tag = null; } else cur += ch; continue; }
        if (quote) { cur += ch; if (ch === quote) quote = null; continue; }
        if (ch === '-' && src[i + 1] === '-') { const nl = src.indexOf('\n', i); i = nl < 0 ? src.length : nl; cur += '\n'; continue; }
        if (ch === "'" || ch === '"') { quote = ch; cur += ch; continue; }
        if (ch === '$') { const m = src.slice(i).match(/^\$[A-Za-z_]*\$/); if (m) { tag = m[0]; cur += tag; i += tag.length - 1; continue; } }
        if (ch === ';') { if (cur.trim()) out.push(cur.trim()); cur = ''; continue; }
        cur += ch;
    }
    if (cur.trim()) out.push(cur.trim());
    return out;
}

const sql = neon(connection);
const statements = sources.flatMap(({ source }) => split(source));
// Un bloqueo ocupado (55P03) no es un error del cambio: se reintenta antes de
// tumbar el despliegue. Cualquier otro código falla al primer intento.
for (let attempt = 1; ; attempt++) {
    try {
        await sql.transaction([
            sql`select set_config('lock_timeout','5s',true), set_config('statement_timeout','30s',true)`,
            ...statements.map((s) => sql.query(s, [])),
        ]);
        console.log(`ops migrations applied (${OPS_MIGRATIONS.join(', ')})`);
        break;
    } catch (error) {
        if (error?.code === '55P03' && attempt < 4) {
            await new Promise((r) => setTimeout(r, attempt * 3000));
            continue;
        }
        console.error(`ops migrations failed (${/^[0-9A-Z]{5}$/.test(error?.code || '') ? error.code : 'sin código'}); database credentials and query details omitted.`);
        process.exitCode = 1;
        break;
    }
}

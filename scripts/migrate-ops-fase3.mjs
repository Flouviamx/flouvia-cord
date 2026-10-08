// Cord Ops fase 3 (2026-10-08): lectura de Ops sobre reembolsos, disputas,
// outbox de webhooks y facturas de suscripción, más notas y etiquetas internas.
// Aditiva e idempotente: corre en cada build desde el buildCommand de
// vercel.json, porque el código de la fase lee estas tablas en producción.
// Nunca imprime la cadena de conexión ni datos de organizaciones.
//   node --env-file-if-exists=.env --env-file-if-exists=.env.local scripts/migrate-ops-fase3.mjs
import { readFileSync } from 'node:fs';
import { neon } from '@neondatabase/serverless';

const connection = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!connection) throw new Error('DATABASE_URL is required');
const source = readFileSync(new URL('../db/migrations/2026-10-08-ops-fase3.sql', import.meta.url), 'utf8');
if (!readFileSync(new URL('../db/schema.sql', import.meta.url), 'utf8').includes(source.trim())) {
    throw new Error('schema.sql y db/migrations/2026-10-08-ops-fase3.sql divergen');
}

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
const statements = split(source);
// Un bloqueo ocupado (55P03) no es un error del cambio: se reintenta antes de
// tumbar el despliegue. Cualquier otro código falla al primer intento.
for (let attempt = 1; ; attempt++) {
    try {
        await sql.transaction([
            sql`select set_config('lock_timeout','5s',true), set_config('statement_timeout','30s',true)`,
            ...statements.map((s) => sql.query(s, [])),
        ]);
        console.log('ops-fase3 migration applied');
        break;
    } catch (error) {
        if (error?.code === '55P03' && attempt < 4) {
            await new Promise((r) => setTimeout(r, attempt * 3000));
            continue;
        }
        console.error(`ops-fase3 migration failed (${/^[0-9A-Z]{5}$/.test(error?.code || '') ? error.code : 'sin código'}); database credentials and query details omitted.`);
        process.exitCode = 1;
        break;
    }
}

// Contrato de tenancy: toda query a una tabla multi-tenant viaja en un carril
// de contexto declarado. Corre en `npm run security:tenancy`.
//
// Por qué existe este script
// ─────────────────────────
// `db/schema.sql` habilita y fuerza RLS en ~50 tablas, con políticas correctas
// del tipo `org_id = current_setting('app.org_id')`. Esas políticas SOLO se
// aplican si el rol de conexión no bypasea RLS. Mientras `DATABASE_URL` apunte a
// un rol con `rolbypassrls`, Postgres las ignora por completo y el único muro
// real es que el código nunca olvide un `where org_id = ...`.
//
// Este linter es el candado que sostiene ese muro mientras se completa la
// migración al rol `cord_app` (ver db/cord-app-role.sql): prohíbe ejecutar una
// query contra una tabla multi-tenant FUERA de un carril de contexto, porque una
// query así es exactamente la que no tendría segunda línea de defensa.
//
// Los carriles viven en src/lib/db.ts y son cuatro, cada uno con su alcance:
//   withOrgTx(orgId, ...)      organización activa de la sesión
//   withUserTx(userId, ...)    bootstrap: antes de conocer la organización
//   withSystemTx(...)          crons cross-org (exige cronScope)
//   withCaptureToken(token,..) captura móvil de identidad
//
// Cómo detecta una violación
// ──────────────────────────
// Se ubica el carril que ENCIERRA cada plantilla sql`...`; si no hay uno, la
// query se ejecuta sin contexto. Cubre `await sql`, `safe(sql`, `Promise.all`
// y cualquier otro envoltorio — no solo el await directo.
//
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;

// ── Archivos exentos, con razón ─────────────────────────────────────────────
// PERMANENTES: son los que definen o preceden al carril; no pueden usar uno.
const PERMANENT = new Map([
    ['src/lib/db.ts', 'define los carriles; sus propias queries son la implementación'],
    ['src/lib/apikey.ts', 'resuelve la llave ANTES de que exista contexto de organización'],
]);

// PENDIENTES: vacío. La deuda de la auditoría de agosto 2026 quedó cerrada —
// los 69 archivos ejecutan sus queries dentro de un carril declarado.
//
// Si algo tiene que entrar aquí, va con el motivo escrito y la lista solo puede
// ENCOGER: el script falla si un archivo listado ya no tiene violaciones, para
// que nadie la deje crecer con entradas muertas.
const PENDING = new Map([]);

// ── Tablas multi-tenant ─────────────────────────────────────────────────────
// Se descubren por DOS caminos, porque la columna sola no basta:
//
//   a) tienen columna org_id;
//   b) su política RLS lee app.org_id, aunque la tabla no tenga esa columna.
//
// (b) existe por tablas como `cotizacion_items`, cuya política filtra por el
// org_id de la cotización PADRE (`cotizacion_id in (select id from cotizaciones
// where org_id = ...)`). Una query a esa tabla no lleva filtro de organización
// visible y aun así exige app.org_id seteado — es justo la que se ve inocente y
// devolvería 0 filas al activar cord_app.
function tenantTables() {
    const schema = readFileSync(join(ROOT, 'db/schema.sql'), 'utf8');
    const tables = new Set();

    // (a) create table X ( ... org_id ... );
    const createRe = /create\s+table\s+(?:if\s+not\s+exists\s+)?([a-z_]+)\s*\(/gi;
    let m;
    while ((m = createRe.exec(schema))) {
        const name = m[1];
        let depth = 1;
        let i = createRe.lastIndex;
        while (i < schema.length && depth > 0) {
            if (schema[i] === '(') depth++;
            else if (schema[i] === ')') depth--;
            i++;
        }
        if (/\borg_id\b/.test(schema.slice(createRe.lastIndex, i))) tables.add(name);
    }

    // (a) alter table X add column [if not exists] org_id ...
    const alterRe = /alter\s+table\s+([a-z_]+)\s+add\s+column\s+(?:if\s+not\s+exists\s+)?org_id\b/gi;
    while ((m = alterRe.exec(schema))) tables.add(m[1]);

    // (b) create policy "..." on X ... current_setting('app.org_id' ...)
    const polRe = /create\s+policy\s+"[^"]+"\s+on\s+([a-z_]+)\b/gi;
    while ((m = polRe.exec(schema))) {
        const name = m[1];
        const body = schema.slice(polRe.lastIndex, polRe.lastIndex + 800);
        const end = body.indexOf(';');
        if (/app\.org_id/.test(end === -1 ? body : body.slice(0, end))) tables.add(name);
    }

    // Una tabla con columna org_id pero SIN RLS habilitada no puede romperse al
    // activar cord_app: Postgres no le aplica ninguna política. Marcarla sería
    // ruido, y un linter con ruido termina desactivado. `billing_handoff_tokens`
    // es el caso real: lleva org_id y se llavea por sha256 del token, sin RLS.
    for (const name of [...tables]) {
        const re = new RegExp(`alter\\s+table\\s+${name}\\s+enable\\s+row\\s+level\\s+security`, 'i');
        if (!re.test(schema)) tables.delete(name);
    }

    return tables;
}

// ── Localiza cada plantilla sql`...` y el carril que la ENCIERRA ────────────
// No basta con buscar `await sql`: la query también se ejecuta cuando se pasa a
// un helper que la espera por dentro. El caso real que obligó a esto:
//
//     const safe = async (q) => { try { return await q; } catch { return []; } };
//     const clientes = await safe(sql`select * from clientes where ...`);
//
// Eso ejecuta la query igual, y además SE TRAGA el error — al activar cord_app
// el export de la organización devolvería arrays vacíos sin una sola traza.
//
// Por eso se resuelve al revés: se ubica la llamada que envuelve la plantilla y
// se exige que sea uno de los carriles. Todo lo demás (await directo, safe(),
// Promise.all([...])) es ejecución sin contexto.
const LANES = new Set(['withOrgTx', 'withSystemTx', 'withUserTx', 'withCaptureToken', 'withOpsTx']);

// Enmascara cuerpos de plantillas, cadenas y comentarios con espacios, para que
// un paréntesis dentro de un SQL no descuadre el conteo del recorrido inverso.
function maskAndFindTemplates(src) {
    const masked = src.split('');
    const templates = [];
    let i = 0;
    while (i < src.length) {
        const c = src[i];
        // comentarios
        if (c === '/' && src[i + 1] === '/') {
            while (i < src.length && src[i] !== '\n') { masked[i] = ' '; i++; }
            continue;
        }
        if (c === '/' && src[i + 1] === '*') {
            while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) { masked[i] = ' '; i++; }
            i += 2; continue;
        }
        // cadenas simples
        if (c === '"' || c === "'") {
            const quote = c; i++;
            while (i < src.length && src[i] !== quote) {
                if (src[i] === '\\') { masked[i] = ' '; i++; }
                masked[i] = ' '; i++;
            }
            i++; continue;
        }
        // plantillas
        if (c === '`') {
            const isSql = /\bsql\s*$/.test(src.slice(Math.max(0, i - 12), i));
            const bodyStart = i + 1;
            i++;
            let depth = 0;
            while (i < src.length) {
                if (src[i] === '\\') { masked[i] = ' '; masked[i + 1] = ' '; i += 2; continue; }
                if (src[i] === '$' && src[i + 1] === '{') { depth++; masked[i] = ' '; masked[i + 1] = ' '; i += 2; continue; }
                if (src[i] === '}' && depth > 0) { depth--; masked[i] = ' '; i++; continue; }
                if (src[i] === '`' && depth === 0) break;
                masked[i] = ' '; i++;
            }
            if (isSql) templates.push({ body: src.slice(bodyStart, i), index: bodyStart });
            i++; continue;
        }
        i++;
    }
    return { masked: masked.join(''), templates };
}

// Desde la plantilla, camina hacia AFUERA por todos los niveles de paréntesis y
// corchetes, juntando los identificadores de las llamadas que la envuelven, y
// marca dónde empieza la sentencia. Se recorren todos los niveles porque un
// carril puede estar varios adentro:
//     withOrgTx(orgId, ...(cond ? [sql`...`] : []))
function enclosingContext(masked, index) {
    const calls = [];
    let depth = 0;
    let i = index - 1;
    let stmtStart = 0;
    while (i >= 0) {
        const c = masked[i];
        if (c === ')' || c === ']') depth++;
        else if (c === '(' || c === '[') {
            if (depth === 0) {
                if (c === '(') {
                    let j = i - 1;
                    while (j >= 0 && /\s/.test(masked[j])) j--;
                    const end = j + 1;
                    while (j >= 0 && /[A-Za-z0-9_$.]/.test(masked[j])) j--;
                    const name = masked.slice(j + 1, end);
                    if (name) calls.push(name);
                }
            } else depth--;
        } else if (depth === 0 && (c === ';' || c === '{' || c === '}')) {
            stmtStart = i + 1;
            break;
        }
        i--;
    }
    return { calls, stmtStart };
}

// Una plantilla también está en carril cuando se GUARDA y se ejecuta después:
//     const queries = [sql`...`];  queries.push(sql`...`);
//     await withOrgTx(orgId, ...queries);
// Se resuelve el nombre de esa variable y se confirma que un carril la recibe.
function deferredTarget(masked, calls, stmtStart, index) {
    const push = calls.find((c) => c.endsWith('.push'));
    if (push) return push.slice(0, -'.push'.length);
    // El fragmento termina en el propio `sql\`` — se recorta antes de anclar.
    const stmt = masked.slice(stmtStart, index).replace(/sql\s*`?\s*$/, '');
    const decl = stmt.match(/(?:const|let|var)\s+([A-Za-z0-9_$]+)\s*(?::[^=]*)?=\s*\[?\s*$/)
        || stmt.match(/([A-Za-z0-9_$]+)\s*=\s*\[?\s*$/);
    return decl ? decl[1] : null;
}

// Un CONSTRUCTOR de query no ejecuta nada: devuelve la plantilla para que el
// llamador la meta en su carril. `presenciaQuery()` en src/lib/atencion.ts es el
// ejemplo — la usan el stream público y el del vendedor, cada uno con su
// withOrgTx. Exentarlos no abre un hueco: quien EJECUTA es el llamador, y a ese
// el linter sí lo revisa.
function isBuilder(masked, stmtStart, index) {
    const before = masked.slice(stmtStart, index).replace(/sql\s*`?\s*$/, '');
    return /=>\s*$/.test(before) || /\breturn\s*$/.test(before);
}

const LANE_ALT = [...LANES].join('|');

function unlanedSqlBodies(src) {
    const { masked, templates } = maskAndFindTemplates(src);
    return templates.filter((t) => {
        const { calls, stmtStart } = enclosingContext(masked, t.index);
        if (calls.some((c) => LANES.has(c.split('.').pop()))) return false;
        if (isBuilder(masked, stmtStart, t.index)) return false;

        const target = deferredTarget(masked, calls, stmtStart, t.index);
        if (target) {
            const consumed = new RegExp(`(?:${LANE_ALT})\\s*\\([^;]*\\b${target}\\b`);
            if (consumed.test(masked)) return false;
        }
        return true;
    });
}

const line = (src, index) => src.slice(0, index).split('\n').length;

function walk(dir, out = []) {
    for (const entry of readdirSync(dir)) {
        if (entry === 'node_modules' || entry === '.git' || entry === 'dist') continue;
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) walk(full, out);
        else if (/\.(ts|astro|tsx)$/.test(entry)) out.push(full);
    }
    return out;
}

// ── Ejecución ───────────────────────────────────────────────────────────────
const TENANT = tenantTables();
if (TENANT.size < 20) {
    console.error(`tenancy-lint: solo se detectaron ${TENANT.size} tablas multi-tenant en db/schema.sql — el parser está roto, no el código.`);
    process.exit(1);
}

const tableRe = new RegExp(
    String.raw`\b(?:from|into|update|join|delete\s+from)\s+([a-z_]+)\b`,
    'gi',
);

const violations = [];
const staleExemptions = new Set(PENDING.keys());

for (const file of walk(join(ROOT, 'src'))) {
    const rel = relative(ROOT, file);
    if (PERMANENT.has(rel)) continue;

    const src = readFileSync(file, 'utf8');
    if (!src.includes('sql`')) continue;

    const hits = [];
    for (const { body, index } of unlanedSqlBodies(src)) {
        const touched = new Set();
        let t;
        tableRe.lastIndex = 0;
        while ((t = tableRe.exec(body))) {
            if (TENANT.has(t[1])) touched.add(t[1]);
        }
        if (touched.size) hits.push({ line: line(src, index), tables: [...touched].sort() });
    }

    if (!hits.length) continue;
    if (PENDING.has(rel)) { staleExemptions.delete(rel); continue; }

    for (const hit of hits) violations.push({ rel, ...hit });
}

if (staleExemptions.size) {
    console.error(
        'tenancy-lint: estos archivos ya no tienen queries sin carril — sácalos de PENDING:\n' +
        [...staleExemptions].map((f) => `  - ${f}`).join('\n'),
    );
    process.exitCode = 1;
}

if (violations.length) {
    console.error(
        `tenancy-lint: ${violations.length} query(s) a tablas multi-tenant fuera de un carril de contexto.\n` +
        'Envuélvelas en withOrgTx / withSystemTx / withUserTx / withCaptureToken (src/lib/db.ts).\n',
    );
    for (const v of violations) {
        console.error(`  ${v.rel}:${v.line}  → ${v.tables.join(', ')}`);
    }
    process.exitCode = 1;
}

if (!violations.length && !staleExemptions.size) {
    const pend = PENDING.size ? `, ${PENDING.size} archivo(s) en deuda declarada` : ', sin deuda pendiente';
    console.log(`Contrato de tenancy correcto (${TENANT.size} tablas multi-tenant${pend}).`);
}

// Contrato de seguridad de Cord Ops. Corre en `npm run security:ops`.
//
// Cord Ops es la superficie de mayor privilegio de Cord: lee todas las
// organizaciones y puede borrarlas. Cada regla de abajo nació de un hallazgo
// real de la auditoría de oct 2026, y todas fallan en silencio si alguien las
// revierte: el build pasa, los tests pasan y Ops sigue funcionando. Este script
// es lo único que nota la regresión.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const failures = [];
const fail = (rule, detail) => failures.push(`${rule}: ${detail}`);

function walk(dir) {
    return readdirSync(join(ROOT, dir)).flatMap((name) => {
        const rel = join(dir, name);
        return statSync(join(ROOT, rel)).isDirectory() ? walk(rel) : [rel];
    });
}

const opsApi = walk('src/pages/api/ops').filter((f) => f.endsWith('.ts'));
const opsPages = walk('src/pages/ops').filter((f) => f.endsWith('.astro'));
const opsCode = [...opsApi, ...opsPages, 'src/lib/ops-auth.ts'];

// 1. Ops nunca verifica contra las passkeys de la app. Esas se registran con
//    rpID `cordhq.app` y una sesión normal como única prueba: aceptarlas
//    convertía una cookie robada de la app en acceso a Ops. Aplica al código de
//    AUTENTICACIÓN; las fichas de Ops sí pueden mostrar las passkeys de un cliente.
for (const file of [...opsApi, 'src/lib/ops-auth.ts']) {
    const src = read(file);
    if (/\b(from|join|update|into)\s+passkeys\b/.test(src)) {
        fail('passkeys-propias', `${file} consulta la tabla \`passkeys\` de la app; Ops usa \`ops_passkeys\``);
    }
    if (/rpID\s*[:=]\s*['"]cordhq\.app['"]/.test(src) || /expectedRPID:\s*['"]cordhq\.app['"]/.test(src)) {
        fail('passkeys-propias', `${file} usa el rpID de la app`);
    }
}
const auth = read('src/lib/ops-auth.ts');
if (!/OPS_RP_ID\s*=\s*import\.meta\.env\.PROD\s*\?\s*'ops\.cordhq\.app'/.test(auth)) {
    fail('passkeys-propias', 'OPS_RP_ID debe ser `ops.cordhq.app` en producción');
}

// 2. El login de Ops no comparte el bloqueo de la app ni lo reinicia al
//    acertar la contraseña (eso permitía adivinar el TOTP sin bloquearse).
const login = read('src/pages/api/ops/auth.ts');
for (const legacy of ['checkAndConsumeLockout', 'recordFailedLogin', 'resetFailedLogins']) {
    if (login.includes(legacy)) fail('bloqueo-propio', `api/ops/auth.ts usa ${legacy}() del login de la app`);
}
const postHandler = login.slice(login.indexOf('export const POST'), login.indexOf('export const PUT'));
if (/resetOpsLockout/.test(postHandler.slice(postHandler.indexOf('createOpsChallenge') - 400, postHandler.indexOf('createOpsChallenge')))) {
    fail('bloqueo-propio', 'el paso de contraseña reinicia el contador antes del TOTP');
}
if (!/claimOpsTotpStep/.test(login)) fail('totp-un-uso', 'el TOTP de Ops debe reclamar su paso (anti-replay)');

// 3. Toda ruta de API de Ops que muta exige operador, y las de administración
//    exigen rol admin. Las de login son la excepción por definición.
const LOGIN_ROUTES = new Set(['src/pages/api/ops/auth.ts', 'src/pages/api/ops/passkey-options.ts', 'src/pages/api/ops/passkey-verify.ts']);
const ADMIN_ROUTES = ['src/pages/api/ops/users/[id].ts', 'src/pages/api/ops/organizations/[id].ts', 'src/pages/api/ops/security.ts', 'src/pages/api/ops/status-incidents.ts', 'src/pages/api/ops/recovery.ts'];
for (const file of opsApi) {
    if (LOGIN_ROUTES.has(file)) continue;
    const src = read(file);
    if (!/export const (POST|PATCH|PUT|DELETE)/.test(src)) continue;
    if (!/locals\.opsOperator/.test(src)) fail('operador', `${file} muta sin leer locals.opsOperator`);
}
for (const file of ADMIN_ROUTES) {
    if (!/role\s*!==\s*'admin'/.test(read(file))) fail('rol-admin', `${file} no exige rol admin`);
}

// 4. Lo irreversible exige autenticación fuerte reciente.
const fresh = [
    'src/pages/api/ops/users/[id].ts',
    'src/pages/api/ops/organizations/[id].ts',
    'src/pages/api/ops/passkeys/register-options.ts',
    'src/pages/api/ops/passkeys/register.ts',
    'src/pages/api/ops/passkeys/[id].ts',
];
for (const file of fresh) {
    if (!/requireFreshOpsAuth\(/.test(read(file))) fail('auth-reciente', `${file} no exige requireFreshOpsAuth()`);
}

// 5. Borrar una organización suelta primero su suscripción.
if (!/releaseOrgBilling\(/.test(read('src/pages/api/ops/organizations/[id].ts'))) {
    fail('borrado-org', 'Ops borra organizaciones sin cancelar su suscripción (releaseOrgBilling)');
}

// 6. Suspender revoca también el acceso delegado (OAuth y CLI).
const users = read('src/pages/api/ops/users/[id].ts');
if (!/oauth_grants/.test(users) || !/cli_logins/.test(users)) {
    fail('suspension', 'suspender no revoca permisos OAuth ni llaves del CLI');
}

// 7. Un `__Host-` no se borra sin `secure`: el logout dejaba la cookie viva.
for (const file of opsCode) {
    const src = read(file);
    for (const m of src.matchAll(/cookies\.delete\((OPS_[A-Z_]+),\s*([^)]*)\)/g)) {
        if (!m[2].includes('opsCookieDeleteOptions')) fail('cookies', `${file} borra ${m[1]} sin opsCookieDeleteOptions()`);
    }
}

// 8. El explorador lee en el carril de Ops, es solo para admin y audita la
//    vista en la misma transacción (antes era fire-and-forget).
const explorer = read('src/pages/ops/database/[table].astro');
if (!/withOpsTx\(/.test(explorer)) fail('explorador', 'la tabla se lee fuera de withOpsTx');
if (!/opsAuditQuery\(/.test(explorer) || /logOpsAudit\(/.test(explorer)) fail('explorador', 'la vista debe auditarse dentro de la misma transacción');
if (!/role\s*!==\s*'admin'/.test(explorer)) fail('explorador', 'el explorador de filas debe ser solo para admin');

// 9. Exportación y búsqueda (fase 2). Exportar es sacar datos de Ops a un
//    archivo: solo admin, auditado en la misma transacción que la lectura y con
//    celdas neutralizadas contra fórmulas. La búsqueda exige operador y viaja
//    en el carril de Ops.
const exporter = read('src/pages/api/ops/export.ts');
if (!/role\s*!==\s*'admin'/.test(exporter)) fail('exportacion', 'la exportación CSV debe ser solo para admin');
if (!/withOpsTx\(/.test(exporter) || !/opsAuditQuery\(/.test(exporter)) fail('exportacion', 'la exportación debe auditarse en la misma transacción que la lectura');
if (!/toCsv\(/.test(exporter)) fail('exportacion', 'la exportación debe pasar por toCsv() (neutraliza fórmulas)');
if (!/\^\[=\+\\-@\\t\\r\]/.test(read('src/lib/ops-csv.ts'))) fail('exportacion', 'ops-csv.ts perdió la neutralización de fórmulas (= + - @ tab CR)');
const search = read('src/pages/api/ops/search.ts');
if (!/locals\.opsOperator/.test(search) || !/withOpsTx\(/.test(search)) fail('busqueda', 'la búsqueda global exige operador y el carril withOpsTx');
if (/innerHTML/.test(read('src/components/ops/OpsCommand.astro'))) fail('busqueda', 'la paleta pinta resultados con innerHTML: un nombre de organización lo escribe su dueño');

// 10. Schema: bitácora de solo agregar y políticas de Ops por comando. Ninguna
//    redefinición posterior al bloque de endurecimiento puede deshacerlo.
const schema = read('db/schema.sql');
const block = schema.indexOf('-- BEGIN ops-hardening');
const blockEnd = schema.indexOf('-- END ops-hardening');
if (block < 0 || blockEnd < 0) {
    fail('schema', 'falta el bloque ops-hardening en db/schema.sql');
} else {
    const migration = read('db/migrations/2026-10-07-ops-hardening.sql').trim();
    if (!schema.includes(migration)) fail('schema', 'schema.sql y db/migrations/2026-10-07-ops-hardening.sql divergen');
    if (!/trg_ops_audit_log_append_only/.test(schema.slice(block, blockEnd))) fail('schema', 'ops_audit_log sin trigger de solo agregar');
    // El login lee ops_passkeys antes de que exista contexto: con RLS forzada y
    // sin políticas, el rol cord_app vería cero filas y nadie entraría con passkey.
    if (/alter table ops_passkeys (enable|force) row level security/.test(schema.slice(blockEnd))
        || /alter table ops_passkeys force row level security/.test(schema.slice(block, blockEnd))) {
        fail('schema', 'ops_passkeys no puede tener RLS forzada: el login de Ops la lee sin contexto');
    }
    for (const name of ['rls_clientes', 'rls_productos', 'rls_api_keys', 'rls_webhooks', 'rls_sso_connections', 'ops_payouts', 'ops_connect_personas', 'ops_connect_kyc_evidencia']) {
        const last = schema.lastIndexOf(`create policy "${name}"`);
        if (last > blockEnd) fail('schema', `${name} se redefine después del bloque ops-hardening`);
    }
    // Una política nueva que mencione el carril de Ops se limita a un comando.
    // Sobre las tablas de un negocio Ops solo lee (SELECT) o revoca (UPDATE).
    // La única excepción son las tablas PROPIAS de Ops (`ops_*`, fase 3), donde
    // Ops escribe sus notas: ahí se permiten INSERT y DELETE, y nada más.
    const f3 = schema.indexOf('-- BEGIN ops-fase3');
    const f3End = schema.indexOf('-- END ops-fase3');
    const ownWrite = f3 >= 0 && f3End > f3 ? schema.slice(f3, f3End) : '';
    const ownTables = /foreach t in array array\[('ops_[a-z_]+'(?:,\s*'ops_[a-z_]+')*)\] loop\s+execute format\('drop policy if exists %I on %I', t \|\| '_select'/.exec(ownWrite);
    for (const stmt of schema.slice(blockEnd).match(/create policy[^;]*;/gi) || []) {
        if (!/'ops'/.test(stmt) || /\bfor (select|update)\b/i.test(stmt)) continue;
        const inOwnBlock = ownTables && /\bfor (insert|delete)\b/i.test(stmt) && ownWrite.includes(stmt);
        if (!inOwnBlock) fail('schema', `política posterior al endurecimiento otorga \`ops\` sin limitarla a SELECT o UPDATE: ${stmt.slice(0, 80)}`);
    }
    if (f3 < 0 || f3End < 0) {
        fail('schema', 'falta el bloque ops-fase3 en db/schema.sql');
    } else {
        const migration3 = read('db/migrations/2026-10-08-ops-fase3.sql').trim();
        if (!schema.includes(migration3)) fail('schema', 'schema.sql y db/migrations/2026-10-08-ops-fase3.sql divergen');
        if (!ownTables) fail('schema', 'las políticas de escritura de Ops deben iterar SOLO tablas ops_* en el bloque ops-fase3');
        // Las notas de Cord sobre un negocio no las lee ningún carril del negocio.
        for (const t of ['ops_org_notes', 'ops_org_tags']) {
            if (!new RegExp(`alter table ${t} force row level security`).test(ownWrite)) fail('schema', `${t} sin RLS forzada`);
            if (new RegExp(`create policy[^;]*on ${t}[^;]*app\\.org_id`, 'i').test(schema)) fail('schema', `${t} tiene una política del carril de la organización`);
        }
    }
    if (!/migrate-ops-fase3\.mjs/.test(read('vercel.json'))) fail('schema', 'la migración ops-fase3 debe correr en el buildCommand de vercel.json');
}
const role = read('db/cord-app-role.sql');
if (!/revoke update, delete, truncate on ops_audit_log from cord_app/.test(role)) {
    fail('schema', 'db/cord-app-role.sql debe revocar update/delete/truncate de ops_audit_log');
}

// 11. Recuperación (fase 3): Ops no reescribe filas de un negocio por su
//     cuenta. Re-entregar, reintentar y reenviar llaman a la MISMA función que
//     la app, que corre en el carril de la organización; cada intento se
//     audita con su resultado, y reenviar un correo a un tercero se confirma.
const recovery = read('src/pages/api/ops/recovery.ts');
for (const fn of ['redeliver(', 'retryWorkflowRun(', 'notifyInvoiceIssued(']) {
    if (!recovery.includes(fn)) fail('recuperacion', `recovery.ts debe usar ${fn.slice(0, -1)}() de la app`);
}
if (/update\s+(webhook_events|webhook_deliveries|workflow_runs)\b/i.test(recovery)) fail('recuperacion', 'recovery.ts reescribe webhooks o workflows a mano en vez de usar la función de la app');
if (!/opsAuditQuery\(/.test(recovery)) fail('recuperacion', 'cada acción de recuperación se audita en ops_audit_log');
if (!/confirmation\s*!==\s*target\.invoice_number/.test(recovery)) fail('recuperacion', 'reenviar una factura exige confirmar su número');
if (!/setRequestLocale\(/.test(recovery)) fail('recuperacion', 'el correo reenviado sale en el idioma del negocio, no en el de Ops');

// 12. Notas internas: cualquier operador, pero auditadas en la misma
//     transacción, y una nota ajena solo la borra un admin.
const notesApi = read('src/pages/api/ops/organizations/[id]/notes.ts');
if (!/withOpsTx\(/.test(notesApi) || !/opsAuditQuery\(|insert into ops_audit_log/.test(notesApi)) fail('notas', 'las notas se escriben en withOpsTx y se auditan en la misma transacción');
if (!/author_operator_id\s*=\s*\$\{operator\.userId\}/.test(notesApi)) fail('notas', 'borrar una nota ajena exige ser admin (condición en el DELETE)');

if (failures.length) {
    console.error(`security:ops — ${failures.length} violaciones del contrato de Cord Ops\n`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
}
console.log(`security:ops — ${opsApi.length} rutas de API y ${opsPages.length} páginas de Ops cumplen el contrato.`);

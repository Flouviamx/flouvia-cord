// Auditoría de RLS contra la base REAL. Corre en `npm run security:rls`.
//
// Qué verifica y por qué
// ──────────────────────
// 1. Que el rol de conexión NO bypasee RLS. Este es el chequeo que manda: con
//    `rolbypassrls` (o SUPERUSER), Postgres ignora TODA política y las ~50
//    tablas con RLS del schema quedan de adorno. El aislamiento entre
//    organizaciones pasa a depender por completo de que el código de aplicación
//    nunca olvide un `where org_id = ...`. Ver db/cord-app-role.sql.
// 2. Que cada tabla multi-tenant (columna org_id) tenga ENABLE + FORCE + al
//    menos una política. Antes esta lista eran 11 nombres escritos a mano: una
//    tabla nueva con org_id entraba sin RLS y nadie se enteraba. Ahora se
//    DESCUBREN desde information_schema, así que agregar una tabla sin su
//    política rompe el check, no la cuenta de un cliente.
//
// Nota sobre orgs/org_members: se emiten con ENABLE pero sin FORCE a propósito
// hasta la segunda ventana de la migración (db/cord-force-bootstrap-rls.sql).
// Se reportan aparte para que el criterio de salida de la primera ventana
// —"solo orgs/org_members sin FORCE"— se pueda leer de un vistazo.
import { neon } from '@neondatabase/serverless';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL no está configurada');
const sql = neon(databaseUrl);

// Diferidas a la ventana 2 de la migración; no son un descuido.
const DEFERRED_FORCE = new Set(['orgs', 'org_members']);

const [role] = await sql`select current_user as name, rolbypassrls, rolsuper
                           from pg_roles where rolname = current_user`;

// Tablas multi-tenant = las que tienen columna org_id. Se descubren, no se listan.
const discovered = await sql`
    select c.relname                as name,
           c.relrowsecurity         as enabled,
           c.relforcerowsecurity    as forced,
           (select count(*) from pg_policy p where p.polrelid = c.oid) as policies
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relkind = 'r'
       and exists (
             select 1 from information_schema.columns col
              where col.table_schema = 'public'
                and col.table_name   = c.relname
                and col.column_name  = 'org_id')
     order by c.relname`;

// orgs no tiene columna org_id (su propia PK es el tenant) — se agrega a mano.
const orgsRow = await sql`
    select c.relname as name, c.relrowsecurity as enabled, c.relforcerowsecurity as forced,
           (select count(*) from pg_policy p where p.polrelid = c.oid) as policies
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relname = 'orgs'`;

const tables = [...orgsRow, ...discovered];

const failures = [];
const deferred = [];

if (!role || role.rolsuper || role.rolbypassrls) {
    failures.push(
        `el rol ${role?.name || 'desconocido'} conserva SUPERUSER/BYPASSRLS — ` +
        'las políticas RLS NO se están aplicando (ver db/cord-app-role.sql)',
    );
}

if (!tables.length) failures.push('no se descubrió ninguna tabla multi-tenant — la consulta de descubrimiento está rota');

for (const t of tables) {
    if (!t.enabled) { failures.push(`${t.name}: sin ENABLE ROW LEVEL SECURITY`); continue; }
    if (Number(t.policies) === 0) { failures.push(`${t.name}: RLS habilitada pero SIN políticas (bloquea todo o no filtra nada)`); continue; }
    if (!t.forced) {
        if (DEFERRED_FORCE.has(t.name)) deferred.push(`${t.name}: sin FORCE (diferido a db/cord-force-bootstrap-rls.sql)`);
        else failures.push(`${t.name}: sin FORCE ROW LEVEL SECURITY`);
    }
}

console.log(`Rol: ${role?.name} · tablas multi-tenant auditadas: ${tables.length}`);

if (deferred.length) {
    console.log('\nDiferido a la ventana 2 (esperado):\n- ' + deferred.join('\n- '));
}

if (failures.length) {
    console.error('\nRLS audit falló:\n- ' + failures.join('\n- '));
    process.exitCode = 1;
} else if (deferred.length) {
    console.log('\nRLS audit correcto salvo lo diferido — criterio de salida de la ventana 1 cumplido.');
} else {
    console.log('\nRLS audit correcto: ENABLE + FORCE + política en todas.');
}

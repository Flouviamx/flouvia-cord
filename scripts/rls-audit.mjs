import { neon } from '@neondatabase/serverless';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL no está configurada');
const sql = neon(databaseUrl);
const [role] = await sql`select current_user as name, rolbypassrls, rolsuper
                           from pg_roles where rolname = current_user`;
const protectedTables = [
    'orgs', 'org_members', 'cotizaciones', 'cotizacion_cobros', 'comisiones',
    'comision_invoice_batches', 'cobro_reembolsos', 'cobro_disputas',
    'identity_capture_sessions', 'documentos_fiscales', 'invoice_sequences',
];
const tables = await sql`
    select c.relname, c.relrowsecurity, c.relforcerowsecurity
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relname = any(${protectedTables})`;
const byName = new Map(tables.map((table) => [table.relname, table]));
const failures = [];
if (!role || role.rolsuper || role.rolbypassrls) failures.push(`el rol ${role?.name || 'desconocido'} conserva SUPERUSER/BYPASSRLS`);
for (const name of protectedTables) {
    const table = byName.get(name);
    if (!table) failures.push(`falta la tabla ${name}`);
    else if (!table.relrowsecurity || !table.relforcerowsecurity) failures.push(`${name} no tiene RLS ENABLE + FORCE`);
}
if (failures.length) {
    console.error('RLS audit falló:\n- ' + failures.join('\n- '));
    process.exitCode = 1;
} else {
    console.log(`RLS audit correcto para ${role.name}`);
}

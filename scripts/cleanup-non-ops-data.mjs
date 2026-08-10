// Limpieza controlada de Neon antes de abrir Cord a usuarios reales.
//
// Dry-run:
//   node scripts/cleanup-non-ops-data.mjs
// Ejecutar:
//   node scripts/cleanup-non-ops-data.mjs --execute
//
// Conserva exclusivamente los dos usuarios Ops y las organizaciones que poseen
// o de las que ya son miembros. No modifica schema ni servicios externos.
import { neon } from '@neondatabase/serverless';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const allowedEmails = ['andrevalleo13@gmail.com', 'hola@flouvia.com'];

function readVar(name) {
    if (process.env[name]) return process.env[name];
    for (const filename of ['.env', '.env.local']) {
        const path = join(root, filename);
        if (!existsSync(path)) continue;
        for (const line of readFileSync(path, 'utf8').split('\n')) {
            const match = line.match(new RegExp(`^\\s*(?:export\\s+)?${name}\\s*=\\s*(.+)\\s*$`));
            if (match) return match[1].replace(/^["']|["']$/g, '');
        }
    }
    return null;
}

const url = readVar('DATABASE_URL_UNPOOLED') || readVar('DATABASE_URL');
if (!url) throw new Error('DATABASE_URL no configurada');
const sql = neon(url);

const keepUsersSql = sql`
    select id from users where lower(email) = any(${allowedEmails}::text[])
`;

const keepOrgsSql = sql`
    select distinct o.id
    from orgs o
    where o.owner_id in (select id from users where lower(email) = any(${allowedEmails}::text[]))
       or exists (
          select 1 from org_members om
          join users u on u.id = om.user_id
          where om.org_id = o.id and lower(u.email) = any(${allowedEmails}::text[])
       )
`;

const [usersToDelete, orgsToDelete, orgsToKeep] = await Promise.all([
    sql`
      select email, created_at from users
      where id not in (${keepUsersSql})
      order by created_at
    `,
    sql`
      select nombre, created_at from orgs
      where id not in (${keepOrgsSql})
      order by created_at
    `,
    sql`
      select o.nombre, coalesce(u.email, 'sin owner') as owner_email
      from orgs o left join users u on u.id = o.owner_id
      where o.id in (${keepOrgsSql})
      order by o.created_at
    `,
]);

console.log(JSON.stringify({
    mode: process.argv.includes('--execute') ? 'execute' : 'dry-run',
    allowedEmails,
    usersToDelete: usersToDelete.map((row) => row.email),
    orgsToDelete: orgsToDelete.map((row) => row.nombre),
    orgsToKeep,
}, null, 2));

if (!process.argv.includes('--execute')) {
    console.log('\nDry-run completo. Agrega --execute para aplicar esta selección exacta.');
    process.exit(0);
}

if (orgsToKeep.length < 2 || usersToDelete.length === 0) {
    throw new Error('Guard de seguridad: el inventario no coincide con una limpieza pendiente válida');
}

const results = await sql.transaction([
    // Las organizaciones ownerless con un operador en rol owner recuperan un
    // owner_id explícito antes de eliminar identidades antiguas.
    sql`
      with candidates as (
        select distinct on (o.id) o.id as org_id, om.user_id
        from orgs o
        join org_members om on om.org_id = o.id
        join users u on u.id = om.user_id
        where o.owner_id is null
          and om.rol = 'owner'
          and lower(u.email) = any(${allowedEmails}::text[])
        order by o.id, om.created_at
      )
      update orgs o set owner_id = candidates.user_id
      from candidates
      where o.id = candidates.org_id
      returning o.id
    `,
    sql`
      delete from orgs
      where id not in (${keepOrgsSql})
      returning id
    `,
    sql`
      delete from users
      where id not in (${keepUsersSql})
      returning id
    `,
    // Invitaciones sin aceptar también son datos de identidades ajenas.
    sql`
      delete from org_members where user_id is null returning id
    `,
    // Conserva únicamente auditoría atribuida a los dos operadores reales.
    sql`
      delete from ops_audit_log
      where actor_email is null or lower(actor_email) <> all(${allowedEmails}::text[])
      returning id
    `,
]);

console.log(JSON.stringify({
    completed: true,
    ownerlessOrgsReassigned: results[0].length,
    organizationsDeleted: results[1].length,
    usersDeleted: results[2].length,
    pendingInvitesDeleted: results[3].length,
    unrelatedOpsAuditDeleted: results[4].length,
}, null, 2));

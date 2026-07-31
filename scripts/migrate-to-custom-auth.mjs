import { neon } from '@neondatabase/serverless';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

function loadEnv() {
    for (const f of ['.env', '.env.local']) {
        const p = join(process.cwd(), f);
        if (!existsSync(p)) continue;
        for (const line of readFileSync(p, 'utf8').split('\n')) {
            const m = line.match(/^\s*(?:export\s+)?(DATABASE_URL_UNPOOLED|DATABASE_URL)\s*=\s*(.+)\s*$/);
            if (m) return m[2].replace(/^["']|["']$/g, '');
        }
    }
}
const url = loadEnv();
if (!url) {
    console.error('No DATABASE_URL found.');
    process.exit(1);
}

const sql = neon(url);

async function run() {
    try {
        console.log('--- Iniciando migración de Clerk a Custom Auth preservando datos ---');

        // 1. Obtener todos los miembros que tienen clerk_user_id
        const members = await sql`SELECT clerk_user_id, email, nombre FROM org_members WHERE clerk_user_id IS NOT NULL`;
        
        // 2. Obtener todas las orgs que tienen clerk_user_id
        const orgs = await sql`SELECT id, clerk_user_id FROM orgs WHERE clerk_user_id IS NOT NULL`;
        
        const clerkToUuid = {};

        // 3. Crear usuarios en la nueva tabla 'users'
        console.log(`Migrando ${members.length} miembros a la tabla users...`);
        for (const m of members) {
            if (!clerkToUuid[m.clerk_user_id]) {
                const newId = randomUUID();
                clerkToUuid[m.clerk_user_id] = newId;
                
                // Tratar de insertar en users (con manejo de colisión de email)
                const email = m.email || `${m.clerk_user_id}@migrated.local`;
                try {
                    await sql`
                        INSERT INTO users (id, email, first_name, password_hash) 
                        VALUES (${newId}, ${email}, ${m.nombre || 'Migrated'}, 'dummy_hash')
                        ON CONFLICT (email) DO NOTHING
                    `;
                } catch (err) {
                    console.error('No se pudo crear usuario:', err.message);
                }
            }
        }

        for (const o of orgs) {
            if (!clerkToUuid[o.clerk_user_id]) {
                const newId = randomUUID();
                clerkToUuid[o.clerk_user_id] = newId;
                try {
                    await sql`
                        INSERT INTO users (id, email, first_name, password_hash) 
                        VALUES (${newId}, ${o.clerk_user_id + '@migrated.local'}, 'Migrated Owner', 'dummy_hash')
                        ON CONFLICT (email) DO NOTHING
                    `;
                } catch (err) {}
            }
        }

        console.log('Usuarios creados. Actualizando tablas...');

        // 4. Asegurarnos que existan las columnas destino
        await sql`ALTER TABLE org_members ADD COLUMN IF NOT EXISTS user_id uuid`;
        await sql`ALTER TABLE orgs ADD COLUMN IF NOT EXISTS owner_id uuid`;

        // 5. Mapear org_members
        for (const m of members) {
            const uid = clerkToUuid[m.clerk_user_id];
            if (uid) {
                await sql`UPDATE org_members SET user_id = ${uid} WHERE clerk_user_id = ${m.clerk_user_id}`;
            }
        }

        // 6. Mapear orgs
        for (const o of orgs) {
            const uid = clerkToUuid[o.clerk_user_id];
            if (uid) {
                await sql`UPDATE orgs SET owner_id = ${uid} WHERE id = ${o.id}`;
            }
        }

        console.log('Actualizando constraints...');
        
        // 7. Borrar columnas viejas y añadir constraints si es posible
        await sql`ALTER TABLE org_members DROP COLUMN IF EXISTS clerk_user_id`;
        await sql`ALTER TABLE orgs DROP COLUMN IF EXISTS clerk_user_id`;
        await sql`ALTER TABLE orgs DROP COLUMN IF EXISTS clerk_org_id`;

        try {
            await sql`ALTER TABLE org_members ADD CONSTRAINT org_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE`;
        } catch(e) {}
        try {
            await sql`ALTER TABLE orgs ADD CONSTRAINT orgs_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE SET NULL`;
        } catch(e) {}

        console.log('✅ Migración de datos completada exitosamente.');
    } catch (e) {
        console.error('Error migrando:', e);
    }
}

run();

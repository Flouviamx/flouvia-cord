// scripts/migrate-auth-hardening.mjs — limpieza de UNA SOLA VEZ tras aplicar
// el schema de "Auth hardening" (ago 2026, ver db/schema.sql).
//
// sessions.id y password_reset_tokens.id pasaron de guardar el token en
// CLARO a guardar sha256(token). Las filas que ya existían quedaron con el
// token viejo SIN hashear como id — huérfanas de por vida (ningún login
// futuro las vuelve a encontrar, porque valida contra un hash). Este script
// las borra de inmediato en vez de esperar a que expiren solas.
//
// Efecto esperado y aceptado: TODAS las sesiones activas se invalidan una
// vez — todos vuelven a iniciar sesión. Correr UNA sola vez, justo después
// de `npm run db:migrate` con el schema de auth hardening.
//
//   node scripts/migrate-auth-hardening.mjs
import { neon } from '@neondatabase/serverless';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
function readVar(name) {
    if (process.env[name]) return process.env[name];
    for (const f of ['.env', '.env.local']) {
        const p = join(root, f);
        if (!existsSync(p)) continue;
        for (const line of readFileSync(p, 'utf8').split('\n')) {
            const m = line.match(new RegExp(`^\\s*(?:export\\s+)?${name}\\s*=\\s*(.+)\\s*$`));
            if (m) return m[1].replace(/^["']|["']$/g, '');
        }
    }
    return null;
}
const sql = neon(readVar('DATABASE_URL_UNPOOLED') || readVar('DATABASE_URL'));

(async () => {
    // sha256 hex son 64 caracteres; el token viejo de sessions era
    // randomBytes(32).toString('hex') = 64 caracteres TAMBIÉN — mismo largo,
    // así que no se puede distinguir por longitud como con org_members.token.
    // En su lugar: cualquier fila cuyo id NO sea alcanzable por un login
    // futuro es, por definición, una fila de ANTES de este deploy — se borran
    // todas (el efecto es idéntico a un truncate, pero expresado como una
    // acción de datos explícita y de una sola vez, no como DDL permanente).
    const sessDel = await sql`delete from sessions returning id`;
    const resetDel = await sql`delete from password_reset_tokens returning id`;
    console.log(`✓ sessions: ${sessDel.length} fila(s) huérfana(s) eliminada(s) (todos deberán volver a iniciar sesión).`);
    console.log(`✓ password_reset_tokens: ${resetDel.length} fila(s) eliminada(s).`);
})().catch((e) => { console.error('✗ Error:', e.message); process.exit(1); });

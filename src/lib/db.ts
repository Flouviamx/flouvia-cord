// src/lib/db.ts
// Cliente de Neon (PostgreSQL serverless). Una sola conexión HTTP por request —
// ideal para el modelo serverless de Vercel (sin pool persistente).
//
// El `sql` es un tagged-template: sql`select * from orgs where id = ${id}`
// parametriza automáticamente (a prueba de inyección). Para queries dinámicas
// usar sql.query('... $1 ...', [params]).

import { neon } from '@neondatabase/serverless';

const url = import.meta.env.DATABASE_URL || process.env.DATABASE_URL;

if (!url) {
    // No tiramos en build (las páginas SSR sólo tocan la DB en runtime), pero
    // dejamos un error claro si alguna query corre sin la variable.
    console.warn('[db] DATABASE_URL no está definida — las queries fallarán en runtime.');
}

export const sql = neon(url || 'postgres://invalid');

// ── Tenancy seam ──────────────────────────────────────────────────────────
// Mientras no exista Clerk, toda la app opera sobre UNA org demo sembrada en la
// migración (clerk_user_id = 'demo-user'). Cuando se conecte Clerk, este helper
// pasa a resolver el org_id desde la sesión (locals.auth().userId → orgs).
export const DEMO_CLERK_USER_ID = 'demo-user';

export async function getActiveOrgId(): Promise<string> {
    // Sin caché a propósito: la query es mínima e indexada (clerk_user_id unique),
    // y cachear a nivel módulo se queda stale tras un db:reset en dev. Cuando llegue
    // Clerk, esto resuelve el org_id desde la sesión (locals.auth().userId).
    const rows = await sql`select id from orgs where clerk_user_id = ${DEMO_CLERK_USER_ID} limit 1`;
    if (!rows.length) throw new Error('[db] org demo no encontrada — ¿corriste la migración (npm run db:migrate)?');
    return rows[0].id as string;
}

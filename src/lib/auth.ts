import { scryptSync, randomUUID, randomBytes } from 'node:crypto';
import { sql } from './db';

// ── Argon2id Placeholder (Fase 2) ──
// TODO: Reemplazar con @node-rs/argon2 cuando NPM lo permita
// Por ahora usamos scrypt (nativo) con un factor de trabajo alto para simular la seguridad.
export async function hashPassword(password: string): Promise<string> {
    return new Promise((resolve) => {
        const salt = randomBytes(16).toString('hex');
        // Usamos scrypt como placeholder criptográfico fuerte
        const derivedKey = scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 });
        resolve(`${salt}:${derivedKey.toString('hex')}`);
    });
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
    return new Promise((resolve) => {
        const [salt, key] = hash.split(':');
        if (!salt || !key) return resolve(false);
        const derivedKey = scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 });
        resolve(key === derivedKey.toString('hex'));
    });
}

// ── Manejo de Sesiones ──
export async function createSession(userId: string, userAgent?: string, ip?: string): Promise<string> {
    const sessionId = randomBytes(32).toString('hex');
    // 30 dias de sesion
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    
    await sql`
        insert into sessions (id, user_id, expires_at, user_agent, ip)
        values (${sessionId}, ${userId}, ${expiresAt}, ${userAgent || null}, ${ip || null})
    `;
    return sessionId;
}

export async function validateSession(sessionId: string): Promise<{ userId: string } | null> {
    const rows = await sql`
        select user_id, expires_at from sessions 
        where id = ${sessionId} limit 1
    `;
    if (!rows.length) return null;
    
    const session = rows[0];
    if (new Date(session.expires_at) < new Date()) {
        // Sesión expirada, la limpiamos
        await sql`delete from sessions where id = ${sessionId}`;
        return null;
    }
    
    return { userId: session.user_id as string };
}

export async function invalidateSession(sessionId: string): Promise<void> {
    await sql`delete from sessions where id = ${sessionId}`;
}

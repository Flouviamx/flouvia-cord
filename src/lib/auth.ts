// src/lib/auth.ts — núcleo de autenticación propia de Cord.
//
// Reescritura completa (ago 2026) tras la auditoría de seguridad tras la
// migración de Clerk. Ver docs/historial-auth-clerk.md para el detalle de
// qué vulnerabilidades específicas cierra este archivo.
//
// Decisiones de diseño:
//  · Hash de contraseñas: Argon2id (@node-rs/argon2, binario nativo), con
//    los parámetros recomendados por OWASP 2026 (m=19456 KiB, t=2, p=1).
//    Las cuentas con hash LEGACY (scrypt, formato "salt:key") se siguen
//    verificando correctamente y se re-hashean a Argon2id en el primer
//    login exitoso — sin forzar un reset masivo de contraseñas.
//  · Tokens de sesión/reset/verificación: el valor CRUDO viaja al cliente
//    (cookie o link de correo) y NUNCA se persiste — solo se guarda
//    sha256(token). Una lectura de la base de datos ya no equivale a un
//    secuestro de sesión.
//  · Todas las comparaciones de secretos usan un mecanismo naturalmente
//    constant-time (lookup por hash indexado, o argon2 verify) — nunca
//    `===` sobre un secreto.
import { hash as argon2Hash, verify as argon2Verify } from '@node-rs/argon2';
import { scryptSync, randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import { sql } from './db';
import { verifyTotp, matchBackupCode } from './totp';

// ── Parámetros de Argon2id (OWASP 2026) ─────────────────────────────────────
// `Algorithm.Argon2id` (@node-rs/argon2) es un `const enum` — inaccesible con
// `verbatimModuleSyntax` (tsconfig del proyecto). `2` es su valor numérico
// real (Argon2d=0, Argon2i=1, Argon2id=2), confirmado contra el .d.ts del paquete.
const ARGON2_ID = 2;
const ARGON2_OPTS = {
    memoryCost: 19456, // 19 MiB
    timeCost: 2,
    parallelism: 1,
    algorithm: ARGON2_ID,
} as const;

// Hash señuelo VÁLIDO (verifica siempre a false) usado cuando no hay hash real
// contra el que comparar (cuenta inexistente, o solo-OAuth sin password). Así
// el costo de CPU de `verifyPassword` es el MISMO en todos los casos y no se
// puede distinguir "la cuenta existe" de "no existe" por tiempo de respuesta.
const DECOY_HASH = '$argon2id$v=19$m=19456,t=2,p=1$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

export async function hashPassword(password: string): Promise<string> {
    return argon2Hash(password, ARGON2_OPTS);
}

/** Un hash "legacy" es el formato scrypt viejo `salt:key` (nunca empieza con $argon2). */
export function isLegacyHash(hash: string): boolean {
    return !hash.startsWith('$argon2');
}

function verifyLegacyScrypt(password: string, hash: string): boolean {
    const [salt, key] = hash.split(':');
    if (!salt || !key) return false;
    try {
        const derived = scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 });
        const stored = Buffer.from(key, 'hex');
        if (stored.length !== derived.length) return false;
        return timingSafeEqual(derived, stored);
    } catch {
        return false;
    }
}

/**
 * Verifica una contraseña contra un hash (Argon2id o legacy scrypt). `hash`
 * puede ser null/undefined/'dummy_hash' (cuenta OAuth-only, o una cuenta
 * dañada por el bug histórico del reset) — en esos casos SIEMPRE corre el
 * trabajo de CPU del señuelo antes de devolver false, para no filtrar el
 * estado de la cuenta por tiempo de respuesta.
 */
export async function verifyPassword(password: string, hash: string | null | undefined): Promise<boolean> {
    if (!hash || hash === 'dummy_hash') {
        await argon2Verify(DECOY_HASH, password).catch(() => false);
        return false;
    }
    if (isLegacyHash(hash)) return verifyLegacyScrypt(password, hash);
    try {
        return await argon2Verify(hash, password);
    } catch {
        return false;
    }
}

/**
 * Verifica la contraseña y, si el hash guardado es legacy (scrypt), lo
 * re-hashea a Argon2id de forma transparente en el mismo login exitoso.
 */
export async function verifyAndMaybeUpgrade(userId: string, password: string, hash: string | null | undefined): Promise<boolean> {
    const ok = await verifyPassword(password, hash);
    if (ok && hash && isLegacyHash(hash)) {
        const upgraded = await hashPassword(password);
        await sql`update users set password_hash = ${upgraded} where id = ${userId}`;
    }
    return ok;
}

/**
 * Re-autenticación para acciones destructivas (eliminar cuenta personal,
 * eliminar organización, desactivar 2FA) — exige la contraseña actual si la
 * cuenta tiene una real, o un código TOTP/de respaldo vigente si es
 * OAuth-only. Antes vivía duplicado inline en 2fa/disable.ts; ahora es la
 * única fuente para que las tres acciones no puedan divergir.
 */
export async function reauthenticate(userId: string, creds: { password?: string; code?: string }): Promise<boolean> {
    const [user] = await sql`select password_hash, totp_secret, totp_enabled, totp_backup_codes from users where id = ${userId} limit 1`;
    if (!user) return false;

    const hasRealPassword = !!user.password_hash && user.password_hash !== 'dummy_hash';
    if (hasRealPassword && creds.password) {
        return verifyPassword(creds.password, user.password_hash as string);
    }
    if (user.totp_enabled && creds.code) {
        return (
            verifyTotp(user.totp_secret as string, creds.code) ||
            matchBackupCode((user.totp_backup_codes as string[]) || [], creds.code) !== -1
        );
    }
    return false;
}

/** sha256 hex — usado para todos los tokens de un solo uso (sesión, reset, invitación, verificación). */
export function sha256Hex(input: string): string {
    return createHash('sha256').update(input).digest('hex');
}

// ── Sesiones ─────────────────────────────────────────────────────────────
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 días, deslizante
const SESSION_ABSOLUTE_MS = 180 * 24 * 60 * 60 * 1000; // 180 días, tope duro (antes 90 — ver fix de cookie deslizante abajo)
const SESSION_SLIDE_THROTTLE_MS = 5 * 60 * 1000; // no reescribir en cada request — cada 5 min basta

/** Crea una sesión y devuelve el token CRUDO (va en la cookie; nunca se guarda). */
export async function createSession(userId: string, userAgent?: string, ip?: string): Promise<string> {
    // Control común a password, OAuth, passkey, SAML y verificación de correo.
    // Ningún método alterno puede abrir sesión si Ops suspendió la identidad.
    const account = await sql`select suspended_at from users where id = ${userId} limit 1`;
    if (!account.length || account[0].suspended_at) {
        throw new Error('ACCOUNT_SUSPENDED');
    }
    const token = randomBytes(32).toString('hex');
    const tokenHash = sha256Hex(token);
    const now = Date.now();
    const expiresAt = new Date(now + SESSION_TTL_MS);
    const absoluteExpiresAt = new Date(now + SESSION_ABSOLUTE_MS);
    await sql`
        insert into sessions (id, user_id, expires_at, absolute_expires_at, user_agent, ip, last_used_at)
        values (${tokenHash}, ${userId}, ${expiresAt}, ${absoluteExpiresAt}, ${userAgent || null}, ${ip || null}, now())
    `;
    return token;
}

export async function validateSession(token: string): Promise<{ userId: string; sessionId: string; slid: boolean; idleMs: number } | null> {
    const tokenHash = sha256Hex(token);
    const rows = await sql`
        select s.user_id, s.expires_at, s.absolute_expires_at, s.revoked_at,
               s.last_used_at, u.suspended_at
        from sessions s
        join users u on u.id = s.user_id
        where s.id = ${tokenHash} limit 1
    `;
    if (!rows.length) return null;
    const s = rows[0] as any;
    const now = new Date();
    if (s.revoked_at || s.suspended_at || new Date(s.expires_at) < now || new Date(s.absolute_expires_at) < now) {
        await sql`delete from sessions where id = ${tokenHash}`;
        return null;
    }
    // idleMs = tiempo transcurrido desde el ÚLTIMO request verificado, leído
    // ANTES de tocar la fila — es lo que el caller (middleware.ts) usa para
    // aplicar `orgs.session_timeout_min` (cierre de sesión por inactividad
    // configurable por org, independiente del TTL deslizante de 30d de abajo).
    const idleMs = now.getTime() - new Date(s.last_used_at).getTime();
    // Sliding expiry, con throttle: solo se reescribe si pasaron ≥5 min desde el
    // último uso — evita un UPDATE en cada request de una sesión activa.
    // `slid` le dice al caller (middleware.ts) si debe re-emitir la cookie con
    // un Max-Age renovado — antes la sesión se deslizaba en BD pero la cookie
    // del navegador se quedaba con el maxAge fijo del login original, así que
    // el navegador la borraba a los 30 días exactos aunque el usuario entrara
    // todos los días.
    let slid = false;
    if (idleMs > SESSION_SLIDE_THROTTLE_MS) {
        const newExpires = new Date(Math.min(now.getTime() + SESSION_TTL_MS, new Date(s.absolute_expires_at).getTime()));
        await sql`update sessions set last_used_at = now(), expires_at = ${newExpires} where id = ${tokenHash}`;
        slid = true;
    }
    return { userId: s.user_id as string, sessionId: tokenHash, slid, idleMs };
}

export async function invalidateSession(token: string): Promise<void> {
    await sql`delete from sessions where id = ${sha256Hex(token)}`;
}

/** Revoca una sesión por su id (hash) — para "Tu cuenta", que nunca tiene el token crudo. */
export async function revokeSessionById(sessionId: string, userId: string): Promise<boolean> {
    const res = await sql`delete from sessions where id = ${sessionId} and user_id = ${userId} returning id`;
    return res.length > 0;
}

/** Revoca TODAS las sesiones de un usuario (cambio de password, desactivar 2FA, etc). */
export async function revokeAllSessions(userId: string, exceptSessionId?: string): Promise<void> {
    if (exceptSessionId) {
        await sql`delete from sessions where user_id = ${userId} and id != ${exceptSessionId}`;
    } else {
        await sql`delete from sessions where user_id = ${userId}`;
    }
}

export async function listSessions(userId: string) {
    return sql`
        select id, user_agent, ip, created_at, last_used_at, expires_at
        from sessions where user_id = ${userId} order by last_used_at desc`;
}

// ── Lockout por cuenta (no solo por IP) ─────────────────────────────────────
// 15 minutos está hardcodeado en el `interval` del UPDATE de recordFailedLogin
// (Postgres no acepta un parámetro JS ahí) — mantenerlos en sync si cambia.
const MAX_FAILED_LOGINS = 10;

/**
 * Devuelve true si la cuenta está bloqueada AHORA MISMO. Si el bloqueo ya
 * venció, lo limpia (desbloqueo natural) y devuelve false.
 */
export async function checkAndConsumeLockout(userId: string): Promise<boolean> {
    const rows = await sql`select locked_until from users where id = ${userId}`;
    if (!rows.length || !rows[0].locked_until) return false;
    if (new Date(rows[0].locked_until as string) > new Date()) return true;
    await sql`update users set failed_login_count = 0, locked_until = null where id = ${userId}`;
    return false;
}

export async function recordFailedLogin(userId: string): Promise<void> {
    await sql`
        update users
        set failed_login_count = failed_login_count + 1,
            locked_until = case
                when failed_login_count + 1 >= ${MAX_FAILED_LOGINS}
                then now() + interval '15 minutes'
                else locked_until
            end
        where id = ${userId}`;
}

export async function resetFailedLogins(userId: string): Promise<void> {
    await sql`update users set failed_login_count = 0, locked_until = null where id = ${userId}`;
}

// ── Verificación de correo ───────────────────────────────────────────────
const EMAIL_VERIFY_TTL_MS = 24 * 60 * 60 * 1000; // 24 h

export async function createEmailVerificationToken(userId: string, email: string): Promise<string> {
    const token = randomBytes(32).toString('base64url');
    const tokenHash = sha256Hex(token);
    const expiresAt = new Date(Date.now() + EMAIL_VERIFY_TTL_MS);
    // Solo un token vivo por usuario — pedir "reenviar" invalida el anterior.
    await sql`delete from email_verification_tokens where user_id = ${userId}`;
    await sql`insert into email_verification_tokens (id, user_id, email, expires_at) values (${tokenHash}, ${userId}, ${email}, ${expiresAt})`;
    return token;
}

export async function confirmEmailVerification(token: string): Promise<{ userId: string; email: string } | null> {
    const tokenHash = sha256Hex(token);
    await sql`delete from email_verification_tokens where expires_at < now()`;
    const rows = await sql`select user_id, email, expires_at from email_verification_tokens where id = ${tokenHash} limit 1`;
    if (!rows.length) return null;
    const r = rows[0] as any;
    await sql`delete from email_verification_tokens where id = ${tokenHash}`;
    if (new Date(r.expires_at) < new Date()) return null;
    await sql`update users set email_verified_at = now() where id = ${r.user_id}`;
    return { userId: r.user_id as string, email: r.email as string };
}

// ── Reset de contraseña ──────────────────────────────────────────────────
const RESET_TTL_MS = 15 * 60 * 1000;

export async function createPasswordResetToken(userId: string): Promise<string> {
    const token = randomBytes(32).toString('base64url');
    const tokenHash = sha256Hex(token);
    const expiresAt = new Date(Date.now() + RESET_TTL_MS);
    // Invalida cualquier reset pendiente anterior — solo uno vivo a la vez.
    await sql`delete from password_reset_tokens where user_id = ${userId}`;
    await sql`insert into password_reset_tokens (id, user_id, expires_at) values (${tokenHash}, ${userId}, ${expiresAt})`;
    return token;
}

/** Busca el userId dueño de un token de reset vivo, sin consumirlo todavía. */
export async function lookupPasswordResetToken(token: string): Promise<string | null> {
    const tokenHash = sha256Hex(token);
    await sql`delete from password_reset_tokens where expires_at < now()`;
    const rows = await sql`select user_id, expires_at, used_at from password_reset_tokens where id = ${tokenHash} limit 1`;
    if (!rows.length) return null;
    const r = rows[0] as any;
    if (r.used_at || new Date(r.expires_at) < new Date()) return null;
    return r.user_id as string;
}

export async function consumePasswordResetToken(token: string): Promise<void> {
    await sql`delete from password_reset_tokens where id = ${sha256Hex(token)}`;
}

// ── Reto de segundo factor (entre "password correcto" y "sesión real") ──────
const TWO_FA_CHALLENGE_TTL_MS = 5 * 60 * 1000;

export async function createTwoFactorChallenge(userId: string): Promise<string> {
    const token = randomBytes(32).toString('base64url');
    const tokenHash = sha256Hex(token);
    const expiresAt = new Date(Date.now() + TWO_FA_CHALLENGE_TTL_MS);
    await sql`insert into two_factor_challenges (id, user_id, expires_at) values (${tokenHash}, ${userId}, ${expiresAt})`;
    return token;
}

export async function consumeTwoFactorChallenge(token: string): Promise<string | null> {
    const tokenHash = sha256Hex(token);
    await sql`delete from two_factor_challenges where expires_at < now()`;
    const rows = await sql`delete from two_factor_challenges where id = ${tokenHash} returning user_id, expires_at`;
    if (!rows.length) return null;
    const r = rows[0] as any;
    if (new Date(r.expires_at) < new Date()) return null;
    return r.user_id as string;
}

// ── Cookies compartidas ──────────────────────────────────────────────────
export const SESSION_COOKIE = 'cord_session';
export const SESSION_COOKIE_MAX_AGE = Math.floor(SESSION_TTL_MS / 1000);

export function sessionCookieOptions() {
    return {
        path: '/',
        httpOnly: true,
        secure: import.meta.env.PROD,
        sameSite: 'lax' as const,
        maxAge: SESSION_COOKIE_MAX_AGE,
    };
}

// Cookie "hint" — legible por JS, sin identidad (valor constante '1'), solo para
// que el navbar de la landing (prerender:true, sin acceso al middleware) sepa
// si mostrar "Entrar" o "Ir al Dashboard" sin exponer el token de sesión.
// La cookie real de sesión (arriba) sigue siendo httpOnly y es la única que
// el middleware valida contra la tabla `sessions` en cada request — esta
// cookie NUNCA autentica nada, solo evita que la UI mienta sobre el estado.
export const AUTH_HINT_COOKIE = 'cord_auth_hint';

export function authHintCookieOptions() {
    return {
        path: '/',
        httpOnly: false,
        secure: import.meta.env.PROD,
        sameSite: 'lax' as const,
        maxAge: SESSION_COOKIE_MAX_AGE,
    };
}

type CookieJar = { set: (name: string, value: string, opts?: any) => void; delete: (name: string, opts?: any) => void };

/** Escribe la cookie de sesión (httpOnly) Y el hint (legible por JS) en un solo paso. */
export function setSessionCookies(cookies: CookieJar, token: string): void {
    cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
    cookies.set(AUTH_HINT_COOKIE, '1', authHintCookieOptions());
}

/** Borra ambas cookies de sesión — logout, revocación, cuenta suspendida/eliminada. */
export function clearSessionCookies(cookies: CookieJar): void {
    cookies.delete(SESSION_COOKIE, { path: '/' });
    cookies.delete(AUTH_HINT_COOKIE, { path: '/' });
}

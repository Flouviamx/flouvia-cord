// Autenticación exclusiva del panel interno /ops.
//
// Invariantes de seguridad:
//  · Solo dos correos exactos pueden ser operadores. La allowlist vive en
//    código Y en ops_operators; ambas condiciones deben cumplirse.
//  · Producción nunca acepta contraseña sola: passkey, o password + TOTP.
//    En localhost se permite sesión Cord vigente del mismo usuario + password.
//  · Tokens crudos solo viven en cookies HttpOnly; PostgreSQL guarda sha256.
//  · Una sola sesión Ops activa por operador, 30 min de inactividad y 8 h
//    absolutas. La sesión queda ligada al User-Agent que la creó.
import { randomBytes } from 'node:crypto';
import { sql } from './db';
import { sha256Hex } from './auth';
import { log } from './log';

export const OPS_ALLOWED_EMAILS = [
    'andrevalleo13@gmail.com',
    'hola@flouvia.com',
] as const;

const ALLOWED = new Set<string>(OPS_ALLOWED_EMAILS);
const IDLE_TTL_MS = 30 * 60 * 1000;
const ABSOLUTE_TTL_MS = 8 * 60 * 60 * 1000;
const SLIDE_THROTTLE_MS = 5 * 60 * 1000;
const CHALLENGE_TTL_MS = 5 * 60 * 1000;
const SESSION_TOKEN_RE = /^[a-f0-9]{64}$/;
const CHALLENGE_TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

export const OPS_SESSION_COOKIE = import.meta.env.PROD
    ? '__Host-cord_ops_session'
    : 'cord_ops_session';
export const OPS_CHALLENGE_COOKIE = import.meta.env.PROD
    ? '__Host-cord_ops_challenge'
    : 'cord_ops_challenge';
export const OPS_PASSKEY_CHALLENGE_COOKIE = import.meta.env.PROD
    ? '__Host-cord_ops_passkey_challenge'
    : 'cord_ops_passkey_challenge';

export type OpsAuthMethod = 'passkey' | 'password_totp' | 'local_session_password';

export interface OpsOperator {
    userId: string;
    email: string;
    role: 'admin' | 'read_only';
    authMethod: OpsAuthMethod;
    sessionId: string;
}

export interface OpsAuditEvent {
    actorUserId?: string | null;
    actorEmail?: string | null;
    action: string;
    targetType?: string | null;
    targetId?: string | null;
    result?: 'success' | 'failure' | 'denied';
    metadata?: Record<string, unknown>;
    ip?: string | null;
    userAgent?: string | null;
}

export function normalizeOpsEmail(value: unknown): string {
    return String(value ?? '').trim().toLowerCase();
}

export function isAllowedOpsEmail(value: unknown): boolean {
    return ALLOWED.has(normalizeOpsEmail(value));
}

export function opsSessionCookieOptions() {
    return {
        path: '/',
        httpOnly: true,
        secure: import.meta.env.PROD,
        sameSite: 'strict' as const,
        maxAge: Math.floor(ABSOLUTE_TTL_MS / 1000),
    };
}

export function opsChallengeCookieOptions() {
    return {
        path: '/',
        httpOnly: true,
        secure: import.meta.env.PROD,
        sameSite: 'strict' as const,
        maxAge: Math.floor(CHALLENGE_TTL_MS / 1000),
    };
}

function validChallengeToken(token: string | undefined | null): token is string {
    return typeof token === 'string' && CHALLENGE_TOKEN_RE.test(token);
}

export function opsAuditQuery(event: OpsAuditEvent) {
    return sql`
        insert into ops_audit_log (
            actor_operator_id, actor_email, action, target_type, target_id,
            result, metadata, ip, user_agent
        ) values (
            ${event.actorUserId ?? null}, ${event.actorEmail ?? null},
            ${event.action}, ${event.targetType ?? null}, ${event.targetId ?? null},
            ${event.result ?? 'success'}, ${JSON.stringify(event.metadata ?? {})}::jsonb,
            ${event.ip ?? null}, ${event.userAgent ?? null}
        )
    `;
}

export async function logOpsAudit(event: OpsAuditEvent): Promise<void> {
    try {
        await opsAuditQuery(event);
    } catch (error) {
        // La auditoría no debe revelar detalles al cliente ni convertir un
        // logout en 500. Sí dejamos una señal server-side para observabilidad.
        log.error('error no controlado', { route: 'ops/audit', err: error });
    }
}

export async function createOpsChallenge(operatorId: string): Promise<string> {
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + CHALLENGE_TTL_MS);
    await sql`delete from ops_auth_challenges where operator_id = ${operatorId} or expires_at < now()`;
    await sql`
        insert into ops_auth_challenges (id, operator_id, expires_at)
        values (${sha256Hex(token)}, ${operatorId}, ${expiresAt})
    `;
    return token;
}

/** Consume el reto incluso si el TOTP posterior resulta incorrecto. */
export async function consumeOpsChallenge(token: string | undefined | null): Promise<string | null> {
    if (!validChallengeToken(token)) return null;
    await sql`delete from ops_auth_challenges where expires_at < now()`;
    const rows = await sql`
        delete from ops_auth_challenges
        where id = ${sha256Hex(token)}
        returning operator_id, expires_at
    `;
    if (!rows.length || new Date(rows[0].expires_at as string) <= new Date()) return null;
    return rows[0].operator_id as string;
}

/** Persiste el reto WebAuthn para que sea de un solo uso incluso entre requests concurrentes. */
export async function createOpsPasskeyChallenge(
    challenge: string,
    operatorId: string | null,
): Promise<void> {
    if (!validChallengeToken(challenge)) throw new Error('Invalid Ops passkey challenge');
    const expiresAt = new Date(Date.now() + CHALLENGE_TTL_MS);
    await sql`delete from ops_passkey_challenges where expires_at < now()`;
    if (operatorId) {
        await sql`delete from ops_passkey_challenges where operator_id = ${operatorId}`;
    }
    await sql`
        insert into ops_passkey_challenges (id, operator_id, expires_at)
        values (${sha256Hex(challenge)}, ${operatorId}, ${expiresAt})
    `;
}

/** Consume el reto WebAuthn de forma atomica y devuelve la identidad a la que se ligo. */
export async function consumeOpsPasskeyChallenge(
    challenge: string | undefined | null,
): Promise<string | null> {
    if (!validChallengeToken(challenge)) return null;
    await sql`delete from ops_passkey_challenges where expires_at < now()`;
    const rows = await sql`
        delete from ops_passkey_challenges
        where id = ${sha256Hex(challenge)} and expires_at > now()
        returning operator_id
    `;
    return rows.length && rows[0].operator_id ? rows[0].operator_id as string : null;
}

export async function createOpsSession(
    operatorId: string,
    method: OpsAuthMethod,
    userAgent: string,
    ip: string,
    credentialId?: string | null,
): Promise<string> {
    if (method === 'passkey' && !credentialId) {
        throw new Error('Passkey Ops sessions require a credential id');
    }
    const token = randomBytes(32).toString('hex');
    const now = Date.now();
    const idleExpiresAt = new Date(now + IDLE_TTL_MS);
    const absoluteExpiresAt = new Date(now + ABSOLUTE_TTL_MS);

    // Privilegio alto: una sola sesión viva por persona. Un login nuevo corta
    // cualquier cookie Ops olvidada en otro navegador o dispositivo.
    await sql.transaction([
        sql`delete from ops_sessions where operator_id = ${operatorId}`,
        sql`
            insert into ops_sessions (
                id, operator_id, expires_at, absolute_expires_at, last_used_at,
                ip, user_agent, auth_method, credential_id
            ) values (
                ${sha256Hex(token)}, ${operatorId}, ${idleExpiresAt}, ${absoluteExpiresAt}, now(),
                ${ip}, ${userAgent}, ${method}, ${credentialId ?? null}
            )
        `,
    ]);
    return token;
}

export async function validateOpsSession(
    token: string | undefined | null,
    userAgent?: string | null,
): Promise<OpsOperator | null> {
    if (typeof token !== 'string' || !SESSION_TOKEN_RE.test(token)) return null;
    const tokenHash = sha256Hex(token);
    try {
        const rows = await sql`
            select s.operator_id, s.expires_at, s.absolute_expires_at, s.last_used_at,
                   s.revoked_at, s.user_agent, s.auth_method, s.created_at, s.credential_id,
                   o.email as operator_email, o.role, o.active,
                   u.email as current_email, u.email_verified_at, u.password_changed_at,
                   u.suspended_at, u.totp_enabled, u.totp_confirmed_at,
                   exists(
                       select 1 from passkeys p
                       where p.id = s.credential_id and p.user_id = s.operator_id
                   ) as credential_active
            from ops_sessions s
            join ops_operators o on o.user_id = s.operator_id
            join users u on u.id = s.operator_id
            where s.id = ${tokenHash}
            limit 1
        `;
        if (!rows.length) return null;

        const row = rows[0] as any;
        const email = normalizeOpsEmail(row.current_email);
        const now = new Date();
        const createdAt = new Date(row.created_at);
        const passwordChangedAt = row.password_changed_at ? new Date(row.password_changed_at) : null;
        const totpConfirmedAt = row.totp_confirmed_at ? new Date(row.totp_confirmed_at) : null;
        const validAuthState =
            row.auth_method === 'passkey'
                ? Boolean(row.credential_id && row.credential_active)
                : row.auth_method === 'password_totp'
                    ? Boolean(row.totp_enabled && totpConfirmedAt && createdAt >= totpConfirmedAt)
                    : row.auth_method === 'local_session_password' && !import.meta.env.PROD;
        const invalid =
            row.revoked_at ||
            !row.active ||
            row.suspended_at ||
            !row.email_verified_at ||
            !isAllowedOpsEmail(email) ||
            normalizeOpsEmail(row.operator_email) !== email ||
            !['admin', 'read_only'].includes(row.role) ||
            !validAuthState ||
            (passwordChangedAt && createdAt < passwordChangedAt) ||
            new Date(row.expires_at) <= now ||
            new Date(row.absolute_expires_at) <= now;

        if (invalid) {
            await sql`delete from ops_sessions where id = ${tokenHash}`;
            return null;
        }

        // Ata la cookie al navegador que realizó la autenticación fuerte. No
        // usamos IP porque cambia legítimamente en redes móviles/VPN.
        if (userAgent && row.user_agent && userAgent !== row.user_agent) {
            await sql`delete from ops_sessions where id = ${tokenHash}`;
            await logOpsAudit({
                actorUserId: row.operator_id,
                actorEmail: email,
                action: 'ops.session_user_agent_mismatch',
                result: 'denied',
                metadata: { session_revoked: true },
                userAgent,
            });
            return null;
        }

        const staleMs = now.getTime() - new Date(row.last_used_at).getTime();
        if (staleMs >= SLIDE_THROTTLE_MS) {
            const newExpiry = new Date(Math.min(
                now.getTime() + IDLE_TTL_MS,
                new Date(row.absolute_expires_at).getTime(),
            ));
            await sql`
                update ops_sessions set last_used_at = now(), expires_at = ${newExpiry}
                where id = ${tokenHash}
            `;
        }

        return {
            userId: row.operator_id as string,
            email,
            role: row.role as OpsOperator['role'],
            authMethod: row.auth_method as OpsAuthMethod,
            sessionId: tokenHash,
        };
    } catch (error) {
        // Fail closed: caída o drift de schema jamás convierte Ops en público.
        log.error('error no controlado', { route: 'ops/session', err: error });
        return null;
    }
}

export async function invalidateOpsSession(
    token: string | undefined | null,
    ip?: string,
    userAgent?: string,
): Promise<void> {
    if (typeof token !== 'string' || !SESSION_TOKEN_RE.test(token)) return;
    const rows = await sql`
        delete from ops_sessions s
        using ops_operators o
        where s.id = ${sha256Hex(token)} and o.user_id = s.operator_id
        returning s.operator_id, o.email
    `;
    if (rows.length) {
        await logOpsAudit({
            actorUserId: rows[0].operator_id as string,
            actorEmail: rows[0].email as string,
            action: 'ops.logout',
            ip,
            userAgent,
        });
    }
}

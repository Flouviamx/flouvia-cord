// `cord login` por navegador (flujo de dispositivo). La terminal recibe un
// device code (credencial que solo ella conoce) y un user code corto que la
// persona confirma con su sesión. Al aprobar, Cord crea una llave restringida
// de prueba con lo que el CLI usa, cifrada hasta que la terminal la reclama una
// sola vez. Las consultas pasan por funciones security definer (db/schema.sql).
import { createHash, randomBytes, randomInt } from 'node:crypto';
import type { APIRoute } from 'astro';
import { sql } from './db';
import { encryptRequiredSecret, decryptSecret } from './crypto-secret';
import { POST as createKey, DELETE as revokeKey } from '../pages/api/keys';

/** Lo que el CLI necesita y nada más: simuladores, eventos y proponer configuración. */
export const CLI_KEY_PERMISSIONS = { test_helpers: 'write', eventos: 'read', setup: 'write' } as const;
export const CLI_KEY_DAYS = 90;
export const LOGIN_TTL_SECONDS = 600;

// Sin letras ni números que se confundan al dictarlos (0/O, 1/I/L, 5/S).
const ALPHABET = 'BCDFGHJKMNPQRTVWXZ2346789';

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

export function newUserCode(): string {
    const pick = () => Array.from({ length: 4 }, () => ALPHABET[randomInt(ALPHABET.length)]).join('');
    return `${pick()}-${pick()}`;
}

export function normalizeUserCode(input: unknown): string | null {
    const v = String(input ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    return /^[A-Z0-9]{8}$/.test(v) ? `${v.slice(0, 4)}-${v.slice(4)}` : null;
}

export function cleanHost(input: unknown): string {
    return String(input ?? '').replace(/[^\w.\- ]/g, '').trim().slice(0, 60) || 'terminal';
}

export async function startLogin(host: string): Promise<{ deviceCode: string; userCode: string }> {
    const deviceCode = randomBytes(32).toString('hex');
    for (let i = 0; i < 4; i++) {
        const userCode = newUserCode();
        try {
            await sql`select cord_cli_login_start(${sha256(deviceCode)}, ${userCode}, ${cleanHost(host)})`;
            return { deviceCode, userCode };
        } catch (e) {
            // Un user code repetido choca con el índice único: se genera otro.
            if (!/unique|duplicate/i.test(String((e as Error)?.message))) throw e;
        }
    }
    throw new Error('No se pudo generar el código.');
}

export async function findLogin(userCode: string): Promise<{ host: string; estado: string; vigente: boolean } | null> {
    const [row] = await sql`select host, estado, expira_at from cord_cli_login_find(${userCode})`;
    if (!row) return null;
    return { host: String(row.host || 'terminal'), estado: String(row.estado), vigente: new Date(row.expira_at).getTime() > Date.now() };
}

async function callKeys(handler: APIRoute, original: Request, method: string, body: unknown) {
    const headers = new Headers({ 'content-type': 'application/json' });
    for (const h of ['x-real-ip', 'x-vercel-forwarded-for', 'x-forwarded-for', 'user-agent']) {
        const v = original.headers.get(h); if (v) headers.set(h, v);
    }
    const res = await handler({ request: new Request(new URL('/api/keys', original.url), { method, headers, body: JSON.stringify(body) }) } as Parameters<APIRoute>[0]);
    return { ok: res.ok, data: await res.json().catch(() => ({})) as any };
}

/**
 * Aprueba o rechaza desde la sesión. La llave se crea con el mismo manejador que
 * Ajustes (permiso, límite del plan, bitácora); si el código ya no estaba
 * pendiente, la llave recién creada se revoca para no dejarla huérfana.
 */
export async function decideLogin(userCode: string, aprobar: boolean, ctx: { orgId: string; userId: string; host: string; request: Request }):
    Promise<{ ok: true } | { ok: false; status: number; error: string }> {
    if (!aprobar) {
        const [r] = await sql`select cord_cli_login_decide(${userCode}, false, null, ${ctx.userId}, null, null) as ok`;
        return r?.ok ? { ok: true } : { ok: false, status: 409, error: 'Ese código ya no está pendiente.' };
    }
    const key = await callKeys(createKey, ctx.request, 'POST', {
        nombre: `CLI · ${ctx.host}`.slice(0, 60), type: 'restricted', mode: 'test',
        permissions: CLI_KEY_PERMISSIONS, expires_in_days: CLI_KEY_DAYS,
    });
    if (!key.ok || !key.data?.secret) return { ok: false, status: 400, error: String(key.data?.error || 'No se pudo crear la llave del CLI.') };
    const [r] = await sql`select cord_cli_login_decide(${userCode}, true, ${ctx.orgId}, ${ctx.userId}, ${key.data.id}, ${encryptRequiredSecret(String(key.data.secret))}) as ok`;
    if (!r?.ok) {
        await callKeys(revokeKey, ctx.request, 'DELETE', { id: key.data.id });
        return { ok: false, status: 409, error: 'El código venció o ya se usó. Vuelve a correr cord login.' };
    }
    return { ok: true };
}

export async function claimLogin(deviceCode: string): Promise<{ estado: string; apiKey?: string }> {
    if (!/^[a-f0-9]{64}$/.test(deviceCode)) return { estado: 'invalido' };
    const [row] = await sql`select estado, secret_enc from cord_cli_login_claim(${sha256(deviceCode)})`;
    if (!row) return { estado: 'invalido' };
    if (row.estado === 'aprobado') {
        const apiKey = decryptSecret(row.secret_enc as string);
        return apiKey ? { estado: 'aprobado', apiKey } : { estado: 'invalido' };
    }
    return { estado: String(row.estado) };
}

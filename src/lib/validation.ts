// src/lib/validation.ts — esquemas zod + parseo seguro de body para las rutas
// de auth/cuenta. Antes de esto, la validación de `/api/auth/**` era ad-hoc
// (`!email || !password`) — sin tope de longitud, sin formato de email, sin
// normalización consistente (el registro no bajaba a minúsculas mientras el
// reset y los callbacks de OAuth sí, produciendo cuentas duplicadas).
import { z, type ZodType } from 'zod';

export const emailSchema = z.string().trim().toLowerCase().min(3).max(254).email();
// Tope de 256 al ENTRAR (antes de tocar el KDF) — una contraseña de varios MB
// entrando directo a Argon2id/scrypt es un DoS trivial de CPU.
export const passwordSchema = z.string().min(8).max(256);
const nameSchema = z.string().trim().min(1).max(80).optional().nullable();

export const registerSchema = z.object({
    email: emailSchema,
    password: passwordSchema,
    firstName: nameSchema,
    lastName: nameSchema,
});

export const loginSchema = z
    .object({
        identifier: z.string().trim().max(254).optional(),
        email: z.string().trim().max(254).optional(),
        // Password de login: no se re-valida el formato (no queremos revelar la
        // política vigente a quien está adivinando), solo un tope de longitud.
        password: z.string().min(1).max(256),
    })
    .refine((d) => !!(d.identifier || d.email), { message: 'missing_email' });

export const resetRequestSchema = z.object({ email: emailSchema });

export const resetConfirmSchema = z.object({
    token: z.string().trim().min(10).max(512),
    password: passwordSchema,
});

export const twoFactorVerifySchema = z
    .object({
        code: z.string().trim().max(64).optional(),
        backupCode: z.string().trim().max(64).optional(),
    })
    .refine((d) => !!(d.code || d.backupCode), { message: 'missing_code' });

export const profileUpdateSchema = z.object({
    firstName: nameSchema,
    lastName: nameSchema,
});

export const passwordChangeSchema = z.object({
    currentPassword: z.string().min(1).max(256),
    newPassword: passwordSchema,
});

export const emailVerifyConfirmSchema = z.object({
    token: z.string().trim().min(10).max(512),
});

export const inviteJoinSchema = z.object({
    token: z.string().trim().min(1).max(256),
});

export type ParsedBody<T> = { ok: true; data: T } | { ok: false; error: string; status: number };

/**
 * Lee y valida el body JSON de un request contra un esquema zod, con tope de
 * tamaño ANTES de intentar parsear (protege contra bodies gigantes atascando
 * el JSON.parse o, peor, alimentando un campo directo a un KDF).
 */
export async function parseJsonBody<T>(request: Request, schema: ZodType<T>, maxBytes = 10_000): Promise<ParsedBody<T>> {
    const len = request.headers.get('content-length');
    if (len && Number(len) > maxBytes) {
        return { ok: false, error: 'payload_too_large', status: 413 };
    }
    let raw: string;
    try {
        raw = await request.text();
    } catch {
        return { ok: false, error: 'invalid_body', status: 400 };
    }
    if (raw.length > maxBytes) {
        return { ok: false, error: 'payload_too_large', status: 413 };
    }
    let json: unknown;
    try {
        json = raw ? JSON.parse(raw) : {};
    } catch {
        return { ok: false, error: 'invalid_json', status: 400 };
    }
    const parsed = schema.safeParse(json);
    if (!parsed.success) {
        return { ok: false, error: 'validation_error', status: 400 };
    }
    return { ok: true, data: parsed.data };
}

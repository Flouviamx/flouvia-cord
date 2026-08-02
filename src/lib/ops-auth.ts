// src/lib/ops-auth.ts — valida la cookie de sesión del panel interno /ops.
// El token crudo vive en la cookie; solo su sha256 se guarda en
// `ops_sessions` (ver api/ops/auth.ts para el porqué de este cambio).
import { sql } from './db';
import { sha256Hex } from './auth';

export async function validateOpsSession(token: string | undefined | null): Promise<boolean> {
    if (!token) return false;
    try {
        const rows = await sql`select 1 from ops_sessions where id = ${sha256Hex(token)} and expires_at > now() limit 1`;
        return rows.length > 0;
    } catch {
        return false;
    }
}

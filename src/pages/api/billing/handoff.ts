// GET /api/billing/handoff — puerta de entrada a billing.cordhq.app.
//
// Vive en el APEX, donde sí existe `cord_session`. Emite un token de un solo uso
// y manda al host de facturación, que lo canjea por una sesión propia.
//
// Por qué no basta con enlazar directo: la cookie de sesión es host-only, así que
// una visita a billing.cordhq.app llega sin identidad. Ampliar la cookie a
// `.cordhq.app` la resolvería en una línea y de paso la mandaría a ops., docs. y
// dev. — el aislamiento de Ops es deliberado y no se sacrifica por comodidad.
export const prerender = false;

import type { APIRoute } from 'astro';
import { randomBytes } from 'node:crypto';
import { sql, getActiveOrgId } from '../../../lib/db';
import { sha256Hex } from '../../../lib/auth';
import { currentUserId } from '../../../lib/context';

/** 90 s. Solo tiene que sobrevivir un redirect, no una sesión de trabajo. */
const TTL_MS = 90_000;

export const GET: APIRoute = async ({ redirect }) => {
    const userId = currentUserId();
    // El middleware ya exige sesión en /api/*; esto es el cierre por si cambiara.
    if (!userId) return redirect('/sign-in?redirect_url=%2Fapi%2Fbilling%2Fhandoff');

    const orgId = await getActiveOrgId().catch(() => null);
    const token = randomBytes(32).toString('hex');

    await sql`
        insert into billing_handoff_tokens (id, user_id, org_id, expires_at)
        values (${sha256Hex(token)}, ${userId}, ${orgId}, ${new Date(Date.now() + TTL_MS)})`;

    // Barrido oportunista: sin esto la tabla solo crece. No hace falta un cron
    // para filas de 90 segundos.
    await sql`delete from billing_handoff_tokens where expires_at < now() - interval '1 day'`;

    const base = import.meta.env.PROD ? 'https://billing.cordhq.app' : '';
    return redirect(`${base}/billing/entrar?t=${token}`, 302);
};

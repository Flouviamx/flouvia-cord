// POST /api/sso/breakglass { password?, code? } — desactiva "Exigir SSO"
// por 1 hora (ej. el IdP está caído y el equipo necesita entrar). Solo el
// owner, con re-autenticación real (mismo patrón que DELETE /api/org) — el
// botón no puede ser "clic y listo" para una acción que abre password login
// de vuelta a toda la org.
export const prerender = false;

import type { APIRoute } from 'astro';
import { z } from 'zod';
import { sql, getActiveOrgId, logAudit, reqIp } from '../../../lib/db';
import { currentUserId } from '../../../lib/context';
import { reauthenticate } from '../../../lib/auth';
import { parseJsonBody } from '../../../lib/validation';
import { rateLimit, tooMany } from '../../../lib/ratelimit';

const schema = z.object({
    password: z.string().max(256).optional(),
    code: z.string().trim().max(64).optional(),
});

export const POST: APIRoute = async ({ request }) => {
    const userId = currentUserId();
    if (!userId) return json({ error: 'No autenticado' }, 401);

    const rl = await rateLimit(`sso-breakglass:${userId}`, 5, 300);
    if (!rl.ok) return tooMany(rl.retryAfter);

    const orgId = await getActiveOrgId();
    const [org] = await sql`select owner_id, require_sso from orgs where id = ${orgId} limit 1`;
    if (!org) return json({ error: 'No encontrada' }, 404);
    if (org.owner_id !== userId) return json({ error: 'Solo el dueño puede desactivar el requisito de SSO temporalmente' }, 403);
    if (!org.require_sso) return json({ error: 'Exigir SSO no está activo' }, 400);

    const parsed = await parseJsonBody(request, schema);
    if (!parsed.ok) return json({ error: parsed.error }, parsed.status);
    const confirmed = await reauthenticate(userId, { password: parsed.data.password, code: parsed.data.code });
    if (!confirmed) return json({ error: 'confirmation_required' }, 401);

    const until = new Date(Date.now() + 60 * 60 * 1000);
    await sql`update orgs set sso_breakglass_until = ${until} where id = ${orgId}`;
    await logAudit(orgId, {
        accion: 'sso.breakglass',
        entidad: 'org',
        entidad_id: orgId,
        detalle: `SSO desactivado temporalmente hasta ${until.toISOString()}`,
        ip: reqIp(request),
        actor: userId,
    });

    return json({ ok: true, until: until.toISOString() });
};

function json(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

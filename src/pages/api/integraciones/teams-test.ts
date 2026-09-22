// /api/integraciones/teams-test — manda una tarjeta de prueba al Teams conectado.
// Sesión + permiso 'ajustes'. Usa el canal elegido con Microsoft o el flujo de Power Automate.
//   POST → { ok } | { error }
export const prerender = false;

import type { APIRoute } from 'astro';
import { getActiveOrgId } from '../../../lib/db';
import { requirePerm } from '../../../lib/queries';
import { quoteCard } from '../../../lib/teams';
import { deliverTeams } from '../../../lib/integraciones/teams-graph';
import { strictRateLimit, strictLimitResponse } from '../../../lib/ratelimit';
import { currentLocale } from '../../../lib/context';
import { t } from '../../../i18n/app';

export const POST: APIRoute = async () => {
    const denied = await requirePerm('ajustes');
    if (denied) return denied;

    const L = currentLocale();
    const orgId = await getActiveOrgId();
    const limitado = strictLimitResponse(await strictRateLimit(`teams-test:${orgId}`, 10, 60));
    if (limitado) return limitado;

    const r = await deliverTeams(orgId, quoteCard('ping', {
        folio: t(L, 'slack.test.folio'), cliente: t(L, 'slack.test.cliente'),
        total: 12500, link: null, lang: L,
    }));
    if (r.ok) return json({ ok: true });
    if (r.reason === 'sin_conexion') return json({ error: t(L, 'teams.test.sin_webhook') }, 400);
    if (r.reason === 'reconectar') return json({ error: t(L, 'teams.test.reconectar') }, 400);
    return json({ error: t(L, 'teams.test.rechazo') }, 400);
};

function json(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

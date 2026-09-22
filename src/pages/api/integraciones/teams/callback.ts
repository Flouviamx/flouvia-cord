// /api/integraciones/teams/callback — vuelta de "Conectar con Microsoft".
// Canjea el código, guarda el acceso cifrado y regresa a la tarjeta para elegir el canal.
export const prerender = false;

import type { APIRoute } from 'astro';
import { getActiveOrgId, logAudit, reqIp } from '../../../../lib/db';
import { requirePerm } from '../../../../lib/queries';
import { currentUserId } from '../../../../lib/context';
import { consumeOAuthState } from '../../../../lib/integraciones/conexiones';
import { exchangeTeamsCode, graphUser, saveTeamsGraph } from '../../../../lib/integraciones/teams-graph';
import { siteOrigin } from '../../../../lib/email';

const VUELTA = '/app/ajustes/integraciones/teams';

export const GET: APIRoute = async ({ request, url, redirect }) => {
    const denied = await requirePerm('ajustes'); if (denied) return denied;
    const orgId = await getActiveOrgId();
    const userId = currentUserId();

    const state = url.searchParams.get('state');
    if (!userId || !state || !(await consumeOAuthState(orgId, userId, 'teams', state))) {
        return redirect(`${VUELTA}?teams=estado`);
    }
    const code = url.searchParams.get('code');
    if (!code || url.searchParams.get('error')) return redirect(`${VUELTA}?teams=cancelada`);

    const tokens = await exchangeTeamsCode(code.slice(0, 4000), `${siteOrigin()}/api/integraciones/teams/callback`);
    if (!tokens) return redirect(`${VUELTA}?teams=error`);

    const usuario = await graphUser(tokens.accessToken);
    await saveTeamsGraph(orgId, tokens, usuario);
    await logAudit(orgId, {
        accion: 'integracion.teams_conectada', entidad: 'org', entidad_id: orgId,
        detalle: `Cuenta ${usuario ?? 'sin nombre'}`, ip: reqIp(request),
    });
    return redirect(`${VUELTA}?teams=conectado`);
};

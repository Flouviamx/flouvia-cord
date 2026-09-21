// /api/integraciones/slack/callback — vuelta de "Añadir a Slack".
// Canjea el código, guarda el webhook del canal elegido y regresa a la tarjeta.
export const prerender = false;

import type { APIRoute } from 'astro';
import { getActiveOrgId, logAudit, reqIp } from '../../../../lib/db';
import { requirePerm } from '../../../../lib/queries';
import { currentUserId } from '../../../../lib/context';
import { consumeOAuthState } from '../../../../lib/integraciones/conexiones';
import { exchangeSlackCode, saveSlackInstall } from '../../../../lib/integraciones/slack-oauth';
import { siteOrigin } from '../../../../lib/email';

const VUELTA = '/app/ajustes/integraciones/slack';

export const GET: APIRoute = async ({ request, url, redirect }) => {
    const denied = await requirePerm('ajustes'); if (denied) return denied;
    const orgId = await getActiveOrgId();
    const userId = currentUserId();

    const state = url.searchParams.get('state');
    if (!userId || !state || !(await consumeOAuthState(orgId, userId, 'slack', state))) {
        return redirect(`${VUELTA}?slack=estado`);
    }
    const code = url.searchParams.get('code');
    if (!code || url.searchParams.get('error')) return redirect(`${VUELTA}?slack=cancelada`);

    const install = await exchangeSlackCode(code.slice(0, 500), `${siteOrigin()}/api/integraciones/slack/callback`);
    if (!install) return redirect(`${VUELTA}?slack=error`);

    await saveSlackInstall(orgId, install);
    await logAudit(orgId, {
        accion: 'integracion.slack_conectada', entidad: 'org', entidad_id: orgId,
        detalle: `Canal ${install.channel ?? 'sin nombre'}`, ip: reqIp(request),
    });
    return redirect(`${VUELTA}?slack=conectado`);
};

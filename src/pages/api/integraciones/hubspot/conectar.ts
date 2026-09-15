// /api/integraciones/hubspot/conectar — inicia OAuth con HubSpot para la organización activa.
export const prerender = false;

import type { APIRoute } from 'astro';
import { requirePerm } from '../../../../lib/queries';
import { strictRateLimit } from '../../../../lib/ratelimit';
import { sessionContext } from '../../../../lib/actions/http';
import { startHubSpotConnect } from '../../../../lib/integraciones/hubspot/service';

const back = (motivo: string) => `/app/ajustes/integraciones?hubspot=${motivo}`;

export const GET: APIRoute = async ({ request, redirect }) => {
    const denied = await requirePerm('ajustes');
    if (denied) return redirect(back('permiso'));
    const ctx = await sessionContext(request);
    const rl = await strictRateLimit(`hubspot-connect:${ctx.orgId}`, 10, 600);
    if (!rl.ok) return redirect(back('error'));
    const result = await startHubSpotConnect(ctx);
    if ('redirect' in result) return redirect(result.redirect);
    return redirect(back(result.status === 503 ? 'no_disponible' : 'error'));
};

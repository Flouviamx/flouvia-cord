// /api/integraciones/hubspot/callback — HubSpot regresa aquí con el código de autorización.
export const prerender = false;

import type { APIRoute } from 'astro';
import { requirePerm } from '../../../../lib/queries';
import { sessionContext } from '../../../../lib/actions/http';
import { finishHubSpotConnect } from '../../../../lib/integraciones/hubspot/service';

export const GET: APIRoute = async ({ request, url, redirect }) => {
    const denied = await requirePerm('ajustes');
    if (denied) return redirect('/app/ajustes/integraciones?hubspot=permiso');
    const ctx = await sessionContext(request);
    const motivo = await finishHubSpotConnect(ctx, {
        code: url.searchParams.get('code'),
        state: url.searchParams.get('state'),
        error: url.searchParams.get('error'),
    });
    return redirect(`/app/ajustes/integraciones?hubspot=${motivo}`);
};

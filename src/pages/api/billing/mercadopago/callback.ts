// /api/billing/mercadopago/callback — vuelta del alta de Mercado Pago.
// Canjea el código por las credenciales del vendedor y regresa a Ajustes.
export const prerender = false;

import type { APIRoute } from 'astro';
import { getActiveOrgId, logAudit, reqIp } from '../../../../lib/db';
import { requirePerm } from '../../../../lib/queries';
import { currentUserId } from '../../../../lib/context';
import { consumeOAuthState } from '../../../../lib/integraciones/conexiones';
import { exchangeMpCode, saveMpAccount } from '../../../../lib/mercadopago';
import { siteOrigin } from '../../../../lib/email';

const VUELTA = '/app/ajustes/cobros';

export const GET: APIRoute = async ({ request, url, redirect }) => {
    const denied = await requirePerm('ajustes'); if (denied) return denied;
    const orgId = await getActiveOrgId();
    const userId = currentUserId();

    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    // El state es de un solo uso y está atado a la persona: sin él no se canjea
    // nada, aunque el código sea válido.
    if (!userId || !state || !(await consumeOAuthState(orgId, userId, 'mercadopago', state))) {
        return redirect(`${VUELTA}?mp=estado`);
    }
    if (!code) return redirect(`${VUELTA}?mp=cancelada`);

    const tokens = await exchangeMpCode(code.slice(0, 500), `${siteOrigin()}/api/billing/mercadopago/callback`);
    if (!tokens) return redirect(`${VUELTA}?mp=error`);

    await saveMpAccount(orgId, tokens);
    await logAudit(orgId, {
        accion: 'cord_pagos.mercadopago_conectado', entidad: 'org', entidad_id: orgId,
        detalle: `Cuenta ${tokens.user_id}`, ip: reqIp(request),
    });
    return redirect(`${VUELTA}?mp=conectada`);
};

// /api/integraciones/gmail/callback — regreso de Google al conectar el envío.
export const prerender = false;

import type { APIRoute } from 'astro';
import { getActiveOrgId, logAudit, reqIp } from '../../../../lib/db';
import { requirePerm } from '../../../../lib/queries';
import { currentUserId } from '../../../../lib/context';
import { log } from '../../../../lib/log';
import { consumeOAuthState } from '../../../../lib/integraciones/conexiones';
import { googleExchange } from '../../../../lib/integraciones/hojas/google';
import { conectarGmail, GMAIL_ENVIO_LISTO, GMAIL_SEND_SCOPE } from '../../../../lib/integraciones/gmail/envio';
import { siteOrigin } from '../../../../lib/email';
import { REDIRECT_PATH } from './conectar';

const VUELTA = '/app/ajustes/integraciones/gmail';

export const GET: APIRoute = async ({ request, url, redirect }) => {
    const denied = await requirePerm('ajustes'); if (denied) return denied;
    const orgId = await getActiveOrgId();
    const userId = currentUserId();
    if (!GMAIL_ENVIO_LISTO) return redirect(`${VUELTA}?gmail=error`);

    const code = url.searchParams.get('code') ?? '';
    if (!code || url.searchParams.get('error')) return redirect(`${VUELTA}?gmail=cancelada`);
    const state = url.searchParams.get('state') ?? '';
    if (!userId || !state || !(await consumeOAuthState(orgId, userId, 'gmail', state))) {
        return redirect(`${VUELTA}?gmail=estado`);
    }

    try {
        const tokens = await googleExchange(code.slice(0, 2000), `${siteOrigin()}${REDIRECT_PATH}`);
        // Google deja desmarcar permisos uno por uno: sin el de enviar, una
        // conexión "activa" fallaría en el primer correo.
        if (!tokens.scopes.includes(GMAIL_SEND_SCOPE)) return redirect(`${VUELTA}?gmail=permiso`);
        if (!tokens.cuenta) return redirect(`${VUELTA}?gmail=cuenta`);
        await conectarGmail(orgId, userId, tokens, tokens.cuenta);
        await logAudit(orgId, {
            accion: 'integracion.gmail_conectado', entidad: 'org', entidad_id: orgId,
            detalle: `Conectó el envío desde Gmail (${tokens.cuenta})`, ip: reqIp(request),
        });
        return redirect(`${VUELTA}?gmail=conectado`);
    } catch (err) {
        log.error('no se pudo conectar Gmail', { route: 'gmail-callback', orgId, err, detalle: (err as { detalle?: string })?.detalle });
        return redirect(`${VUELTA}?gmail=error`);
    }
};

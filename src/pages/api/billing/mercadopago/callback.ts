// /api/billing/mercadopago/callback — vuelta del alta de Mercado Pago.
// Canjea el código por las credenciales del vendedor y regresa a Ajustes.
//
// Es el momento en que cambia A DÓNDE llega el dinero del negocio, así que:
//   - exige el mismo permiso que el alta (`cobros_config`); la reautenticación
//     la hereda del `state`, que solo se emite después de ella y es de un solo
//     uso, atado a la persona y a la organización;
//   - verifica que la cuenta sea del país del negocio (su sitio decide en qué
//     divisa puede cobrar) — una cuenta de otro país dejaría cada cobro
//     fallando del otro lado (regla 28);
//   - deja a la vista QUÉ cuenta quedó conectada, audita el antes y el después,
//     y avisa a los dueños por correo si la cuenta es nueva o distinta.
export const prerender = false;

import type { APIRoute } from 'astro';
import { getActiveOrgId, logAudit, reqIp, sql, withOrgTx } from '../../../../lib/db';
import { requirePerm } from '../../../../lib/queries';
import { currentUserId } from '../../../../lib/context';
import { consumeOAuthState } from '../../../../lib/integraciones/conexiones';
import { exchangeMpCode, fetchMpCuenta, MP_SITE_COUNTRY, saveMpAccount } from '../../../../lib/mercadopago';
import { siteOrigin } from '../../../../lib/email';
import { notifyMoneyDestinationChange } from '../../../../lib/auth-email';
import { after } from '../../../../lib/after';

const VUELTA = '/app/ajustes/cobros';

export const GET: APIRoute = async ({ request, url, redirect }) => {
    const denied = await requirePerm('cobros_config'); if (denied) return denied;
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
    if (!tokens?.access_token || !tokens?.refresh_token || tokens.user_id === undefined || tokens.user_id === null) {
        return redirect(`${VUELTA}?mp=error`);
    }
    const cuenta = await fetchMpCuenta(tokens.access_token);
    if (!cuenta) return redirect(`${VUELTA}?mp=error`);

    const [[antes]] = await withOrgTx(orgId, sql`
        select mp_user_id, mp_nickname, upper(coalesce(country_code, 'MX')) as pais from orgs where id = ${orgId}`);
    const paisCuenta = cuenta.siteId ? MP_SITE_COUNTRY[cuenta.siteId] : undefined;
    if (!paisCuenta || paisCuenta !== String(antes?.pais ?? '')) {
        await logAudit(orgId, {
            accion: 'cord_pagos.mercadopago_rechazado', entidad: 'org', entidad_id: orgId,
            detalle: `Cuenta ${tokens.user_id} del sitio ${cuenta.siteId ?? 'desconocido'}; el negocio es de ${antes?.pais ?? '?'}`,
            ip: reqIp(request),
        });
        return redirect(`${VUELTA}?mp=pais`);
    }

    await saveMpAccount(orgId, tokens, cuenta);
    const nueva = String(tokens.user_id);
    const detalle = `Cuenta ${nueva}${cuenta.nickname ? ` (${cuenta.nickname})` : ''}, ${cuenta.siteId}`;
    const cambio = !antes?.mp_user_id ? 'mp_conectado' : String(antes.mp_user_id) !== nueva ? 'mp_cambiado' : null;
    await logAudit(orgId, {
        accion: cambio === 'mp_cambiado' ? 'cord_pagos.mercadopago_cambiado' : 'cord_pagos.mercadopago_conectado',
        entidad: 'org', entidad_id: orgId,
        detalle: cambio === 'mp_cambiado'
            ? `${detalle}; antes cuenta ${antes.mp_user_id}${antes.mp_nickname ? ` (${antes.mp_nickname})` : ''}`
            : detalle,
        ip: reqIp(request),
    });
    if (cambio) after(notifyMoneyDestinationChange(orgId, cambio, { detalle, actorUserId: userId, ip: reqIp(request) }));
    return redirect(`${VUELTA}?mp=conectada`);
};

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
//     y avisa a los dueños por correo si la cuenta es nueva o distinta;
//   - una cuenta nueva o distinta no cobra durante 72 horas si el negocio ya
//     mueve dinero (src/lib/money-hold.ts, regla 38): el dinero de Mercado Pago
//     no pasa por Cord, así que la espera es no abrir cobros en ella.
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
import {
    cancelarCambio, horasDeEspera, programarCambio, registrarFalla, urlRevertir, type CambioProgramado,
} from '../../../../lib/money-hold';

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

    const nueva = String(tokens.user_id);
    const detalle = `Cuenta ${nueva}${cuenta.nickname ? ` (${cuenta.nickname})` : ''}, ${cuenta.siteId}`;
    const cambio = !antes?.mp_user_id ? 'mp_conectado' : String(antes.mp_user_id) !== nueva ? 'mp_cambiado' : null;

    // La espera se registra ANTES de guardar las credenciales: no hay un
    // instante en que la cuenta nueva esté conectada y sin espera.
    let programado: CambioProgramado | null = null;
    let horas = 0;
    if (cambio) {
        try {
            horas = await horasDeEspera(orgId, { tipo: 'mercadopago', primerDestino: !antes?.mp_user_id, actorUserId: userId });
            programado = await programarCambio(orgId, {
                tipo: 'mercadopago', horas, actorUserId: userId,
                antes: { mp_user_id: antes?.mp_user_id ?? null, nickname: antes?.mp_nickname ?? null },
                despues: { mp_user_id: nueva, nickname: cuenta.nickname ?? null, site_id: cuenta.siteId ?? null },
            });
        } catch (err) {
            registrarFalla(orgId, err, 'mercadopago');
            return redirect(`${VUELTA}?mp=error`);
        }
    }
    // Reconectar la MISMA cuenta no es un cambio: si seguía en espera, sigue igual.
    try {
        await saveMpAccount(orgId, tokens, cuenta);
    } catch (err) {
        registrarFalla(orgId, err, 'mercadopago_guardar');
        if (programado) await cancelarCambio(orgId, programado.id).catch(() => {});
        return redirect(`${VUELTA}?mp=error`);
    }
    await logAudit(orgId, {
        accion: cambio === 'mp_cambiado' ? 'cord_pagos.mercadopago_cambiado' : 'cord_pagos.mercadopago_conectado',
        entidad: 'org', entidad_id: orgId,
        detalle: cambio === 'mp_cambiado'
            ? `${detalle}; antes cuenta ${antes.mp_user_id}${antes.mp_nickname ? ` (${antes.mp_nickname})` : ''}`
            : detalle,
        ip: reqIp(request),
    });
    if (cambio) {
        after(notifyMoneyDestinationChange(orgId, cambio, {
            detalle, actorUserId: userId, ip: reqIp(request),
            efectivoDesde: horas > 0 && programado ? programado.efectivoDesde : null,
            revertirUrl: programado ? urlRevertir(programado.revertirToken) : null,
        }));
    }
    return redirect(`${VUELTA}?mp=${horas > 0 ? 'espera' : 'conectada'}`);
};

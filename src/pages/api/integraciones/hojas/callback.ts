// /api/integraciones/hojas/callback — regreso de Google o de Microsoft.
//
// Los dos proveedores vuelven a la MISMA dirección, así que el proveedor viaja
// dentro del state (`<proveedor>.<state>`) y no en un parámetro suelto: el state
// es lo único de esta vuelta que Cord emitió y puede verificar.
export const prerender = false;

import type { APIRoute } from 'astro';
import { getActiveOrgId, logAudit, reqIp } from '../../../../lib/db';
import { requirePerm } from '../../../../lib/queries';
import { currentUserId } from '../../../../lib/context';
import { after } from '../../../../lib/after';
import { log } from '../../../../lib/log';
import { consumeOAuthState } from '../../../../lib/integraciones/conexiones';
import { credencialesHoja, esProveedorHoja } from '../../../../lib/integraciones/hojas/config';
import { googleExchange } from '../../../../lib/integraciones/hojas/google';
import { excelCuenta, excelExchange } from '../../../../lib/integraciones/hojas/excel';
import { conectarHoja, sincronizarTodo } from '../../../../lib/integraciones/hojas/service';
import { siteOrigin } from '../../../../lib/email';
import { REDIRECT_PATH } from './conectar';

const VUELTA = '/app/ajustes/integraciones';

export const GET: APIRoute = async ({ request, url, redirect }) => {
    const denied = await requirePerm('ajustes'); if (denied) return denied;
    const orgId = await getActiveOrgId();
    const userId = currentUserId();

    const crudo = url.searchParams.get('state') ?? '';
    const corte = crudo.indexOf('.');
    const proveedor = corte > 0 ? crudo.slice(0, corte) : '';
    const state = corte > 0 ? crudo.slice(corte + 1) : '';
    if (!esProveedorHoja(proveedor)) return redirect(`${VUELTA}?hoja=estado`);
    if (!credencialesHoja(proveedor)) return redirect(`${VUELTA}?hoja=error`);

    // Cancelar en la pantalla del proveedor es una respuesta legítima, no un fallo.
    const code = url.searchParams.get('code') ?? '';
    if (!code || url.searchParams.get('error')) return redirect(`${VUELTA}?hoja=cancelada`);

    if (!userId || !state || !(await consumeOAuthState(orgId, userId, proveedor, state))) {
        return redirect(`${VUELTA}?hoja=estado`);
    }

    try {
        const redirectUri = `${siteOrigin()}${REDIRECT_PATH}`;
        const tokens = proveedor === 'google_sheets'
            ? await googleExchange(code.slice(0, 2000), redirectUri)
            : await excelExchange(code.slice(0, 2000), redirectUri);

        const cuenta = tokens.cuenta ?? (proveedor === 'excel' ? await excelCuenta(tokens.accessToken) : null);
        // La cuenta identifica al dueño del archivo y la columna no admite vacío:
        // sin correo no se guarda una conexión a medias.
        if (!cuenta) return redirect(`${VUELTA}?hoja=cuenta`);

        await conectarHoja(orgId, userId, proveedor, tokens, cuenta);
        await logAudit(orgId, {
            accion: 'integracion.hoja_conectada', entidad: 'org', entidad_id: orgId,
            detalle: `Conectó ${proveedor === 'google_sheets' ? 'Google Sheets' : 'Excel'} (${cuenta})`,
            ip: reqIp(request),
        });
        // El relleno inicial puede tardar: no se hace esperar a la persona frente
        // a una pestaña en blanco del proveedor.
        after(sincronizarTodo(orgId).catch((err) => {
            log.error('no se pudo rellenar la hoja', { route: 'hojas-callback', orgId, err });
        }));
        return redirect(`${VUELTA}?hoja=conectada`);
    } catch (err) {
        log.error('no se pudo conectar la hoja', { route: 'hojas-callback', orgId, proveedor, err });
        return redirect(`${VUELTA}?hoja=error`);
    }
};

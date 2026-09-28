// /api/integraciones/contabilidad/callback — regreso de QuickBooks o de Xero.
//
// Los dos vuelven al mismo lugar, así que el proveedor viaja dentro del state,
// que es lo único de esta vuelta que Cord emitió y puede verificar. La empresa
// llega distinta en cada uno: QuickBooks la manda como `realmId` en la URL y
// Xero obliga a preguntar por las conexiones después del token.
export const prerender = false;

import type { APIRoute } from 'astro';
import { getActiveOrgId, logAudit, reqIp } from '../../../../lib/db';
import { requirePerm } from '../../../../lib/queries';
import { currentUserId } from '../../../../lib/context';
import { log } from '../../../../lib/log';
import { consumeOAuthState } from '../../../../lib/integraciones/conexiones';
import {
    credencialesConta, esProveedorConta, QBO_SCOPES, REDIRECT_CONTA, XERO_SCOPES,
} from '../../../../lib/integraciones/contabilidad/config';
import { qboExchange } from '../../../../lib/integraciones/contabilidad/qbo';
import { xeroExchange, xeroTenant } from '../../../../lib/integraciones/contabilidad/xero';
import { conectarConta } from '../../../../lib/integraciones/contabilidad/service';
import { siteOrigin } from '../../../../lib/email';

const LISTA = '/app/ajustes/integraciones';
/** El aviso lo dibuja la tarjeta de cada app, no la lista (ver hojas/callback). */
const VUELTA_DE = (p: string) => `${LISTA}/${p}`;

export const GET: APIRoute = async ({ request, url, redirect }) => {
    const denied = await requirePerm('ajustes'); if (denied) return denied;
    const orgId = await getActiveOrgId();
    const userId = currentUserId();

    const crudo = url.searchParams.get('state') ?? '';
    const corte = crudo.indexOf('.');
    const proveedor = corte > 0 ? crudo.slice(0, corte) : '';
    const state = corte > 0 ? crudo.slice(corte + 1) : '';
    if (!esProveedorConta(proveedor)) return redirect(`${LISTA}?conta=estado`);
    const VUELTA = VUELTA_DE(proveedor);
    if (!credencialesConta(proveedor)) return redirect(`${VUELTA}?conta=error`);

    const code = url.searchParams.get('code') ?? '';
    if (!code || url.searchParams.get('error')) return redirect(`${VUELTA}?conta=cancelada`);
    if (!userId || !state || !(await consumeOAuthState(orgId, userId, proveedor, state))) {
        return redirect(`${VUELTA}?conta=estado`);
    }

    try {
        const redirectUri = `${siteOrigin()}${REDIRECT_CONTA}`;
        if (proveedor === 'quickbooks') {
            const realmId = (url.searchParams.get('realmId') ?? '').trim();
            // Sin empresa no hay a qué libro escribir, y la columna no admite vacío.
            if (!/^[0-9]{1,20}$/.test(realmId)) return redirect(`${VUELTA}?conta=empresa`);
            const tokens = await qboExchange(code.slice(0, 2000), redirectUri);
            await conectarConta(orgId, userId, proveedor, tokens, realmId, null, QBO_SCOPES.split(' '));
        } else {
            const tokens = await xeroExchange(code.slice(0, 2000), redirectUri);
            const tenant = await xeroTenant(tokens.accessToken);
            if (!tenant) return redirect(`${VUELTA}?conta=empresa`);
            await conectarConta(orgId, userId, proveedor, tokens, tenant.id, tenant.nombre || null, XERO_SCOPES.split(' '));
        }

        await logAudit(orgId, {
            accion: 'integracion.contabilidad_conectada', entidad: 'org', entidad_id: orgId,
            detalle: `Conectó ${proveedor === 'quickbooks' ? 'QuickBooks' : 'Xero'}`, ip: reqIp(request),
        });
        return redirect(`${VUELTA}?conta=conectada`);
    } catch (err) {
        log.error('no se pudo conectar la contabilidad', { route: 'conta-callback', orgId, proveedor, err });
        return redirect(`${VUELTA}?conta=error`);
    }
};

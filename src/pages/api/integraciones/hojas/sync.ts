// /api/integraciones/hojas/sync — "Actualizar la hoja ahora".
//   POST → { cotizaciones, facturas }
export const prerender = false;

import type { APIRoute } from 'astro';
import { getActiveOrgId } from '../../../../lib/db';
import { requirePerm } from '../../../../lib/queries';
import { currentLocale } from '../../../../lib/context';
import { strictRateLimit, strictLimitResponse } from '../../../../lib/ratelimit';
import { log } from '../../../../lib/log';
import { HojaError } from '../../../../lib/integraciones/hojas/cliente';
import { sincronizarTodo } from '../../../../lib/integraciones/hojas/service';
import { t } from '../../../../i18n/app';

export const POST: APIRoute = async () => {
    const denied = await requirePerm('ajustes'); if (denied) return denied;
    const L = currentLocale();
    const orgId = await getActiveOrgId();
    // El relleno recorre hasta 500 documentos y escribe uno por uno contra el
    // proveedor: es caro para Cord y para la cuota de la persona.
    const limitado = strictLimitResponse(await strictRateLimit(`hojas-sync:${orgId}`, 3, 300));
    if (limitado) return limitado;

    try {
        const r = await sincronizarTodo(orgId);
        return json(r);
    } catch (err) {
        const motivo = err instanceof HojaError ? err.motivo : 'proveedor';
        log.error('no se pudo actualizar la hoja', { route: 'hojas-sync', orgId, motivo });
        // El texto del proveedor no sale nunca (regla 14): se traduce a un estado.
        const clave = motivo === 'auth' || motivo === 'permiso' ? 'hojas.err.reconectar' : 'hojas.err.sync';
        return json({ error: t(L, clave as any) }, motivo === 'auth' ? 401 : 502);
    }
};

function json(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

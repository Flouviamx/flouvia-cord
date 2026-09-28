// /api/integraciones/contabilidad/sync — manda a la contabilidad las facturas
// definitivas que todavía no están allá.
//   POST { proveedor } → { facturas }
export const prerender = false;

import type { APIRoute } from 'astro';
import { getActiveOrgId } from '../../../../lib/db';
import { requirePerm } from '../../../../lib/queries';
import { currentLocale } from '../../../../lib/context';
import { strictRateLimit, strictLimitResponse } from '../../../../lib/ratelimit';
import { log } from '../../../../lib/log';
import { ProveedorError } from '../../../../lib/integraciones/proveedor-http';
import { esProveedorConta } from '../../../../lib/integraciones/contabilidad/config';
import { contabilizarPendientes } from '../../../../lib/integraciones/contabilidad/service';
import { t } from '../../../../i18n/app';

export const POST: APIRoute = async ({ request }) => {
    const denied = await requirePerm('ajustes'); if (denied) return denied;
    const L = currentLocale();
    const orgId = await getActiveOrgId();
    // Cada factura son varias llamadas al proveedor: esto es caro y toca los
    // libros de alguien, así que el límite es estrecho a propósito.
    const limitado = strictLimitResponse(await strictRateLimit(`conta-sync:${orgId}`, 3, 300));
    if (limitado) return limitado;

    let body: any;
    try { body = await request.json(); } catch { body = {}; }
    if (!esProveedorConta(body?.proveedor)) return json({ error: t(L, 'conta.err.proveedor') }, 400);

    try {
        return json(await contabilizarPendientes(orgId, body.proveedor));
    } catch (err) {
        const motivo = err instanceof ProveedorError ? err.motivo : 'proveedor';
        log.error('no se pudieron enviar las facturas', {
            route: 'conta-sync', orgId, motivo,
            detalle: err instanceof ProveedorError ? err.detalle : undefined,
        });
        const clave = motivo === 'auth' || motivo === 'permiso' ? 'conta.err.reconectar' : 'conta.err.envio';
        return json({ error: t(L, clave as any) }, motivo === 'auth' ? 401 : 502);
    }
};

function json(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

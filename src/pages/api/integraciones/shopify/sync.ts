// /api/integraciones/shopify/sync — "Sincronizar ahora".
//   POST → { productos, clientes } | { error }
export const prerender = false;

import type { APIRoute } from 'astro';
import { getActiveOrgId } from '../../../../lib/db';
import { requirePerm } from '../../../../lib/queries';
import { currentLocale } from '../../../../lib/context';
import { strictRateLimit, strictLimitResponse } from '../../../../lib/ratelimit';
import { syncShopify } from '../../../../lib/integraciones/shopify/service';
import { t } from '../../../../i18n/app';

export const POST: APIRoute = async () => {
    const denied = await requirePerm('ajustes'); if (denied) return denied;
    const L = currentLocale();
    const orgId = await getActiveOrgId();
    // Un barrido completo pega decenas de veces a Shopify: 3 por hora basta
    // para cualquier uso legítimo y evita gastar la cuota de la tienda.
    const limitado = strictLimitResponse(await strictRateLimit(`shopify-sync:${orgId}`, 3, 3600));
    if (limitado) return limitado;

    const r = await syncShopify(orgId);
    if (!r.ok) {
        const clave = r.motivo === 'sin_conexion' || r.motivo === 'auth' ? 'shopify.err.sin_conexion' : 'shopify.err.sync';
        return json({ error: t(L, clave) }, r.motivo === 'shopify' ? 502 : 409);
    }
    return json({ productos: r.productos, clientes: r.clientes });
};

function json(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

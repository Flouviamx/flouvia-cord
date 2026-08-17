// GET /api/cotizaciones/[id]/presence — ¿el cliente tiene el link abierto AHORA?
// Fallback del SSE de /stream (navegadores sin EventSource o conexión bloqueada).
//
// online = hay una fila de visitante con rol 'client' vista hace menos de 30s.
// Antes esto leía cotizaciones.viewer_last_seen, una sola columna sin actor: el
// vendedor abriendo su propio link encendía su propio badge "viendo ahora".
// convCount = total de mensajes de la conversación (comentarios del cliente +
// contraofertas + respuestas) → el detalle detecta mensajes nuevos sin recargar.
export const prerender = false;

import type { APIRoute } from 'astro';
import { sql, getActiveOrgId, withOrgTx } from '../../../../lib/db';
import { requireEntitlement } from '../../../../lib/org-entitlements';
import { presenciaQuery, toPresencia } from '../../../../lib/atencion';

export const GET: APIRoute = async ({ params }) => {
    const orgId = await getActiveOrgId();
    const subscriptionDenied = await requireEntitlement(orgId, 'live_presence');
    if (subscriptionDenied) return subscriptionDenied;
    const id = params.id ?? '';
    const [r] = await sql`select id from cotizaciones where id = ${id} and org_id = ${orgId}`;
    if (!r) return json({ online: false, convCount: 0, seccion: null, escribiendo: false });

    // Conversación = eventos de tipo comment/counter/reply + comentarios por línea.
    const [presRows, ev, cm] = await withOrgTx(orgId,
        presenciaQuery(id, orgId),
        sql`select count(*)::int as n from eventos
             where cotizacion_id = ${id} and org_id = ${orgId}
               and tipo in ('comment','counter','reply')`,
        sql`select count(*)::int as n from cotizacion_comentarios
             where cotizacion_id = ${id} and org_id = ${orgId}`,
    );

    const presencia = toPresencia(presRows);
    const convCount = (Number(ev[0]?.n) || 0) + (Number(cm[0]?.n) || 0);

    return json({
        online: presencia.clientes > 0,
        convCount,
        seccion: presencia.seccionCliente,
        escribiendo: presencia.clienteEscribiendo,
    });
};

function json(data: unknown) {
    return new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } });
}

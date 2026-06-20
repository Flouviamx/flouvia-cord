// GET /api/cotizaciones/[id]/presence — ¿el cliente tiene el link abierto AHORA?
// online = viewer_last_seen (heartbeat del /q) fue hace menos de 30s.
// convCount = total de mensajes de la conversación (comentarios del cliente +
// contraofertas + respuestas) → el detalle detecta mensajes nuevos sin recargar.
export const prerender = false;

import type { APIRoute } from 'astro';
import { sql, getActiveOrgId } from '../../../../lib/db';

export const GET: APIRoute = async ({ params }) => {
    const orgId = await getActiveOrgId();
    const id = params.id ?? '';
    const [r] = await sql`select viewer_last_seen from cotizaciones where id = ${id} and org_id = ${orgId}`;
    if (!r) return new Response(JSON.stringify({ online: false, convCount: 0 }), { headers: { 'Content-Type': 'application/json' } });

    const seen = r?.viewer_last_seen ? new Date(r.viewer_last_seen as string).getTime() : 0;
    const online = seen > 0 && (Date.now() - seen) < 30000;

    // Conversación = eventos de tipo comment/counter/reply + comentarios por línea.
    const [ev] = await sql`select count(*)::int as n from eventos where cotizacion_id = ${id} and org_id = ${orgId} and tipo in ('comment','counter','reply')`;
    const [cm] = await sql`select count(*)::int as n from cotizacion_comentarios where cotizacion_id = ${id} and org_id = ${orgId}`;
    const convCount = (Number(ev?.n) || 0) + (Number(cm?.n) || 0);

    return new Response(JSON.stringify({ online, convCount }), { headers: { 'Content-Type': 'application/json' } });
};

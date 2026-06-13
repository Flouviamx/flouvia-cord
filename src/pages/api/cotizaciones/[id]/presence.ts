// GET /api/cotizaciones/[id]/presence — ¿el cliente tiene el link abierto AHORA?
// online = viewer_last_seen (heartbeat del /q) fue hace menos de 30s.
export const prerender = false;

import type { APIRoute } from 'astro';
import { sql, getActiveOrgId } from '../../../../lib/db';

export const GET: APIRoute = async ({ params }) => {
    const orgId = await getActiveOrgId();
    const [r] = await sql`select viewer_last_seen from cotizaciones where id = ${params.id ?? ''} and org_id = ${orgId}`;
    const seen = r?.viewer_last_seen ? new Date(r.viewer_last_seen as string).getTime() : 0;
    const online = seen > 0 && (Date.now() - seen) < 30000;
    return new Response(JSON.stringify({ online }), { headers: { 'Content-Type': 'application/json' } });
};

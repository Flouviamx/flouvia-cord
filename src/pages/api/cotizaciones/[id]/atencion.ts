// GET /api/cotizaciones/[id]/atencion — qué leyó realmente el cliente.
//
// Devuelve el resumen de atención: personas distintas, aperturas, primera y
// última vez, y segundos por sección. Alimenta el bloque "Atención del cliente"
// del detalle, que se refresca sin recargar mientras el cliente está dentro.
//
// Gating (estándar 17): la autorización vive AQUÍ, no en si la UI pinta o no el
// bloque. Un plan sin la feature recibe la respuesta de requireEntitlement,
// aunque llame al endpoint directo.
export const prerender = false;

import type { APIRoute } from 'astro';
import { sql, getActiveOrgId } from '../../../../lib/db';
import { requireEntitlement } from '../../../../lib/org-entitlements';
import { getAtencion } from '../../../../lib/atencion';

export const GET: APIRoute = async ({ params }) => {
    const orgId = await getActiveOrgId();
    const subscriptionDenied = await requireEntitlement(orgId, 'quote_attention');
    if (subscriptionDenied) return subscriptionDenied;

    const id = params.id ?? '';
    const [row] = await sql`select id from cotizaciones where id = ${id} and org_id = ${orgId}`;
    if (!row) return new Response('not found', { status: 404 });

    const atencion = await getAtencion(orgId, id);
    return new Response(JSON.stringify(atencion), {
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
};

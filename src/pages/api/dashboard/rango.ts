// /api/dashboard/rango — GET ?desde=YYYY-MM-DD&hasta=YYYY-MM-DD
// Recalcula embudo y rankings del dashboard para un rango de fechas personalizado
// (el picker de /app). Interna: hereda el gate de sesión del middleware, igual que el
// resto de /api/*. Solo lectura — ver getAnalyticsRango() en src/lib/queries.ts para
// por qué esto NO reutiliza getAnalytics (que alimenta Informes y un tool MCP).
export const prerender = false;

import type { APIRoute } from 'astro';
import { getAnalyticsRango } from '../../../lib/queries';
import { isISODate, spanDays } from '../../../lib/rango';

export const GET: APIRoute = async ({ url }) => {
    const desde = url.searchParams.get('desde') ?? '';
    const hasta = url.searchParams.get('hasta') ?? '';
    if (!isISODate(desde) || !isISODate(hasta) || desde > hasta || spanDays(desde, hasta) > 366) {
        return json({ error: 'Rango de fechas inválido' }, 400);
    }
    const data = await getAnalyticsRango(desde, hasta);
    return json(data);
};

function json(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

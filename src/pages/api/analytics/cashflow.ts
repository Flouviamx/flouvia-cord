import type { APIRoute } from 'astro';
import { getCashFlowPrediction } from '../../../lib/analytics/cashflow';
import { currentUserId } from '../../../lib/context';
import { getActiveOrgId } from '../../../lib/db';

export const prerender = false;

export const GET: APIRoute = async () => {
  try {
    // `context.locals.auth()` era Clerk — nunca se definió un `locals.auth`
    // propio, así que esta ruta lanzaba TypeError en TODO request (500
    // garantizado). El resto de la app resuelve la sesión/org vía
    // AsyncLocalStorage (context.ts), no vía `Astro.locals`.
    if (!currentUserId()) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    }
    const orgId = await getActiveOrgId();

    const data = await getCashFlowPrediction(orgId);

    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error fetching cashflow prediction:', error);
    return new Response(JSON.stringify({ error: 'Internal Server Error' }), { status: 500 });
  }
};

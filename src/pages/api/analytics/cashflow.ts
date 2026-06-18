import type { APIRoute } from 'astro';
import { getCashFlowPrediction } from '../../../lib/analytics/cashflow';

export const GET: APIRoute = async (context) => {
  try {
    const auth = context.locals.auth();
    const orgId = auth?.orgId || auth?.sessionClaims?.org_id as string;
    
    if (!orgId) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    }

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

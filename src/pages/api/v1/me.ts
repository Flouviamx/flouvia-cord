// /api/v1/me — endpoint "whoami" de la API PÚBLICA. Sirve para verificar que una
// API key es válida y ver a qué negocio pertenece. Es el más simple de todos:
// ejercita el carril completo (Bearer → authApiKey → org en contexto → query).
//
//   curl https://trato.flouvia.com/api/v1/me -H "Authorization: Bearer sk_live_..."
//   → { org: { id, nombre, plan }, scope }
export const prerender = false;

import { withApiAuth } from '../../../lib/apikey';
import { getOrg } from '../../../lib/queries';

export const GET = withApiAuth('read', async (_ctx, auth) => {
    const org = await getOrg(); // resuelve la org desde el contexto (la de la key)
    return new Response(
        JSON.stringify({
            org: { id: org.id, nombre: org.nombre, plan: org.plan_raw },
            scope: auth.scope,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
});

// /api/v1/me — endpoint "whoami" de la API PÚBLICA. Sirve para verificar que una
// API key es válida y ver a qué negocio pertenece. Es el más simple de todos:
// ejercita el carril completo (Bearer → authApiKey → org en contexto → query).
//
//   curl https://cordhq.app/api/v1/me -H "Authorization: Bearer sk_live_..."
//   → { data: { org: { id, nombre, plan }, scope, mode } }
export const prerender = false;

import { withApiAuth } from '../../../lib/apikey';
import { getOrg } from '../../../lib/queries';
import { ok } from '../../../lib/apiv1';

export const GET = withApiAuth('read', async (_ctx, auth) => {
    const org = await getOrg(); // resuelve la org desde el contexto (la de la key)
    // `ok()` para consistencia con el resto de /api/v1/* — antes este era el
    // único endpoint sin sobre `{ data }`, lo que rompía el unwrap genérico
    // del SDK (CordAPI.fetch) si alguna vez se agregaba `.me` ahí.
    return ok({
        org: { id: org.id, nombre: org.nombre, plan: org.plan_raw },
        scope: auth.scope,
        mode: auth.mode,
    });
});

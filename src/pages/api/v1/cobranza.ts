// /api/v1/cobranza — API PÚBLICA de cuentas por cobrar (cartera, aging, vencidos).
//   GET → { data: { resumen, aging, items, clientes } }   (scope: read)
// Pensado para el motor que dispara recordatorios desde un sistema externo / IA.
export const prerender = false;

import { withApiAuth } from '../../../lib/apikey';
import { getCobranza } from '../../../lib/queries';
import { ok } from '../../../lib/apiv1';
import { requireEntitlement } from '../../../lib/org-entitlements';

export const GET = withApiAuth('read', async (_ctx, auth) => {
    const subscriptionDenied = await requireEntitlement(auth.orgId, 'collections');
    if (subscriptionDenied) return subscriptionDenied;
    const cob = await getCobranza();
    // Quitamos el public_token de cada cuenta (es secreto del link público).
    const items = cob.items.map(({ token, ...rest }) => rest);
    return ok({ resumen: cob.resumen, aging: cob.aging, items, clientes: cob.clientes });
});

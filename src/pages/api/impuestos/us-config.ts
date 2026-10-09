// /api/impuestos/us-config — sales tax de EE. UU. por dirección (Ajustes › Impuestos).
//   PUT { auto, origen: { line1, line2?, city, state, postal_code }, tax_code, estados: ['CA', …] }
//     → { ok, auto, problema } | { error, code, campo? }
//
// Guarda el domicilio del negocio, qué vende y los estados donde recauda, y los
// sincroniza con su cuenta de cobros (src/lib/us-tax/config.ts). La preferencia
// solo queda encendida si todo está listo; si no, responde qué falta. Nunca
// devuelve un mensaje del proveedor (regla 14).
//
// Cuatro garantías (regla 33, aunque no mueve dinero: crea registros en la
// cuenta del negocio): carril de la organización (las queries viven en
// us-tax/config.ts, en withOrgTx), rate limit estricto, Idempotency-Key
// determinística en cada alta (us-tax/stripe.ts) y sin mensajes crudos.
export const prerender = false;

import type { APIRoute } from 'astro';
import { getActiveOrgId, logAudit, reqIp } from '../../../lib/db';
import { requirePerm } from '../../../lib/queries';
import { limitConnectMutation } from '../../../lib/connect-security';
import { saveUsTaxConfig } from '../../../lib/us-tax/config';

export const PUT: APIRoute = async ({ request }) => {
    const denied = await requirePerm('ajustes'); if (denied) return denied;
    const orgId = await getActiveOrgId();
    const limited = await limitConnectMutation(request, 'us-tax-config', orgId, 10);
    if (limited) return limited;
    let body: any;
    try { body = await request.json(); } catch { return json({ error: 'JSON inválido' }, 400); }

    const result = await saveUsTaxConfig(orgId, {
        auto: body?.auto === true,
        origen: body?.origen,
        taxCode: body?.tax_code,
        estados: body?.estados,
    });
    if (!result.ok) return json({ error: result.error, code: result.code, ...(result.campo ? { campo: result.campo } : {}) }, result.status);

    await logAudit(orgId, {
        accion: 'impuestos.us_tax_config', entidad: 'org', entidad_id: orgId,
        detalle: `Sales tax por dirección ${result.auto ? 'encendido' : 'apagado'}; estados: ${result.config.registros.map((r) => r.estado).join(', ') || 'ninguno'}`,
        ip: reqIp(request),
    });
    return json({ ok: true, auto: result.auto, problema: result.problema });
};

function json(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
}

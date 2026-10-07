// /api/sso/domains/[id]/verify — verificación REAL por DNS TXT (reemplaza el
// wizard cosmético que generaba el código en el navegador y nunca lo mandaba
// a ningún lado). Rate-limitado: es una llamada que dispara una resolución
// DNS real, y no queremos que un botón se convierta en un generador de
// consultas hacia servidores DNS de terceros.
//   POST → { ok, error? }
export const prerender = false;

import type { APIRoute } from 'astro';
import { getActiveOrgId, logAudit, reqIp } from '../../../../../lib/db';
import { requireOwner } from '../../../../../lib/queries';
import { requireFreshAuth } from '../../../../../lib/step-up';
import { notifyMoneyDestinationChange } from '../../../../../lib/auth-email';
import { after } from '../../../../../lib/after';
import { currentUserId } from '../../../../../lib/context';
import { rateLimit, tooMany } from '../../../../../lib/ratelimit';
import { verifyDomainOwnership } from '../../../../../lib/saml';

export const POST: APIRoute = async ({ request, params }) => {
    const denied = await requireOwner(); if (denied) return denied;
    // SSO decide quién entra como quién y con qué permisos: solo el dueño, con
    // reautenticación reciente, y los dueños se enteran (regla 38).
    const staleAuth = await requireFreshAuth(); if (staleAuth) return staleAuth;
    const domainId = params.id;
    if (!domainId) return json({ error: 'Falta id' }, 400);

    const orgId = await getActiveOrgId();
    const rl = await rateLimit(`sso-verify:${orgId}`, 10, 60);
    if (!rl.ok) return tooMany(rl.retryAfter);

    const result = await verifyDomainOwnership(orgId, domainId);
    if (result.ok) {
        await logAudit(orgId, { accion: 'sso.dominio_verificado', entidad: 'sso_domain', entidad_id: domainId, ip: reqIp(request) });
        after(notifyMoneyDestinationChange(orgId, 'sso', { detalle: 'Dominio verificado', actorUserId: currentUserId(), ip: reqIp(request) }));
    }
    return json(result);
};

function json(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

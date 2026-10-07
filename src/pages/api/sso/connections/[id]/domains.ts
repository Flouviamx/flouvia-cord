// /api/sso/connections/[id]/domains — dominios que una conexión reclama.
//   POST { domain }     → { domain: SsoDomain }  (mintea verify_token)
//   DELETE { domainId }  → { ok }
export const prerender = false;

import type { APIRoute } from 'astro';
import { getActiveOrgId, logAudit, reqIp } from '../../../../../lib/db';
import { requireOwner } from '../../../../../lib/queries';
import { requireFreshAuth } from '../../../../../lib/step-up';
import { notifyMoneyDestinationChange } from '../../../../../lib/auth-email';
import { after } from '../../../../../lib/after';
import { currentUserId } from '../../../../../lib/context';
import { addDomain, removeDomain, getConnectionForOrg, SamlValidationError } from '../../../../../lib/saml';

export const POST: APIRoute = async ({ request, params }) => {
    const denied = await requireOwner(); if (denied) return denied;
    // SSO decide quién entra como quién y con qué permisos: solo el dueño, con
    // reautenticación reciente, y los dueños se enteran (regla 38).
    const staleAuth = await requireFreshAuth(); if (staleAuth) return staleAuth;
    const connectionId = params.id;
    if (!connectionId) return json({ error: 'Falta id' }, 400);

    let body: any;
    try { body = await request.json(); } catch { return json({ error: 'JSON inválido' }, 400); }
    const domainRaw = String(body.domain ?? '');
    if (!domainRaw) return json({ error: 'Falta domain' }, 400);

    const orgId = await getActiveOrgId();
    const connection = await getConnectionForOrg(orgId, connectionId);
    if (!connection) return json({ error: 'Conexión no encontrada' }, 404);

    try {
        const domain = await addDomain(orgId, connectionId, domainRaw);
        await logAudit(orgId, { accion: 'sso.dominio_agregado', entidad: 'sso_domain', entidad_id: domain.id, detalle: domain.domain, ip: reqIp(request) });
        after(notifyMoneyDestinationChange(orgId, 'sso', { detalle: `Dominio agregado: ${domain.domain}`, actorUserId: currentUserId(), ip: reqIp(request) }));
        return json({ domain });
    } catch (e) {
        if (e instanceof SamlValidationError) {
            const msg = e.message === 'dominio_ya_reclamado'
                ? 'Este dominio ya está verificado bajo otra cuenta de Cord.'
                : 'El dominio no es válido.';
            return json({ error: msg }, 400);
        }
        throw e;
    }
};

export const DELETE: APIRoute = async ({ request, params }) => {
    const denied = await requireOwner(); if (denied) return denied;
    // SSO decide quién entra como quién y con qué permisos: solo el dueño, con
    // reautenticación reciente, y los dueños se enteran (regla 38).
    const staleAuth = await requireFreshAuth(); if (staleAuth) return staleAuth;
    const connectionId = params.id;
    if (!connectionId) return json({ error: 'Falta id' }, 400);

    let body: any;
    try { body = await request.json(); } catch { return json({ error: 'JSON inválido' }, 400); }
    const domainId = String(body.domainId ?? '');
    if (!domainId) return json({ error: 'Falta domainId' }, 400);

    const orgId = await getActiveOrgId();
    const ok = await removeDomain(orgId, domainId);
    if (!ok) return json({ error: 'Dominio no encontrado' }, 404);
    await logAudit(orgId, { accion: 'sso.dominio_eliminado', entidad: 'sso_domain', entidad_id: domainId, ip: reqIp(request) });
    after(notifyMoneyDestinationChange(orgId, 'sso', { detalle: 'Dominio eliminado', actorUserId: currentUserId(), ip: reqIp(request) }));
    return json({ ok: true });
};

function json(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

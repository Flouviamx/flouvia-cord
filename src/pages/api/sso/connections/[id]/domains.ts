// /api/sso/connections/[id]/domains — dominios que una conexión reclama.
//   POST { domain }     → { domain: SsoDomain }  (mintea verify_token)
//   DELETE { domainId }  → { ok }
export const prerender = false;

import type { APIRoute } from 'astro';
import { getActiveOrgId, logAudit, reqIp } from '../../../../../lib/db';
import { requirePerm } from '../../../../../lib/queries';
import { addDomain, removeDomain, getConnectionForOrg, SamlValidationError } from '../../../../../lib/saml';

export const POST: APIRoute = async ({ request, params }) => {
    const denied = await requirePerm('equipo'); if (denied) return denied;
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
    const denied = await requirePerm('equipo'); if (denied) return denied;
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
    return json({ ok: true });
};

function json(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

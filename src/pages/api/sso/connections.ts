// /api/sso/connections — conexiones SSO (SAML 2.0) de la org, Ajustes › SSO.
//   GET  → lista las conexiones (sin certificados/tokens en claro innecesarios)
//   POST { nombre, idp_entity_id, idp_sso_url, idp_certs[], ... }
//        o { metadata_xml }  → parsea entityId/ssoUrl/certs del XML pegado
//       → { connection }
// Gateado por permiso 'equipo' (mismo grupo que Equipo/Seguridad en
// settings.ts) + plan Scale/Developer (planTieneSso) — SOLO para mutaciones;
// el camino de auth real (login/acs) nunca depende del plan en este momento.
export const prerender = false;

import type { APIRoute } from 'astro';
import { getActiveOrgId, logAudit, reqIp } from '../../../lib/db';
import { requirePerm } from '../../../lib/queries';
import { currentUserId } from '../../../lib/context';
import { requireEntitlement } from '../../../lib/org-entitlements';
import { createConnection, listConnections, parseIdpMetadata, SamlValidationError, type ConnectionInput } from '../../../lib/saml';

export const GET: APIRoute = async () => {
    const denied = await requirePerm('equipo'); if (denied) return denied;
    const orgId = await getActiveOrgId();
    const connections = await listConnections(orgId);
    return json({ connections });
};

export const POST: APIRoute = async ({ request }) => {
    const denied = await requirePerm('equipo'); if (denied) return denied;
    let body: any;
    try { body = await request.json(); } catch { return json({ error: 'JSON inválido' }, 400); }

    const orgId = await getActiveOrgId();
    const entitlementDenied = await requireEntitlement(orgId, 'sso');
    if (entitlementDenied) return entitlementDenied;

    let input: ConnectionInput;
    try {
        if (typeof body.metadata_xml === 'string' && body.metadata_xml.trim()) {
            const meta = parseIdpMetadata(body.metadata_xml);
            input = {
                nombre: String(body.nombre ?? '').trim() || meta.entityId,
                idpEntityId: meta.entityId,
                idpSsoUrl: meta.ssoUrl,
                idpSloUrl: meta.sloUrl,
                idpCerts: meta.certs,
            };
        } else {
            input = {
                nombre: String(body.nombre ?? ''),
                idpEntityId: String(body.idp_entity_id ?? ''),
                idpSsoUrl: String(body.idp_sso_url ?? ''),
                idpSloUrl: body.idp_slo_url ? String(body.idp_slo_url) : null,
                idpCerts: Array.isArray(body.idp_certs) ? body.idp_certs.map(String) : [],
                nameidFormat: body.nameid_format ? String(body.nameid_format) : undefined,
                wantAssertionSigned: typeof body.want_assertion_signed === 'boolean' ? body.want_assertion_signed : undefined,
                wantResponseSigned: typeof body.want_response_signed === 'boolean' ? body.want_response_signed : undefined,
                signAuthnRequest: typeof body.sign_authn_request === 'boolean' ? body.sign_authn_request : undefined,
                clockSkewMs: body.clock_skew_ms !== undefined ? Number(body.clock_skew_ms) : undefined,
                allowIdpInitiated: typeof body.allow_idp_initiated === 'boolean' ? body.allow_idp_initiated : undefined,
                jitProvisioning: typeof body.jit_provisioning === 'boolean' ? body.jit_provisioning : undefined,
                attrMap: body.attr_map && typeof body.attr_map === 'object' ? body.attr_map : undefined,
                roleMappings: Array.isArray(body.role_mappings) ? body.role_mappings : undefined,
                defaultPreset: body.default_preset ? String(body.default_preset) : undefined,
            };
        }
        const connection = await createConnection(orgId, input, currentUserId());
        await logAudit(orgId, { accion: 'sso.conexion_creada', entidad: 'sso_connection', entidad_id: connection.id, detalle: connection.nombre, ip: reqIp(request) });
        return json({ connection });
    } catch (e) {
        if (e instanceof SamlValidationError) return json({ error: e.message }, 400);
        throw e;
    }
};

function json(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

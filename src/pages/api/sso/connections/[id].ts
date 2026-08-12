// /api/sso/connections/[id] — editar/eliminar una conexión SSO puntual.
//   PATCH { ...campos parciales, enabled? } → { connection }
//   DELETE → { ok }
export const prerender = false;

import type { APIRoute } from 'astro';
import { getActiveOrgId, logAudit, reqIp, withOrgTx, sql } from '../../../../lib/db';
import { requirePerm } from '../../../../lib/queries';
import { planTieneSso, planUpsell, minPlanOf, SSO_PLANS } from '../../../../lib/permissions';
import { updateConnection, deleteConnection, SamlValidationError, type ConnectionPatch } from '../../../../lib/saml';

export const PATCH: APIRoute = async ({ request, params }) => {
    const denied = await requirePerm('equipo'); if (denied) return denied;
    const id = params.id;
    if (!id) return json({ error: 'Falta id' }, 400);

    let body: any;
    try { body = await request.json(); } catch { return json({ error: 'JSON inválido' }, 400); }

    const orgId = await getActiveOrgId();
    const [[planRow]] = await withOrgTx(orgId, sql`select coalesce(plan,'free') as plan from orgs where id = ${orgId}`);
    const plan = (planRow?.plan as string) ?? 'free';
    if (!planTieneSso(plan)) {
        return json({ error: planUpsell(plan, 'SSO empresarial', SSO_PLANS), plan_required: minPlanOf(SSO_PLANS) }, 402);
    }

    const patch: ConnectionPatch = {};
    if (typeof body.nombre === 'string') patch.nombre = body.nombre;
    if (typeof body.idp_entity_id === 'string') patch.idpEntityId = body.idp_entity_id;
    if (typeof body.idp_sso_url === 'string') patch.idpSsoUrl = body.idp_sso_url;
    if (body.idp_slo_url !== undefined) patch.idpSloUrl = body.idp_slo_url ? String(body.idp_slo_url) : null;
    if (Array.isArray(body.idp_certs)) patch.idpCerts = body.idp_certs.map(String);
    if (typeof body.nameid_format === 'string') patch.nameidFormat = body.nameid_format;
    if (typeof body.want_assertion_signed === 'boolean') patch.wantAssertionSigned = body.want_assertion_signed;
    if (typeof body.want_response_signed === 'boolean') patch.wantResponseSigned = body.want_response_signed;
    if (typeof body.sign_authn_request === 'boolean') patch.signAuthnRequest = body.sign_authn_request;
    if (body.clock_skew_ms !== undefined) patch.clockSkewMs = Number(body.clock_skew_ms);
    if (typeof body.allow_idp_initiated === 'boolean') patch.allowIdpInitiated = body.allow_idp_initiated;
    if (typeof body.jit_provisioning === 'boolean') patch.jitProvisioning = body.jit_provisioning;
    if (body.attr_map && typeof body.attr_map === 'object') patch.attrMap = body.attr_map;
    if (Array.isArray(body.role_mappings)) patch.roleMappings = body.role_mappings;
    if (typeof body.default_preset === 'string') patch.defaultPreset = body.default_preset;
    if (typeof body.enabled === 'boolean') patch.enabled = body.enabled;

    try {
        const connection = await updateConnection(orgId, id, patch);
        if (!connection) return json({ error: 'Conexión no encontrada' }, 404);
        await logAudit(orgId, { accion: 'sso.conexion_actualizada', entidad: 'sso_connection', entidad_id: id, detalle: Object.keys(patch).join(', '), ip: reqIp(request) });
        return json({ connection });
    } catch (e) {
        if (e instanceof SamlValidationError) return json({ error: e.message }, 400);
        throw e;
    }
};

export const DELETE: APIRoute = async ({ request, params }) => {
    const denied = await requirePerm('equipo'); if (denied) return denied;
    const id = params.id;
    if (!id) return json({ error: 'Falta id' }, 400);

    const orgId = await getActiveOrgId();
    const ok = await deleteConnection(orgId, id);
    if (!ok) return json({ error: 'Conexión no encontrada' }, 404);
    await logAudit(orgId, { accion: 'sso.conexion_eliminada', entidad: 'sso_connection', entidad_id: id, ip: reqIp(request) });
    return json({ ok: true });
};

function json(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

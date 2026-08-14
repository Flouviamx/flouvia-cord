// /api/agentes — gobernanza de agentes de IA y servidores MCP de la org.
//   GET                                    → { servers, aiCobranza }
//   POST { action: 'add', nombre, url_sse, auth_token }
//   POST { action: 'delete', id }
//   POST { action: 'toggle_activo', id, value }
//   POST { action: 'toggle_permiso', id, value }
//   POST { action: 'cobranza', value }      → activa/desactiva cobranza autónoma
// La EJECUCIÓN del agente vive en /api/cobranza-ia/run (motor único compartido
// con el cron). Antes había aquí un `run_cobranza` que era un clon divergente.
// Requiere permiso 'ajustes'.
export const prerender = false;

import type { APIRoute } from 'astro';
import { sql, getActiveOrgId, logAudit, reqIp, withOrgTx } from '../../lib/db';
import { requirePerm } from '../../lib/queries';
import { trackServer } from '../../lib/posthog-server';
import {
  listMcpServers, addMcpServer, deleteMcpServer, setServerActivo, setServerPermitido,
} from '../../lib/agents/governance';
import { requireEntitlement } from '../../lib/org-entitlements';

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

export const GET: APIRoute = async () => {
  const denied = await requirePerm('ajustes');
  if (denied) return denied;
  const orgId = await getActiveOrgId();
  const entitlementDenied = await requireEntitlement(orgId, 'agent_governance');
  if (entitlementDenied) return entitlementDenied;
  const [[org]] = await withOrgTx(orgId, sql`select ai_cobranza_activa from orgs where id = ${orgId}`);
  const servers = await listMcpServers(orgId);
  return json({ servers, aiCobranza: !!org?.ai_cobranza_activa });
};

export const POST: APIRoute = async ({ request }) => {
  const denied = await requirePerm('ajustes');
  if (denied) return denied;

  let body: any;
  try { body = await request.json(); } catch { return json({ error: 'JSON inválido' }, 400); }
  const orgId = await getActiveOrgId();
  const ip = reqIp(request);

  const enablesPremium = body.action === 'add'
    || body.action === 'toggle_permiso'
    || (body.action === 'toggle_activo' && Boolean(body.value))
    || (body.action === 'cobranza' && Boolean(body.value));
  if (enablesPremium) {
    const feature = body.action === 'cobranza' ? 'collections_ai' : 'agent_governance';
    const entitlementDenied = await requireEntitlement(orgId, feature);
    if (entitlementDenied) return entitlementDenied;
  }

  switch (body.action) {
    case 'add': {
      const nombre = String(body.nombre ?? '').trim().slice(0, 80);
      const url = String(body.url_sse ?? '').trim();
      const token = body.auth_token ? String(body.auth_token).trim() : null;
      if (!nombre) return json({ error: 'Ponle un nombre al servidor' }, 400);
      if (!/^https?:\/\//.test(url)) return json({ error: 'La URL debe empezar con http(s)://' }, 400);
      const id = await addMcpServer(orgId, nombre, url, token);
      await logAudit(orgId, { accion: 'agente.mcp_server_agregado', entidad: 'mcp_server', entidad_id: id, detalle: nombre, ip });
      return json({ ok: true, id });
    }
    case 'delete': {
      const id = String(body.id ?? '');
      await deleteMcpServer(orgId, id);
      await logAudit(orgId, { accion: 'agente.mcp_server_eliminado', entidad: 'mcp_server', entidad_id: id, detalle: '', ip });
      return json({ ok: true });
    }
    case 'toggle_activo': {
      const id = String(body.id ?? '');
      const value = Boolean(body.value);
      await setServerActivo(orgId, id, value);
      await logAudit(orgId, { accion: 'agente.mcp_server_activo', entidad: 'mcp_server', entidad_id: id, detalle: value ? 'activado' : 'desactivado', ip });
      return json({ ok: true });
    }
    case 'toggle_permiso': {
      await setServerPermitido(orgId, String(body.id ?? ''), Boolean(body.value));
      await logAudit(orgId, { accion: 'agente.permiso_cambiado', entidad: 'mcp_server', entidad_id: String(body.id ?? ''), detalle: body.value ? 'otorgado' : 'revocado', ip });
      return json({ ok: true });
    }
    case 'cobranza': {
      const value = Boolean(body.value);
      await withOrgTx(orgId, sql`update orgs set ai_cobranza_activa = ${value} where id = ${orgId}`);
      await logAudit(orgId, { accion: 'agente.cobranza_autonoma', entidad: 'org', entidad_id: orgId, detalle: value ? 'activada' : 'desactivada', ip });
      if (value) {
        const [[flags]] = await withOrgTx(orgId, sql`select (sandbox_of is not null) as is_sandbox, is_demo from orgs where id = ${orgId}`);
        await trackServer('cobranza_ia_activated', orgId, {}, !!flags?.is_sandbox, !!flags?.is_demo);
      }
      return json({ ok: true });
    }
    default:
      return json({ error: 'Acción no válida' }, 400);
  }
};

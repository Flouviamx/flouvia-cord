// /api/agentes — gobernanza de agentes de IA y servidores MCP de la org.
//   GET                                    → { servers, aiCobranza }
//   POST { action: 'add', nombre, url_sse, auth_token }
//   POST { action: 'delete', id }
//   POST { action: 'toggle_activo', id, value }
//   POST { action: 'toggle_permiso', id, value }
//   POST { action: 'cobranza', value }      → activa/desactiva cobranza autónoma
// Requiere permiso 'ajustes'.
export const prerender = false;

import type { APIRoute } from 'astro';
import { sql, getActiveOrgId, logAudit, reqIp, withOrgTx } from '../../lib/db';
import { requirePerm } from '../../lib/queries';
import { runARAgent } from '../../lib/agents/ar-agent';
import { sendEmail } from '../../lib/email';
import {
  listMcpServers, addMcpServer, deleteMcpServer, setServerActivo, setServerPermitido,
} from '../../lib/agents/governance';

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Ejecuta el agente de cobranza sobre las cotizaciones vencidas de UNA org
// (versión manual del cron, gated por el opt-in ai_cobranza_activa).
async function runCobranzaForOrg(orgId: string): Promise<number> {
  const [[org]] = await withOrgTx(orgId, sql`select ai_cobranza_activa from orgs where id = ${orgId}`);
  if (!org?.ai_cobranza_activa) return 0;

  const [overdue] = await withOrgTx(orgId, sql`
    SELECT c.id as cotizacion_id, c.total as monto_adeudado,
           cl.empresa as cliente_nombre, cl.email as cliente_email,
           DATE_PART('day', NOW() - c.vigencia) as dias_vencido
    FROM cotizaciones c
    JOIN clientes cl ON c.cliente_id = cl.id
    WHERE c.org_id = ${orgId} AND c.status = 'invoiced' AND c.paid_at IS NULL AND c.vigencia < NOW()`);

  let n = 0;
  for (const q of overdue) {
    const [historial] = await withOrgTx(orgId, sql`
      SELECT autor_tipo, mensaje FROM cobranza_conversaciones
      WHERE cotizacion_id = ${q.cotizacion_id} ORDER BY created_at ASC`);
    const mapped = historial.map((h: any) => ({ rol: h.autor_tipo === 'agente_ia' ? 'user' : 'user', contenido: h.mensaje }));
    const msg = await runARAgent({
      cotizacionId: q.cotizacion_id, orgId,
      clienteNombre: q.cliente_nombre, clienteEmail: q.cliente_email,
      montoAdeudado: parseFloat(q.monto_adeudado), diasVencido: Math.floor(q.dias_vencido),
      historialConversacion: mapped as any,
    });
    if (q.cliente_email) {
      await sendEmail({
        to: q.cliente_email,
        subject: `Recordatorio de pago — factura vencida (${Math.floor(q.dias_vencido)} días)`,
        html: `<div style="font-family:system-ui,sans-serif;font-size:15px;line-height:1.6;color:#0a192f;white-space:pre-wrap">${escapeHtml(msg)}</div>`,
      });
    }
    n++;
  }
  return n;
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

export const GET: APIRoute = async () => {
  const denied = await requirePerm('ajustes');
  if (denied) return denied;
  const orgId = await getActiveOrgId();
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
      await setServerActivo(orgId, String(body.id ?? ''), Boolean(body.value));
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
      return json({ ok: true });
    }
    case 'run_cobranza': {
      try {
        const procesadas = await runCobranzaForOrg(orgId);
        await logAudit(orgId, { accion: 'agente.cobranza_ejecutada', entidad: 'org', entidad_id: orgId, detalle: `${procesadas} cotizaciones`, ip });
        return json({ ok: true, procesadas });
      } catch (e: any) {
        return json({ error: e?.message || 'No se pudo ejecutar el agente' }, 500);
      }
    }
    default:
      return json({ error: 'Acción no válida' }, 400);
  }
};

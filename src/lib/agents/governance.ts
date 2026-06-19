// Gobernanza de agentes de IA: cada org tiene un agente por defecto ("Asistente
// Cord") que es el que corre en /api/cotizaciones/ai-draft. Los permisos
// (agentes_permisos) dictan a qué servidores MCP externos puede conectarse.
// Las tablas tienen RLS (enable, sin force) → el rol dueño bypasea, así que
// filtramos por org_id explícito en cada query (mismo patrón que client-manager).

import { sql } from '../db';

const DEFAULT_AGENT_NAME = 'Asistente Cord';

/** Devuelve el id del agente por defecto de la org, creándolo si no existe. */
export async function getDefaultAgentId(orgId: string): Promise<string> {
  const [existing] = await sql`
    select id from agentes_ia
    where org_id = ${orgId} and nombre = ${DEFAULT_AGENT_NAME}
    order by created_at asc limit 1`;
  if (existing?.id) return existing.id as string;

  const [created] = await sql`
    insert into agentes_ia (org_id, nombre, descripcion, activo)
    values (${orgId}, ${DEFAULT_AGENT_NAME}, 'Agente que arma cotizaciones y consulta tus sistemas conectados.', true)
    returning id`;
  return created.id as string;
}

export interface McpServerRow {
  id: string;
  nombre: string;
  url_sse: string;
  auth_token: string | null;
  activo: boolean;
  /** ¿El agente por defecto tiene permiso para usar este servidor? */
  permitido: boolean;
}

/** Lista los servidores MCP de la org + si el agente default tiene permiso. */
export async function listMcpServers(orgId: string): Promise<McpServerRow[]> {
  const agentId = await getDefaultAgentId(orgId);
  const servers = await sql`
    select id, nombre, url_sse, auth_token, activo
    from mcp_servers where org_id = ${orgId} order by created_at asc`;
  const perms = await sql`
    select recurso_id from agentes_permisos
    where org_id = ${orgId} and agente_id = ${agentId} and tipo_recurso = 'outbound'`;
  const allowed = new Set(perms.map((p: any) => p.recurso_id as string));
  return servers.map((s: any) => ({
    id: s.id, nombre: s.nombre, url_sse: s.url_sse,
    // No exponemos el token completo a la UI; solo si existe.
    auth_token: s.auth_token ? '••••••' : null,
    activo: s.activo, permitido: allowed.has(s.id),
  }));
}

export async function addMcpServer(
  orgId: string, nombre: string, urlSse: string, authToken: string | null,
): Promise<string> {
  const [row] = await sql`
    insert into mcp_servers (org_id, nombre, url_sse, auth_token, activo)
    values (${orgId}, ${nombre}, ${urlSse}, ${authToken || null}, true)
    returning id`;
  return row.id as string;
}

export async function deleteMcpServer(orgId: string, id: string): Promise<void> {
  await sql`delete from mcp_servers where id = ${id} and org_id = ${orgId}`;
}

export async function setServerActivo(orgId: string, id: string, activo: boolean): Promise<void> {
  await sql`update mcp_servers set activo = ${activo} where id = ${id} and org_id = ${orgId}`;
}

/** Otorga o revoca el permiso del agente default sobre un servidor MCP. */
export async function setServerPermitido(orgId: string, serverId: string, permitido: boolean): Promise<void> {
  const agentId = await getDefaultAgentId(orgId);
  if (permitido) {
    // Por defecto le damos acceso a TODAS las tools del servidor (["*"]).
    await sql`
      insert into agentes_permisos (org_id, agente_id, tipo_recurso, recurso_id, herramientas)
      values (${orgId}, ${agentId}, 'outbound', ${serverId}, '["*"]'::jsonb)
      on conflict (agente_id, tipo_recurso, recurso_id)
      do update set herramientas = '["*"]'::jsonb`;
  } else {
    await sql`
      delete from agentes_permisos
      where org_id = ${orgId} and agente_id = ${agentId} and tipo_recurso = 'outbound' and recurso_id = ${serverId}`;
  }
}

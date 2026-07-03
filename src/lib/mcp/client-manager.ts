import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { sql } from "../db";
import { assertSafeWebhookTarget } from "../ssrf";

export interface AllowedTool {
  serverName: string;
  toolName: string; // Puede ser "*"
}

export interface McpServerConfig {
  id: string;
  nombre: string;
  url_sse: string;
  auth_token: string | null;
}

// safeToolName → cómo ejecutarla (qué cliente + nombre real en el servidor).
export interface ToolBinding {
  client: Client;
  realName: string;
}

export class McpClientManager {
  private orgId: string;
  private agenteId?: string;
  // Clientes conectados en esta sesión, para cerrarlos al terminar (evita leaks).
  private openClients: Client[] = [];

  constructor(orgId: string, agenteId?: string) {
    this.orgId = orgId;
    this.agenteId = agenteId;
  }

  // Obtiene la lista de servidores MCP registrados por la organización
  private async getServers(): Promise<McpServerConfig[]> {
    const rows = await sql`
      SELECT id, nombre, url_sse, auth_token 
      FROM mcp_servers 
      WHERE org_id = ${this.orgId} AND activo = true
    `;
    return rows as McpServerConfig[];
  }

  // Obtiene los permisos del agente (qué herramientas puede usar)
  private async getAgentPermissions(): Promise<Map<string, string[]>> {
    const permissions = new Map<string, string[]>(); // map server_id -> allowed_tools[]
    
    if (!this.agenteId) {
      // Si no hay agente, por defecto no hay permisos para servidores externos
      // (Podríamos cambiar esta política si un usuario humano invoca la IA directamente)
      return permissions;
    }

    const rows = await sql`
      SELECT recurso_id, herramientas 
      FROM agentes_permisos 
      WHERE org_id = ${this.orgId} AND agente_id = ${this.agenteId} AND tipo_recurso = 'outbound'
    `;

    for (const row of rows) {
      if (row.recurso_id && Array.isArray(row.herramientas)) {
        permissions.set(row.recurso_id as string, row.herramientas as string[]);
      }
    }

    return permissions;
  }

  // Instancia clientes MCP y devuelve las herramientas permitidas en formato Anthropic.
  // toolMap mapea el nombre seguro (prefijado) → cómo ejecutarla (cliente + nombre real).
  async getAnthropicTools(): Promise<{ tools: any[]; toolMap: Map<string, ToolBinding> }> {
    const servers = await this.getServers();
    const permissions = await this.getAgentPermissions();

    const anthropicTools: any[] = [];
    const toolMap = new Map<string, ToolBinding>();

    for (const server of servers) {
      const allowedTools = permissions.get(server.id);

      // Si el agente no tiene este servidor en su allowlist, lo ignoramos.
      if (!allowedTools || allowedTools.length === 0) continue;

      try {
        // Anti-SSRF: la URL del servidor MCP la configura la org. Bloquea destinos
        // internos/metadata (con resolución DNS) ANTES de conectar y de mandarle el
        // auth_token. Si es insegura, lanza y el catch de abajo salta ese servidor.
        await assertSafeWebhookTarget(server.url_sse);
        const url = new URL(server.url_sse);
        // Inyectamos el auth_token del servidor (si existe) tanto en la conexión
        // SSE inicial como en los POST recurrentes, así los servidores con auth
        // (HubSpot, Salesforce…) autentican de verdad.
        const authHeaders: Record<string, string> = server.auth_token
          ? { Authorization: `Bearer ${server.auth_token}` }
          : {};
        const transport = new SSEClientTransport(url, {
          requestInit: { headers: authHeaders },
          eventSourceInit: {
            fetch: (u: any, init: any) =>
              fetch(u, { ...init, headers: { ...(init?.headers || {}), ...authHeaders } }),
          },
        } as any);

        const client = new Client(
          { name: "cord-mcp-client", version: "1.0.0" },
          { capabilities: {} },
        );

        await client.connect(transport);
        this.openClients.push(client);

        const response = await client.listTools();

        for (const tool of response.tools) {
          // Chequear permisos: "*" significa todas las herramientas.
          if (allowedTools.includes("*") || allowedTools.includes(tool.name)) {
            // Prefijo por servidor para evitar colisiones de nombres entre
            // distintos servidores (ej. "hubspot__buscar_contacto"). Doble guión
            // bajo como separador → no se confunde con guiones del nombre real.
            const slug = server.nombre.toLowerCase().replace(/[^a-z0-9]/g, "_");
            const safeToolName = `${slug}__${tool.name}`;

            anthropicTools.push({
              name: safeToolName,
              description: tool.description || `Herramienta de ${server.nombre}`,
              input_schema: tool.inputSchema,
            });

            // Guardamos cliente + nombre REAL (sin el prefijo) para ejecutarla.
            toolMap.set(safeToolName, { client, realName: tool.name });
          }
        }
      } catch (err) {
        console.error(`Error conectando al MCP server ${server.nombre}:`, err);
      }
    }

    return { tools: anthropicTools, toolMap };
  }

  // Cierra todas las conexiones abiertas. Llamar siempre tras usar el agente.
  async disconnectAll(): Promise<void> {
    await Promise.allSettled(this.openClients.map((c) => c.close()));
    this.openClients = [];
  }
}

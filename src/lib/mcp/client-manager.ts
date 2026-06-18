import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { sql } from "../db";

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

export class McpClientManager {
  private orgId: string;
  private agenteId?: string;

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

  // Instancia clientes MCP y devuelve las herramientas permitidas en formato Anthropic
  async getAnthropicTools(): Promise<{ tools: any[], clientMap: Map<string, Client> }> {
    const servers = await this.getServers();
    const permissions = await this.getAgentPermissions();
    
    const anthropicTools: any[] = [];
    const clientMap = new Map<string, Client>();

    for (const server of servers) {
      const allowedTools = permissions.get(server.id);
      
      // Si el agente no tiene este servidor en su allowlist, lo ignoramos
      if (!allowedTools || allowedTools.length === 0) continue;

      try {
        const url = new URL(server.url_sse);
        const transport = new SSEClientTransport(url);
        
        // El SDK aún no soporta fácilmente inyectar headers dinámicos en SSEClientTransport en node,
        // pero podemos intentarlo si extendemos o usamos proxy.
        // Por simplicidad, asumimos que el transporte maneja la URL correctamente.
        
        const client = new Client(
          { name: "cord-mcp-client", version: "1.0.0" },
          { capabilities: {} }
        );

        await client.connect(transport);
        
        const response = await client.listTools();
        
        for (const tool of response.tools) {
          // Chequear permisos: "*" significa todas las herramientas
          if (allowedTools.includes("*") || allowedTools.includes(tool.name)) {
            // Transformar el nombre de la herramienta para evitar colisiones 
            // ej: "hubspot_buscar_contacto" en lugar de "buscar_contacto"
            const safeToolName = `${server.nombre.toLowerCase().replace(/[^a-z0-9]/g, "_")}_${tool.name}`;
            
            anthropicTools.push({
              name: safeToolName,
              description: tool.description || `Herramienta de ${server.nombre}`,
              input_schema: tool.inputSchema,
            });

            // Guardamos la referencia para saber qué cliente usar
            clientMap.set(safeToolName, client);
          }
        }
      } catch (err) {
        console.error(`Error conectando al MCP server ${server.nombre}:`, err);
      }
    }

    return { tools: anthropicTools, clientMap };
  }
}

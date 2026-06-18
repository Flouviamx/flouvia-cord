import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { getProductos } from "../queries";

// Instancia global del servidor MCP de CORD
export const cordMcpServer = new Server(
  {
    name: "cord-mcp-server",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Definimos las herramientas que CORD expone (Inbound)
cordMcpServer.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "listar_productos",
        description: "Obtiene el catálogo de productos activos de la organización",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      // Aquí se podrían agregar más herramientas (ej. leer_cotizaciones, crear_cotizacion)
    ],
  };
});

cordMcpServer.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name } = request.params;

  if (name === "listar_productos") {
    // getProductos() internamente usa el app.org_id del contexto actual de Neon.
    // Esto significa que devolverá los productos específicos de la org autenticada.
    const productos = await getProductos();
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(productos, null, 2),
        },
      ],
    };
  }

  throw new Error(`Tool no encontrada: ${name}`);
});

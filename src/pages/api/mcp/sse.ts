export const prerender = false;

import type { APIRoute } from "astro";
import { cordMcpServer } from "../../../lib/mcp/cord-server";
import { WebSseTransport, activeSessions } from "../../../lib/mcp/transport";

// Para validar la llave de API, el usuario deberá enviarla en un query param o header
// dado que los clientes SSE estándar a veces no soportan custom headers fácilmente.
// Asumiremos que viene en el header Authorization: Bearer <token>.
// (En un entorno real se debe validar con src/lib/db.ts y api_keys)

export const GET: APIRoute = async ({ request }) => {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response("Unauthorized", { status: 401 });
  }
  // TODO: Validar la API Key contra la base de datos (api_keys)
  
  const transport = new WebSseTransport("/api/mcp/message");
  activeSessions.set(transport.sessionId, transport);

  // Conectar el servidor MCP a este transporte.
  // Nota: Cada conexión instancia un nuevo canal de transporte para el servidor global.
  await cordMcpServer.connect(transport);

  return new Response(transport.stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "Access-Control-Allow-Origin": "*", // MCP requiere CORS
    },
  });
};

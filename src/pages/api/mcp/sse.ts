export const prerender = false;

import type { APIRoute } from "astro";
import { cordMcpServer } from "../../../lib/mcp/cord-server";
import { WebSseTransport, activeSessions } from "../../../lib/mcp/transport";
import { authApiKey } from "../../../lib/apikey";

// La llave de API viaja en el header Authorization: Bearer <sk_...>.
// authApiKey la valida contra api_keys (hash sha-256), checa que no esté
// revocada, valida el plan y resuelve el org_id. Ese org_id se guarda en la
// sesión SSE para que /api/mcp/message ejecute las tools con la tenancy correcta.

export const GET: APIRoute = async ({ request }) => {
  const auth = await authApiKey(request, "read");
  if (auth instanceof Response) return auth; // 401/403 ya formateado

  const transport = new WebSseTransport("/api/mcp/message");
  transport.orgId = auth.orgId;
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

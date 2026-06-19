export const prerender = false;

import type { APIRoute } from "astro";
import { activeSessions } from "../../../lib/mcp/transport";
import { reqContext } from "../../../lib/context";

// Endpoint para recibir los mensajes POST (JSON-RPC) de los clientes MCP.
// La sesión sólo existe si su SSE pasó la validación de API key en /api/mcp/sse,
// así que el sessionId actúa como capability ligada a un org_id concreto. Las
// tools se ejecutan dentro de reqContext.run({orgId}) para que getProductos()
// y demás queries respeten la tenancy (RLS) del dueño de la llave.
export const POST: APIRoute = async ({ request, url }) => {
  const sessionId = url.searchParams.get("sessionId");

  if (!sessionId) {
    return new Response("Missing sessionId", { status: 400 });
  }

  const transport = activeSessions.get(sessionId);

  if (!transport) {
    return new Response("Session not found or expired", { status: 404 });
  }

  try {
    await reqContext.run(
      { userId: null, orgId: transport.orgId },
      () => transport.handlePostMessage(request),
    );
    return new Response("Accepted", { status: 202 });
  } catch (error) {
    return new Response("Invalid message", { status: 400 });
  }
};

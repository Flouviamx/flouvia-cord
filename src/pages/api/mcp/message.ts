export const prerender = false;

import type { APIRoute } from "astro";
import { activeSessions } from "../../../lib/mcp/transport";

// Endpoint para recibir los mensajes POST (JSON-RPC) de los clientes MCP
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
    await transport.handlePostMessage(request);
    return new Response("Accepted", { status: 202 });
  } catch (error) {
    return new Response("Invalid message", { status: 400 });
  }
};

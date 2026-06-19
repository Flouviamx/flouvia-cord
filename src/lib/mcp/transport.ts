import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { JSONRPCMessageSchema } from "@modelcontextprotocol/sdk/types.js";
import type { JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";

// Global map to hold active SSE sessions.
// En un entorno serverless real (Vercel) con múltiples instancias, 
// esto requeriría Redis u otro mecanismo de pub/sub.
export const activeSessions = new Map<string, WebSseTransport>();

export class WebSseTransport implements Transport {
  onclose?: () => void;
  onerror?: (error: Error) => void;
  onmessage?: (message: JSONRPCMessage) => void;
  
  private controller?: ReadableStreamDefaultController;
  public readonly stream: ReadableStream;
  public readonly sessionId: string;
  private readonly endpoint: string;
  // org_id resuelto desde la API key al abrir la sesión SSE. Lo usa
  // /api/mcp/message para ejecutar las tools con la tenancy correcta.
  public orgId: string | null = null;

  constructor(endpoint: string) {
    this.endpoint = endpoint;
    this.sessionId = crypto.randomUUID();
    this.stream = new ReadableStream({
      start: (controller) => {
        this.controller = controller;
        // Send initial endpoint event
        const url = new URL(this.endpoint, "http://localhost");
        url.searchParams.set("sessionId", this.sessionId);
        const relativeUrl = url.pathname + url.search;
        this.controller.enqueue(new TextEncoder().encode(`event: endpoint\ndata: ${relativeUrl}\n\n`));
      },
      cancel: () => {
        this.close();
      }
    });
  }

  async start() {
    // En SSE la conexión comienza cuando se lee el stream.
  }

  async close() {
    try {
      this.controller?.close();
    } catch {}
    activeSessions.delete(this.sessionId);
    this.onclose?.();
  }

  async send(message: JSONRPCMessage) {
    if (!this.controller) throw new Error("Not connected");
    this.controller.enqueue(new TextEncoder().encode(`event: message\ndata: ${JSON.stringify(message)}\n\n`));
  }

  async handlePostMessage(request: Request) {
    try {
      const body = await request.json();
      const message = JSONRPCMessageSchema.parse(body);
      this.onmessage?.(message);
    } catch (err) {
      this.onerror?.(err as Error);
      throw err;
    }
  }
}

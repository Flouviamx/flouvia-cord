// GET /api/mcp/sse — transporte MCP legacy (HTTP+SSE), mantenido a petición
// de André junto al moderno /api/mcp (Streamable HTTP sin sesión). El cliente
// abre esta conexión, recibe un `event: endpoint` con la URL donde debe
// POSTear sus mensajes (/api/mcp/message?sessionId=…), y esta misma conexión
// va relayando las respuestas conforme /api/mcp/message las procesa.
//
// La sesión (identidad: orgId/scope/keyId) vive en session-store.ts, NO en
// memoria de este archivo — así un POST /message que caiga en otra instancia
// de Vercel puede resolverla igual (con Upstash configurado; sin él, cae a
// un Map en memoria de proceso — funciona con una sola instancia, ver
// session-store.ts). Esta conexión hace POLLING del buzón de salida de su
// propia sesión, MISMO patrón ya probado en /api/q/[token]/stream.ts: loop +
// heartbeat + duración máxima + `request.signal` para cortar al desconectar.
// El cliente reabre la conexión sola si se cierra (mismo comportamiento que
// ya tenía antes de esta reescritura — cada reconexión es una sesión nueva).
export const prerender = false;

import type { APIRoute } from 'astro';
import { authApiKey, checkApiKeyRateLimit, logApiRequest } from '../../../lib/apikey';
import { createSession, deleteSession, drainOutbox, touchSession } from '../../../lib/mcp/session-store';

const encoder = new TextEncoder();
const POLL_MS = 1000;
const HEARTBEAT_MS = 20000;
const MAX_MS = 270000; // ~4.5 min; el cliente reabre la conexión sola

export const GET: APIRoute = async ({ request }) => {
    const auth = await authApiKey(request, 'read');
    if (auth instanceof Response) return auth; // 401/403 ya formateado

    const limited = await checkApiKeyRateLimit(auth);
    if (limited) return limited;

    // Abrir una sesión no ejecuta ninguna tool todavía (no hay medición de
    // uso aquí — eso pasa por-mensaje en /api/mcp/message), pero SÍ queda en
    // la bitácora: es la única forma de ver en Developers cuántas conexiones
    // SSE abre cada llave.
    const t0 = Date.now();
    const sessionId = crypto.randomUUID();
    await createSession(sessionId, { orgId: auth.orgId, scope: auth.scope, keyId: auth.keyId });
    void logApiRequest(auth, request, 200, Date.now() - t0, '/mcp/sse');

    let closed = false;
    const stream = new ReadableStream({
        async start(controller) {
            const send = (event: string, data: unknown) => {
                if (closed) return;
                const payload = typeof data === 'string' ? data : JSON.stringify(data);
                try { controller.enqueue(encoder.encode(`event: ${event}\ndata: ${payload}\n\n`)); }
                catch { closed = true; }
            };
            // El evento `endpoint` lleva la URI RELATIVA como texto plano (no
            // JSON) — así lo espera el transporte HTTP+SSE de MCP.
            send('endpoint', `/api/mcp/message?sessionId=${sessionId}`);

            let lastHeartbeat = Date.now();
            const started = Date.now();
            request.signal.addEventListener('abort', () => { closed = true; });

            while (!closed && !request.signal.aborted && Date.now() - started < MAX_MS) {
                try {
                    const msgs = await drainOutbox(sessionId);
                    for (const m of msgs) send('message', m);
                } catch { /* fallo transitorio del backend — reintenta el siguiente ciclo */ }

                if (Date.now() - lastHeartbeat > HEARTBEAT_MS) {
                    send('ping', {});
                    lastHeartbeat = Date.now();
                    await touchSession(sessionId);
                }
                await new Promise((r) => setTimeout(r, POLL_MS));
            }
            try { controller.close(); } catch { /* ya cerrado */ }
            await deleteSession(sessionId);
        },
        cancel() {
            closed = true;
            deleteSession(sessionId).catch(() => {});
        },
    });

    return new Response(stream, {
        headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache, no-transform',
            'Connection': 'keep-alive',
            'X-Accel-Buffering': 'no',
            'Access-Control-Allow-Origin': '*', // MCP requiere CORS
        },
    });
};

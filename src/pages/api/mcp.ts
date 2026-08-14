// /api/mcp — Servidor MCP (Model Context Protocol) de Cord.
// Habla JSON-RPC 2.0 sobre HTTP (transporte "Streamable HTTP", modo sin sesión):
// el cliente (Claude u otra IA) POSTea mensajes y recibe la respuesta en el cuerpo.
// Se autentica con la MISMA API key que /api/v1 (Authorization: Bearer sk_...).
// Las tools (src/lib/mcp.ts) operan sobre la org resuelta por la llave.
//
// El motor JSON-RPC (`handle()`) vive en `src/lib/mcp/rpc.ts` — este archivo
// es solo el transporte HTTP; el transporte SSE (`/api/mcp/sse` +
// `/api/mcp/message`) usa el MISMO motor, así que ambos exponen exactamente
// el mismo catálogo de 7 tools sin duplicar lógica.
//
// Paridad con /api/v1 (jul 2026): rate-limit por llave, medición de uso
// (Stripe Billing, dimensión 'api') y bitácora en `api_requests` — las MISMAS
// 3 piezas que ya tenía /api/v1 vía `withApiAuth`, que MCP no podía usar tal
// cual porque necesita decidir "¿esto es una notificación o trabajo real?"
// ANTES de medir/loguear (una notificación no ejecuta nada facturable).
//
// Configúralo en un cliente MCP como servidor HTTP:
//   url: https://cordhq.app/api/mcp
//   header: Authorization: Bearer sk_live_xxxxxxxx
export const prerender = false;

import type { APIRoute } from 'astro';
import { authApiKey, checkApiKeyRateLimit, meterApiUsage, logApiRequest } from '../../lib/apikey';
import { reqContext } from '../../lib/context';
import { handle, RpcError, routeLabel, posthogMcp } from '../../lib/mcp/rpc';

// Clientes MCP corriendo en el navegador necesitan CORS en TODAS las
// respuestas del endpoint, no solo en el preflight OPTIONS — antes el
// preflight anunciaba `Access-Control-Allow-Origin` pero la respuesta real
// del POST no lo llevaba, así que la petición real fallaba tras pasar el
// preflight.
const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, MCP-Protocol-Version',
};
const jsonHeaders = { 'Content-Type': 'application/json', ...CORS_HEADERS };
const rpcOk = (id: any, result: unknown) =>
    new Response(JSON.stringify({ jsonrpc: '2.0', id, result }), { status: 200, headers: jsonHeaders });
const rpcErr = (id: any, code: number, message: string, status = 200) =>
    new Response(JSON.stringify({ jsonrpc: '2.0', id: id ?? null, error: { code, message } }), { status, headers: jsonHeaders });

export const POST: APIRoute = async ({ request }) => {
    // Auth de transporte: cualquier llave válida entra; el scope se revisa por-tool.
    const auth = await authApiKey(request, 'read');
    if (auth instanceof Response) return auth;

    const limited = await checkApiKeyRateLimit(auth);
    if (limited) return limited;

    const t0 = Date.now();

    let msg: any;
    try { msg = await request.json(); }
    catch {
        void logApiRequest(auth, request, 200, Date.now() - t0, '/mcp/parse-error');
        return rpcErr(null, -32700, 'Parse error');
    }

    if (Array.isArray(msg)) {
        void logApiRequest(auth, request, 200, Date.now() - t0, '/mcp/batch-unsupported');
        return rpcErr(null, -32600, 'No se soportan lotes (batch) de JSON-RPC.');
    }
    if (!msg || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') {
        void logApiRequest(auth, request, 200, Date.now() - t0, '/mcp/invalid-request');
        return rpcErr(msg?.id ?? null, -32600, 'Petición JSON-RPC inválida.');
    }

    const route = routeLabel(msg);

    // Las notificaciones (mensajes SIN id) nunca llevan respuesta — es parte
    // del spec JSON-RPC 2.0, no una opción. Cortocircuita ANTES de llamar a
    // handle(): todo cliente MCP manda `notifications/initialized` justo
    // después de `initialize`, y como handle() no tiene ese método en su
    // switch, terminaba lanzando -32601 y el catch de abajo respondía un
    // ERROR a una notificación — violación de protocolo que rompe clientes
    // MCP estrictos. Ninguna notificación necesita ejecutar handle() hoy —
    // tampoco cuenta como uso medible: no ejecuta ningún trabajo de negocio.
    const isNotification = msg.id === undefined || msg.id === null;
    if (isNotification) {
        void logApiRequest(auth, request, 202, Date.now() - t0, route);
        return new Response(null, { status: 202, headers: CORS_HEADERS });
    }

    const meteringError = await meterApiUsage(auth);
    if (meteringError) {
        return new Response(meteringError.body, { status: meteringError.status, headers: { ...Object.fromEntries(meteringError.headers), ...CORS_HEADERS } });
    }

    return reqContext.run({ userId: null, orgId: auth.orgId }, async () => {
        let res: Response;
        try {
            const result = await handle(msg, auth, request);
            res = rpcOk(msg.id, result);
        } catch (e) {
            res = e instanceof RpcError
                ? rpcErr(msg.id ?? null, e.code, e.message)
                : rpcErr(msg.id ?? null, -32603, 'Error interno del servidor.');
        }
        void logApiRequest(auth, request, res.status, Date.now() - t0, route);
        // Flush PostHog before returning — Vercel serverless may be torn down
        // after the response is sent, so we must flush before returning.
        await posthogMcp?.flush();
        return res;
    });
};

// El transporte SIN sesión (este endpoint) no soporta streams iniciados por
// el servidor — para eso existe el transporte legacy con sesión en GET
// /api/mcp/sse + POST /api/mcp/message, que comparte el mismo handle().
export const GET: APIRoute = () =>
    new Response(JSON.stringify({ error: 'Usa POST con JSON-RPC. Para streaming server-initiated usa GET /api/mcp/sse.' }),
        { status: 405, headers: { ...jsonHeaders, Allow: 'POST, OPTIONS' } });

// Preflight CORS (para clientes MCP basados en navegador).
export const OPTIONS: APIRoute = () =>
    new Response(null, {
        status: 204,
        headers: { ...CORS_HEADERS, 'Access-Control-Max-Age': '86400' },
    });

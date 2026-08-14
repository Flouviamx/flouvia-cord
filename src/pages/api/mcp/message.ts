// POST /api/mcp/message — mensajes JSON-RPC del transporte MCP legacy
// (HTTP+SSE). La sesión se abrió en GET /api/mcp/sse y vive en el almacén
// compartido (session-store.ts, Redis o memoria) — YA NO alcanza con conocer
// el sessionId (viaja en la URL, visible en logs de proxy intermedios):
// además se exige la MISMA API key (Authorization: Bearer) que abrió la
// sesión, y se valida que resuelva al MISMO org_id — una llave robada de
// otra org con un sessionId adivinado/filtrado no puede ejecutar nada.
//
// El resultado de cada tool se procesa aquí (mismo `handle()` que el
// transporte HTTP moderno) pero se ENTREGA por el buzón de salida
// (pushOutbox) — es GET /api/mcp/sse quien lo relaya al cliente por su
// propio stream. Este endpoint solo confirma recepción (202) o reporta
// errores de PROTOCOLO (sesión inválida, JSON mal formado) con forma
// JSON-RPC real, en vez del `400 "Invalid message"` plano que tenía antes.
//
// Paridad con /api/v1 (jul 2026): cada mensaje real (no notificación) cuenta
// como una llamada — rate-limit por llave, medición de uso y bitácora, MISMA
// lógica que /api/mcp (ver ese archivo). Todo el manejo tiene un solo punto
// de salida (variable `res`) para que el log cubra CUALQUIER desenlace, no
// solo el camino feliz.
export const prerender = false;

import type { APIRoute } from 'astro';
import { authApiKey, checkApiKeyRateLimit, meterApiUsage, logApiRequest } from '../../../lib/apikey';
import { reqContext } from '../../../lib/context';
import { getSession, pushOutbox, touchSession } from '../../../lib/mcp/session-store';
import { handle, RpcError, routeLabel, posthogMcp } from '../../../lib/mcp/rpc';

const jsonHeaders = { 'Content-Type': 'application/json' };
const rpcErrRes = (id: any, code: number, message: string, status: number) =>
    new Response(JSON.stringify({ jsonrpc: '2.0', id: id ?? null, error: { code, message } }), { status, headers: jsonHeaders });

export const POST: APIRoute = async ({ request, url }) => {
    const sessionId = url.searchParams.get('sessionId');
    if (!sessionId) return rpcErrRes(null, -32600, 'Falta sessionId en la URL.', 400);

    const auth = await authApiKey(request, 'read');
    if (auth instanceof Response) return auth; // 401/403 ya formateado (mismo shape que /api/v1 y /api/mcp)

    const limited = await checkApiKeyRateLimit(auth);
    if (limited) return limited;

    const t0 = Date.now();

    const session = await getSession(sessionId);
    if (!session) {
        const res = rpcErrRes(null, -32001, 'Sesión no encontrada o expirada. Abre una nueva con GET /api/mcp/sse.', 404);
        void logApiRequest(auth, request, res.status, Date.now() - t0, '/mcp/sse-message:session-not-found');
        return res;
    }
    if (session.orgId !== auth.orgId) {
        const res = rpcErrRes(null, -32001, 'Esta API key no corresponde a la sesión.', 403);
        void logApiRequest(auth, request, res.status, Date.now() - t0, '/mcp/sse-message:org-mismatch');
        return res;
    }

    let msg: any;
    try { msg = await request.json(); }
    catch {
        const res = rpcErrRes(null, -32700, 'Parse error', 400);
        void logApiRequest(auth, request, res.status, Date.now() - t0, '/mcp/sse-message:parse-error');
        return res;
    }

    if (!msg || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') {
        const res = rpcErrRes(msg?.id ?? null, -32600, 'Petición JSON-RPC inválida.', 400);
        void logApiRequest(auth, request, res.status, Date.now() - t0, '/mcp/sse-message:invalid-request');
        return res;
    }

    await touchSession(sessionId);
    const route = routeLabel(msg);

    // Las notificaciones (sin id) no llevan respuesta y no ejecutan trabajo
    // de negocio — mismo criterio que /api/mcp (ver ese archivo para el
    // detalle de por qué esto importa) — tampoco cuentan como uso medible.
    const isNotification = msg.id === undefined || msg.id === null;
    if (isNotification) {
        void logApiRequest(auth, request, 202, Date.now() - t0, route);
        return new Response(null, { status: 202 });
    }

    const meteringError = await meterApiUsage(auth);
    if (meteringError) return meteringError;

    return reqContext.run({ userId: null, orgId: session.orgId }, async () => {
        try {
            const result = await handle(msg, {
                scope: session.scope,
                keyId: session.keyId,
                orgId: session.orgId,
                sessionId,
            }, request);
            await pushOutbox(sessionId, { jsonrpc: '2.0', id: msg.id, result });
        } catch (e) {
            if (e instanceof RpcError) {
                await pushOutbox(sessionId, { jsonrpc: '2.0', id: msg.id ?? null, error: { code: e.code, message: e.message } });
            } else {
                await pushOutbox(sessionId, { jsonrpc: '2.0', id: msg.id ?? null, error: { code: -32603, message: 'Error interno del servidor.' } });
            }
        }
        void logApiRequest(auth, request, 202, Date.now() - t0, route);
        // Flush PostHog before returning — serverless may be torn down
        // after the response is sent, so we must drain events now.
        await posthogMcp?.flush();
        return new Response(null, { status: 202 });
    });
};

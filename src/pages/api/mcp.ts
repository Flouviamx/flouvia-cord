// /api/mcp — Servidor MCP (Model Context Protocol) de Cord.
// Habla JSON-RPC 2.0 sobre HTTP (transporte "Streamable HTTP", modo sin sesión):
// el cliente (Claude u otra IA) POSTea mensajes y recibe la respuesta en el cuerpo.
// Se autentica con la MISMA API key que /api/v1 (Authorization: Bearer sk_...).
// Las tools (src/lib/mcp.ts) operan sobre la org resuelta por la llave.
//
// Configúralo en un cliente MCP como servidor HTTP:
//   url: https://cord.flouvia.com/api/mcp
//   header: Authorization: Bearer sk_live_xxxxxxxx
export const prerender = false;

import type { APIRoute } from 'astro';
import { authApiKey } from '../../lib/apikey';
import { reqContext } from '../../lib/context';
import { reqIp } from '../../lib/db';
import { MCP_TOOLS, findTool, McpToolError } from '../../lib/mcp';

const SERVER_INFO = { name: 'cord', title: 'Cord — Cotizaciones B2B', version: '1.0.0' };
const DEFAULT_PROTOCOL = '2025-06-18';
const SUPPORTED_PROTOCOLS = ['2025-06-18', '2025-03-26', '2024-11-05'];

class RpcError extends Error {
    code: number;
    constructor(code: number, message: string) { super(message); this.code = code; }
}

const jsonHeaders = { 'Content-Type': 'application/json' };
const rpcOk = (id: any, result: unknown) =>
    new Response(JSON.stringify({ jsonrpc: '2.0', id, result }), { status: 200, headers: jsonHeaders });
const rpcErr = (id: any, code: number, message: string, status = 200) =>
    new Response(JSON.stringify({ jsonrpc: '2.0', id: id ?? null, error: { code, message } }), { status, headers: jsonHeaders });

// Resuelve el método JSON-RPC. Devuelve el `result`; lanza RpcError para fallos
// de protocolo. Las tools que fallan por "negocio" devuelven result con isError.
async function handle(msg: any, auth: { scope: string; keyId: string }, request: Request): Promise<unknown> {
    switch (msg.method) {
        case 'initialize': {
            const want = msg.params?.protocolVersion;
            const protocolVersion = SUPPORTED_PROTOCOLS.includes(want) ? want : DEFAULT_PROTOCOL;
            return {
                protocolVersion,
                capabilities: { tools: { listChanged: false } },
                serverInfo: SERVER_INFO,
                instructions: 'Herramientas para consultar y crear cotizaciones, clientes, productos y cobranza de un negocio B2B en Cord. Usa buscar_cliente y listar_productos antes de crear_cotizacion_borrador.',
            };
        }
        case 'ping':
            return {};
        case 'tools/list':
            return { tools: MCP_TOOLS.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })) };
        case 'tools/call': {
            const name = msg.params?.name;
            const tool = findTool(name);
            if (!tool) throw new RpcError(-32602, `Tool desconocida: ${name}`);
            if (tool.scope === 'write' && auth.scope !== 'write') {
                return { content: [{ type: 'text', text: 'Esta acción requiere una API key con permiso de escritura.' }], isError: true };
            }
            try {
                const data = await tool.handler(msg.params?.arguments ?? {}, { ip: reqIp(request), keyId: auth.keyId });
                return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
            } catch (e) {
                if (e instanceof McpToolError) {
                    return { content: [{ type: 'text', text: e.message }], isError: true };
                }
                throw e; // → -32603
            }
        }
        default:
            throw new RpcError(-32601, `Método no soportado: ${msg.method}`);
    }
}

export const POST: APIRoute = async ({ request }) => {
    // Auth de transporte: cualquier llave válida entra; el scope se revisa por-tool.
    const auth = await authApiKey(request, 'read');
    if (auth instanceof Response) return auth;

    let msg: any;
    try { msg = await request.json(); }
    catch { return rpcErr(null, -32700, 'Parse error'); }

    if (Array.isArray(msg)) return rpcErr(null, -32600, 'No se soportan lotes (batch) de JSON-RPC.');
    if (!msg || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') {
        return rpcErr(msg?.id ?? null, -32600, 'Petición JSON-RPC inválida.');
    }

    const isNotification = msg.id === undefined || msg.id === null;

    return reqContext.run({ userId: null, orgId: auth.orgId }, async () => {
        try {
            const result = await handle(msg, auth, request);
            // Las notificaciones (sin id) no llevan respuesta.
            if (isNotification) return new Response(null, { status: 202 });
            return rpcOk(msg.id, result);
        } catch (e) {
            if (e instanceof RpcError) return rpcErr(msg.id ?? null, e.code, e.message);
            return rpcErr(msg.id ?? null, -32603, 'Error interno del servidor.');
        }
    });
};

// SSE (server-initiated streams) no soportado: somos un servidor sin estado.
export const GET: APIRoute = () =>
    new Response(JSON.stringify({ error: 'Usa POST con JSON-RPC. El stream SSE no está disponible.' }),
        { status: 405, headers: { ...jsonHeaders, Allow: 'POST, OPTIONS' } });

// Preflight CORS (para clientes MCP basados en navegador).
export const OPTIONS: APIRoute = () =>
    new Response(null, {
        status: 204,
        headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Authorization, Content-Type, MCP-Protocol-Version',
            'Access-Control-Max-Age': '86400',
        },
    });

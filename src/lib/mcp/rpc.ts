// src/lib/mcp/rpc.ts
// Motor JSON-RPC 2.0 COMPARTIDO entre los dos transportes MCP de Cord: HTTP
// sin sesión (POST /api/mcp, "Streamable HTTP") y SSE con sesión (GET
// /api/mcp/sse + POST /api/mcp/message, legacy pero mantenido a petición de
// André). Antes cada transporte tenía su PROPIO catálogo de tools (7 en HTTP
// vs 1 en SSE, ver `cord-server.ts` ya eliminado) y el canal SSE conectaba
// TODAS las conexiones a un único `Server` global del SDK — el SDK guarda un
// solo campo `_transport` por instancia de `Server`, así que cada
// `connect()` nuevo lo sobreescribía: la respuesta calculada para la org A
// se enviaba por el stream de la org B (o viceversa), una fuga cross-tenant
// real. Con el motor extraído aquí, cada transporte solo necesita invocar
// `handle()` con su propio auth/request y mandar el resultado por SU PROPIO
// canal — no queda ningún estado compartido entre conexiones.
import { reqIp } from '../db';
import { MCP_TOOLS, findTool, McpToolError } from '../mcp';
import { PostHogMCP } from '@posthog/mcp';
import { isInternalAnalyticsOrg } from '../analytics-internal';

export const SERVER_INFO = { name: 'cord', title: 'Cord — Cotizaciones', version: '1.0.0' };
export const DEFAULT_PROTOCOL = '2025-06-18';
export const SUPPORTED_PROTOCOLS = ['2025-06-18', '2025-03-26', '2024-11-05'];

export class RpcError extends Error {
    code: number;
    constructor(code: number, message: string) { super(message); this.code = code; }
}

// Subconjunto de ApiAuth que el motor necesita — evita el import circular con
// apikey.ts (que no depende de mcp) y deja explícito qué usa realmente.
export interface RpcAuth {
    scope: 'read' | 'write';
    keyId: string;
    orgId: string;
    sessionId?: string;
}

// MCP inputs and tool responses can contain customer and commercial data. We
// retain only a low-cardinality argument shape for adoption/error/latency
// analytics, never their values or tool output.
function summarizeMcpArguments(args: unknown): Record<string, unknown> {
    if (!args || typeof args !== 'object' || Array.isArray(args)) return { argument_kind: typeof args };
    const keys = Object.keys(args as Record<string, unknown>).sort();
    return { argument_keys: keys, argument_count: keys.length };
}

function mcpCaptureContext(auth: RpcAuth) {
    return {
        groups: { company: auth.orgId },
        sessionId: auth.sessionId,
    };
}

// ── PostHog MCP analytics ──────────────────────────────────────────────────
// Cliente PostHogMCP (subclase de posthog-node) creado UNA vez por instancia
// serverless. Usa las mismas credenciales que posthog-server.ts para no
// duplicar vars. Si PUBLIC_POSTHOG_KEY no está configurada la instrumentación
// es un no-op silencioso en producción; en desarrollo se emite una advertencia.
const _phToken =
    (typeof import.meta !== 'undefined' && (import.meta as any).env?.PUBLIC_POSTHOG_KEY) ||
    process.env.PUBLIC_POSTHOG_KEY ||
    '';
const _phHost =
    (typeof import.meta !== 'undefined' && (import.meta as any).env?.PUBLIC_POSTHOG_HOST) ||
    process.env.PUBLIC_POSTHOG_HOST ||
    'https://us.i.posthog.com';

const _isDev =
    (typeof import.meta !== 'undefined' && (import.meta as any).env?.DEV) ||
    process.env.NODE_ENV === 'development';
const _captureDisabled = _isDev || String(
    (typeof import.meta !== 'undefined' && (import.meta as any).env?.POSTHOG_DISABLE_CAPTURE)
    || process.env.POSTHOG_DISABLE_CAPTURE
    || '',
).toLowerCase() === 'true';

if (!_phToken && _isDev) {
    // eslint-disable-next-line no-console
    console.warn(
        '[PostHog] PUBLIC_POSTHOG_KEY variable required by PostHog is missing or ' +
        'un-configured, this causes $mcp_* events to be silently missed. ' +
        'This error stops appearing once PUBLIC_POSTHOG_KEY is configured.'
    );
}

// Exported so route handlers can await flush() after each serverless request.
export const posthogMcp: PostHogMCP | null = _phToken && !_captureDisabled
    ? new PostHogMCP(_phToken, {
        host: _phHost,
        enableExceptionAutocapture: true,
        flushAt: 1,
        flushInterval: 0,
    })
    : null;
// ─────────────────────────────────────────────────────────────────────────────

// Resuelve el método JSON-RPC. Devuelve el `result`; lanza RpcError para
// fallos de protocolo. Las tools que fallan por "negocio" devuelven un
// result con isError:true en vez de lanzar — así el cliente MCP ve el
// mensaje sin que el transporte lo trate como error de protocolo.
export async function handle(msg: any, auth: RpcAuth, request: Request): Promise<unknown> {
    const analytics = posthogMcp && !await isInternalAnalyticsOrg(auth.orgId) ? posthogMcp : null;
    switch (msg.method) {
        case 'initialize': {
            const want = msg.params?.protocolVersion;
            const protocolVersion = SUPPORTED_PROTOCOLS.includes(want) ? want : DEFAULT_PROTOCOL;
            analytics?.captureInitialize({
                clientName: msg.params?.clientInfo?.name,
                clientVersion: msg.params?.clientInfo?.version,
                ...mcpCaptureContext(auth),
            });
            return {
                protocolVersion,
                capabilities: { tools: { listChanged: false } },
                serverInfo: SERVER_INFO,
                instructions: 'Herramientas para consultar y crear cotizaciones, clientes, productos y cobranza de un negocio en Cord. Usa buscar_cliente y listar_productos antes de crear_cotizacion_borrador.',
            };
        }
        case 'ping':
            return {};
        case 'tools/list':
            // outputSchema/annotations son opcionales por tool — se omiten del
            // objeto (no se mandan como `undefined`) cuando una tool no los
            // declara, para no ensuciar el JSON con claves vacías.
            return {
                tools: MCP_TOOLS.map((t) => ({
                    name: t.name,
                    description: t.description,
                    inputSchema: t.inputSchema,
                    ...(t.outputSchema ? { outputSchema: t.outputSchema } : {}),
                    ...(t.annotations ? { annotations: t.annotations } : {}),
                })),
            };
        case 'tools/call': {
            const name = msg.params?.name;
            const tool = findTool(name);
            if (!tool) throw new RpcError(-32602, `Tool desconocida: ${name}`);
            if (tool.scope === 'write' && auth.scope !== 'write') {
                const authResult = { content: [{ type: 'text', text: 'Esta acción requiere una API key con permiso de escritura.' }], isError: true };
                analytics?.captureToolCall({
                    toolName: name,
                    parameters: summarizeMcpArguments(msg.params?.arguments),
                    durationMs: 0,
                    isError: true,
                    ...mcpCaptureContext(auth),
                });
                return authResult;
            }
            const _t0 = Date.now();
            try {
                const data = await tool.handler(msg.params?.arguments ?? {}, { ip: reqIp(request), keyId: auth.keyId });
                const result = { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
                analytics?.captureToolCall({
                    toolName: name,
                    parameters: summarizeMcpArguments(msg.params?.arguments),
                    durationMs: Date.now() - _t0,
                    isError: false,
                    ...mcpCaptureContext(auth),
                });
                return result;
            } catch (e) {
                if (e instanceof McpToolError) {
                    const errResult = { content: [{ type: 'text', text: e.message }], isError: true };
                    analytics?.captureToolCall({
                        toolName: name,
                        parameters: summarizeMcpArguments(msg.params?.arguments),
                        durationMs: Date.now() - _t0,
                        isError: true,
                        ...mcpCaptureContext(auth),
                    });
                    return errResult;
                }
                analytics?.captureToolCall({
                    toolName: name,
                    parameters: summarizeMcpArguments(msg.params?.arguments),
                    durationMs: Date.now() - _t0,
                    isError: true,
                    ...mcpCaptureContext(auth),
                });
                throw e; // → -32603
            }
        }
        default:
            throw new RpcError(-32601, `Método no soportado: ${msg.method}`);
    }
}

// Ruta LEGIBLE para el "Log de actividad" de Developers — ambos transportes
// (HTTP y SSE) comparten esta forma para que el log no diga siempre `/mcp`
// sin importar qué se llamó. `tools/call` incluye el nombre de la tool
// (`/mcp/tools/call:listar_productos`) que es lo que de verdad importa
// auditar; el resto es `/mcp/<método>`.
export function routeLabel(msg: any): string {
    if (msg?.method === 'tools/call' && typeof msg?.params?.name === 'string') {
        return `/mcp/tools/call:${msg.params.name}`;
    }
    return `/mcp/${msg?.method || 'desconocido'}`;
}

// Arma las líneas de una cotización con IA a partir de texto libre y/o un
// documento. La usan el editor de la app (/api/cotizaciones/ai-draft) y el
// complemento de Gmail (/api/v1/cotizaciones/ia). El emparejamiento se valida
// aquí: la IA sugiere producto_id, pero el precio y los datos salen del catálogo.

import Anthropic from '@anthropic-ai/sdk';
import { trackExternalUsage } from './external-usage';
import { getProductos } from './queries';
import { cancelUsage, flushUsageReservation, reserveUsage } from './billing';
import { rateLimit } from './ratelimit';
import { McpClientManager } from './mcp/client-manager';
import { getDefaultAgentId } from './agents/governance';
import { log } from './log';
import { aiModel } from './ai-model';

const API_KEY = import.meta.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY;
const MODEL = aiModel();

export const IA_DISPONIBLE = Boolean(API_KEY);

const SYSTEM = `Eres un extractor de pedidos. ÚNICA tarea: convertir el pedido del cliente (texto, y/o una foto o PDF de una orden de compra, requisición o cotización de un tercero) en líneas de cotización usando el catálogo dado.

Si recibes un documento o imagen: léelo como leerías una orden de compra real — extrae cada renglón (producto/concepto, cantidad, precio si aparece). Ignora encabezados, sellos, folios internos del cliente y firmas; esos no son líneas de cotización. Si el documento trae varias páginas o secciones, cubre todas.

CATÁLOGO: formato id|nombre|unidad|precio (una línea por producto).

REGLAS DE EMPAREJAMIENTO (en orden de prioridad):
1. Coincidencia exacta de nombre o SKU → usa ese id
2. Nombre parcial, sinónimo o descripción similar → usa el más parecido
3. No existe en catálogo → línea libre: producto_id="" y descripcion literal del cliente

REGLAS DE CANTIDAD:
- "una docena"=12, "un par"=2, "un cuarto"=0.25, "medio"=0.5, "un centenar"=100
- Sin cantidad explícita → cantidad=1
- Redondea siempre a entero ≥1 (excepto si la unidad es m², m³, kg, ton, lt — ahí usa decimales)

REGLAS DE PRECIO:
- precio_sugerido > 0 SOLO si el cliente menciona un precio o monto EXPLÍCITO por unidad
- Si menciona descuento porcentual → precio_sugerido=0 (el vendedor lo calcula)
- Si no menciona precio → precio_sugerido=0

PROHIBICIONES ABSOLUTAS:
- Nunca inventes un producto que el cliente no mencionó
- Nunca fusiones dos productos distintos en una línea
- Nunca dividas un producto en varias líneas

EJEMPLO 1:
Catálogo: a1|Cemento Gris 50kg|saco|185 / a2|Arena Fina 25kg|costal|95
Cliente: "necesito 5 sacos de cemento gris y 2 costales de arena"
→ items: [{producto_id:"a1",descripcion:"Cemento Gris 50kg",cantidad:5,precio_sugerido:0},{producto_id:"a2",descripcion:"Arena Fina 25kg",cantidad:2,precio_sugerido:0}]

EJEMPLO 2 (línea libre + precio explícito):
Catálogo: b1|Varilla 3/8"|pieza|42
Cliente: "10 varillas y también 2 vigas IPR 6m a 850 cada una"
→ items: [{producto_id:"b1",descripcion:"Varilla 3/8\"",cantidad:10,precio_sugerido:0},{producto_id:"",descripcion:"Vigas IPR 6m",cantidad:2,precio_sugerido:850}]

EJEMPLO 3 (sin producto claro):
Catálogo: vacío
Cliente: "mándame lo de siempre"
→ items: [{producto_id:"",descripcion:"lo de siempre",cantidad:1,precio_sugerido:0}]`;

const TOOL = {
    name: 'armar_cotizacion',
    description: 'Devuelve las líneas de la cotización detectadas en el mensaje del cliente.',
    input_schema: {
        type: 'object' as const,
        properties: {
            items: {
                type: 'array',
                description: 'Una línea por producto o concepto pedido por el cliente.',
                items: {
                    type: 'object',
                    properties: {
                        producto_id: { type: 'string', description: 'id EXACTO del producto del catálogo que coincide; cadena vacía "" si el concepto no existe en el catálogo.' },
                        descripcion: { type: 'string', description: 'Nombre del producto del catálogo, o el concepto libre tal como lo pidió el cliente.' },
                        cantidad: { type: 'number', description: 'Cantidad pedida (número).' },
                        precio_sugerido: { type: 'number', description: 'Precio unitario si el cliente lo menciona explícitamente; 0 si no lo menciona.' },
                    },
                    required: ['descripcion', 'cantidad'],
                },
            },
        },
        required: ['items'],
    },
};

export interface LineaIa {
    id: string | null;
    nombre: string;
    unidad: string;
    lista: number;
    negociado: number | null;
    cantidad: number;
}

export type ResultadoIa =
    | { ok: true; items: LineaIa[] }
    | { ok: false; status: number; error: string; retryAfter?: number };

export async function armarLineasConIa(orgId: string, input: { text: string; fileBlock?: any; origen: string }): Promise<ResultadoIa> {
    if (!API_KEY) {
        return { ok: false, status: 503, error: 'Armar cotizaciones con IA todavía no está disponible en tu cuenta. Escríbenos a soporte@flouvia.com y lo activamos.' };
    }
    const { text, fileBlock = null } = input;
    const file = Boolean(fileBlock);

    const productos = (await getProductos()).filter((p) => p.activo);
    const catalogoTexto = productos.length
        ? 'id|nombre|unidad|precio\n' + productos.map((p) => `${p.id}|${p.nombre}|${p.unidad}|${p.precio}`).join('\n')
        : '(catálogo vacío)';
    const byId = new Map(productos.map((p) => [p.id, p]));

    // Rate limit por org ANTES de preparar la llamada externa.
    const rl = await rateLimit(`ai:${orgId}`, 20, 60);
    if (!rl.ok) return { ok: false, status: 429, error: 'Demasiadas solicitudes seguidas. Espera un momento.', retryAfter: rl.retryAfter };
    // Agente por defecto de la org → resuelve sus permisos sobre servidores MCP.
    const agenteId = await getDefaultAgentId(orgId);
    const mcpManager = new McpClientManager(orgId, agenteId);
    const { tools: mcpTools, toolMap } = await mcpManager.getAnthropicTools();
    
    const allTools = [TOOL, ...mcpTools];

    // Reserva atómica ANTES de Anthropic. Si Neon no puede demostrar cupo, la
    // llamada no sale; si Stripe falla después, el outbox durable la reintenta.
    const usage = await reserveUsage(orgId, 'ia', 1);
    if (!usage.ok || !usage.id) {
        await mcpManager.disconnectAll();
        const unavailable = /verificar|registrar/i.test(usage.reason || '');
        return { ok: false, status: unavailable ? 503 : 429, error: usage.reason || 'Alcanzaste el límite de IA de tu plan.' };
    }
    
    const client = new Anthropic({ apiKey: API_KEY });
    const textBlock = { type: 'text', text: `Catálogo:\n${catalogoTexto}\n\nMensaje del cliente${file ? ' (puede acompañar el documento/foto adjunta)' : ''}:\n"""${text || '(sin texto — lee el documento/foto adjunta)'}"""` };
    let messages: any[] = [{
        role: 'user',
        content: fileBlock ? [fileBlock, textBlock] : textBlock.text,
    }];

    let aiItems: any[] = [];
    
    // Agent Loop (máximo 5 iteraciones para evitar bucles infinitos)
    for (let i = 0; i < 5; i++) {
        let msg: any;
        try {
            // Haiku 5.5 piensa por default (cuenta en max_tokens) y su tokenizer
            // usa ~30% más tokens: margen suficiente para una lista larga de
            // líneas, con esfuerzo bajo porque es extracción, no razonamiento.
            msg = await client.messages.create({
                model: MODEL,
                max_tokens: 4096,
                output_config: { effort: 'low' },
                system: SYSTEM + "\n\nPuedes usar las herramientas adicionales proporcionadas para consultar información de CRMs o bases de datos externas si el cliente lo requiere implícitamente antes de armar la cotización. Tu objetivo final SIEMPRE debe ser llamar a la herramienta 'armar_cotizacion' con los resultados.",
                tools: allTools,
                tool_choice: { type: 'auto' },
                messages: messages,
            });
            await trackExternalUsage({
                orgId,
                provider: 'anthropic',
                category: 'ai',
                operation: 'quote_draft_turn',
                inputTokens: Number(msg.usage?.input_tokens || 0),
                outputTokens: Number(msg.usage?.output_tokens || 0),
                metadata: { model: MODEL, iteration: i + 1 },
            });
        } catch (err: any) {
            await cancelUsage(orgId, usage.id);
            await mcpManager.disconnectAll();
            await trackExternalUsage({ orgId, provider: 'anthropic', category: 'ai', operation: 'quote_draft_turn', status: 'failure', metadata: { model: MODEL, iteration: i + 1 } });
            log.error('error no controlado', { route: input.origen, err });
            return { ok: false, status: 502, error: 'La IA no pudo procesar el pedido. Intenta de nuevo.' };
        }

        const toolUses = msg.content.filter((b: any) => b.type === 'tool_use');
        
        // Si no usó herramientas, salimos del loop
        if (toolUses.length === 0) {
            break;
        }

        messages.push({ role: "assistant", content: msg.content });
        let toolResults: any[] = [];

        for (const tu of toolUses) {
            if (tu.name === 'armar_cotizacion') {
                aiItems = Array.isArray(tu.input?.items) ? tu.input.items : [];
                // Podemos salir temprano si ya completó su tarea principal
                toolResults.push({
                    type: "tool_result",
                    tool_use_id: tu.id,
                    content: "Cotización armada con éxito. Termina tu respuesta.",
                });
            } else if (toolMap.has(tu.name)) {
                // Ejecutar herramienta MCP externa con su nombre real en el servidor.
                try {
                    const { client: mcpClient, realName } = toolMap.get(tu.name)!;
                    const result = await mcpClient.callTool({
                        name: realName,
                        arguments: tu.input
                    });
                    toolResults.push({
                        type: "tool_result",
                        tool_use_id: tu.id,
                        content: JSON.stringify(result.content),
                    });
                } catch (e: any) {
                    toolResults.push({
                        type: "tool_result",
                        tool_use_id: tu.id,
                        content: `Error ejecutando herramienta: ${e.message}`,
                        is_error: true
                    });
                }
            }
        }

        messages.push({ role: "user", content: toolResults });

        // Si ya obtuvimos los items de la cotización, no hace falta iterar más
        if (aiItems.length > 0) break;
    }

    // Cierra las conexiones MCP abiertas (evita fugas entre invocaciones).
    await mcpManager.disconnectAll();

    const items: LineaIa[] = aiItems.map((it) => lineaDesdeIa(it, byId)).filter((it) => it.nombre);

    if (!items.length) {
        await cancelUsage(orgId, usage.id);
        return { ok: false, status: 422, error: 'No identifiqué productos en el mensaje ni se generó la cotización.' };
    }

    void flushUsageReservation(orgId, usage.id);

    return { ok: true, items };
}

type ProductoCatalogo = { id: string; nombre: string; unidad: string; precio: number };

// La IA sugiere el producto; el precio y los datos salen SIEMPRE del catálogo.
// Un precio que el cliente menciona solo cuenta como negociado si es menor al de lista.
export function lineaDesdeIa(it: any, byId: Map<string, ProductoCatalogo>): LineaIa {
    const cantidad = Math.max(1, Math.round(Number(it?.cantidad) || 1));
    const p = it?.producto_id ? byId.get(String(it.producto_id)) : null;
    if (p) {
        const sug = Number(it.precio_sugerido) || 0;
        const negociado = sug > 0 && sug < p.precio ? sug : null;
        return { id: p.id, nombre: p.nombre, unidad: p.unidad, lista: p.precio, negociado, cantidad };
    }
    const precio = Number(it?.precio_sugerido) > 0 ? Number(it.precio_sugerido) : 0;
    return { id: null, nombre: String(it?.descripcion || '').trim().slice(0, 500) || 'Concepto', unidad: 'pieza', lista: precio, negociado: null, cantidad };
}

export { SYSTEM as AI_DRAFT_SYSTEM, TOOL as AI_DRAFT_TOOL, MODEL as AI_DRAFT_MODEL };

export function aiDraftClient(): Anthropic {
    return new Anthropic({ apiKey: API_KEY });
}

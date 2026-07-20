// POST /api/cotizaciones/ai-draft — arma una cotización desde texto libre y/o un
// documento (PDF/foto de una orden de compra, requisición, cotización de un
// tercero, etc.) con IA. Recibe { text?, file?: { mediaType, data, name } } — al
// menos uno de los dos. `file.data` es el contenido en base64 (sin el prefijo
// data:...;base64,). Le da a Claude el catálogo de la org + el documento/imagen
// (visión nativa de Claude, sin OCR aparte) y devuelve las líneas ya emparejadas
// en el shape que usa el editor: { items: [{ id, nombre, unidad, lista, negociado, cantidad }] }.
//
// Usa el SDK oficial @anthropic-ai/sdk con tool_choice forzado (salida estructurada).
// Necesita ANTHROPIC_API_KEY en el entorno. Modelo configurable con AI_MODEL
// (default claude-haiku-4-5-20251001). El emparejamiento se valida en el servidor: la IA
// sugiere producto_id, pero el precio de lista y los datos salen del catálogo real.
export const prerender = false;

import type { APIRoute } from 'astro';
import Anthropic from '@anthropic-ai/sdk';
import { getProductos } from '../../../lib/queries';
import { getActiveOrgId } from '../../../lib/db';
import { reportUsage, checkQuota } from '../../../lib/billing';
import { rateLimit, tooMany } from '../../../lib/ratelimit';
import { McpClientManager } from '../../../lib/mcp/client-manager';
import { getDefaultAgentId } from '../../../lib/agents/governance';

const API_KEY = import.meta.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY;
const MODEL = import.meta.env.AI_MODEL || process.env.AI_MODEL || 'claude-haiku-4-5-20251001';

// Tipos soportados por la visión nativa de Claude (documentos e imágenes).
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const DOC_TYPES = new Set(['application/pdf']);
// Tope defensivo del lado del servidor (el cliente ya recomprime/limita antes de
// subir) — un base64 de ~6M chars ≈ 4.5MB decodificados, el límite práctico del
// body de una función de Vercel.
const MAX_B64_CHARS = 6_000_000;

const SYSTEM = `Eres un extractor de pedidos B2B en México. ÚNICA tarea: convertir el pedido del cliente (texto, y/o una foto o PDF de una orden de compra, requisición o cotización de un tercero) en líneas de cotización usando el catálogo dado.

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

export const POST: APIRoute = async ({ request }) => {
    if (!API_KEY) {
        return json({ error: 'La IA aún no está configurada. Define ANTHROPIC_API_KEY (o enciende Vercel AI Gateway) en el entorno.' }, 503);
    }
    let body: any;
    try { body = await request.json(); } catch { return json({ error: 'JSON inválido' }, 400); }
    const text = String(body.text ?? '').trim();
    const file = body.file && typeof body.file === 'object' ? body.file : null;

    if (!text && !file) return json({ error: 'Pega el pedido del cliente o adjunta una foto/PDF' }, 400);
    if (text.length > 2000) return json({ error: 'El texto es demasiado largo (máx 2000 caracteres)' }, 400);

    let fileBlock: any = null;
    if (file) {
        const mediaType = String(file.mediaType || '');
        const data = String(file.data || '');
        if (!data || data.length > MAX_B64_CHARS) {
            return json({ error: 'El archivo es demasiado pesado. Intenta con una foto más ligera o un PDF más corto.' }, 400);
        }
        if (IMAGE_TYPES.has(mediaType)) {
            fileBlock = { type: 'image', source: { type: 'base64', media_type: mediaType, data } };
        } else if (DOC_TYPES.has(mediaType)) {
            fileBlock = { type: 'document', source: { type: 'base64', media_type: mediaType, data } };
        } else {
            return json({ error: 'Formato no soportado. Sube una foto (JPG/PNG/WEBP) o un PDF.' }, 400);
        }
    }

    const productos = (await getProductos()).filter((p) => p.activo);
    const catalogoTexto = productos.length
        ? 'id|nombre|unidad|precio\n' + productos.map((p) => `${p.id}|${p.nombre}|${p.unidad}|${p.precio}`).join('\n')
        : '(catálogo vacío)';
    const byId = new Map(productos.map((p) => [p.id, p]));

    const orgId = await getActiveOrgId();
    // Rate limit por org + cuota de plan ANTES de gastar en Anthropic (evita abuso
    // y gasto runaway: el free se corta en su tope, los de pago en el techo de seguridad).
    const rl = await rateLimit(`ai:${orgId}`, 20, 60);
    if (!rl.ok) return tooMany(rl.retryAfter);
    const quota = await checkQuota(orgId, 'ia');
    if (!quota.ok) return json({ error: quota.reason }, 429);
    // Agente por defecto de la org → resuelve sus permisos sobre servidores MCP.
    const agenteId = await getDefaultAgentId(orgId);
    const mcpManager = new McpClientManager(orgId, agenteId);
    const { tools: mcpTools, toolMap } = await mcpManager.getAnthropicTools();
    
    const allTools = [TOOL, ...mcpTools];
    
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
            msg = await client.messages.create({
                model: MODEL,
                max_tokens: 1024,
                system: SYSTEM + "\n\nPuedes usar las herramientas adicionales proporcionadas para consultar información de CRMs o bases de datos externas si el cliente lo requiere implícitamente antes de armar la cotización. Tu objetivo final SIEMPRE debe ser llamar a la herramienta 'armar_cotizacion' con los resultados.",
                tools: allTools,
                tool_choice: { type: 'auto' },
                messages: messages,
            });
        } catch (err: any) {
            console.error(err);
            return json({ error: 'La IA no pudo procesar el pedido. Revisa tu llave o intenta de nuevo.' }, 502);
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

    const items = aiItems.map((it) => {
        const cantidad = Math.max(1, Math.round(Number(it.cantidad) || 1));
        const p = it.producto_id ? byId.get(String(it.producto_id)) : null;
        if (p) {
            const sug = Number(it.precio_sugerido) || 0;
            const negociado = sug > 0 && sug < p.precio ? sug : null;
            return { id: p.id, nombre: p.nombre, unidad: p.unidad, lista: p.precio, negociado, cantidad };
        }
        const precio = Number(it.precio_sugerido) > 0 ? Number(it.precio_sugerido) : 0;
        return { id: null, nombre: String(it.descripcion || '').trim() || 'Concepto', unidad: 'pieza', lista: precio, negociado: null, cantidad };
    }).filter((it) => it.nombre);

    if (!items.length) return json({ error: 'No identifiqué productos en el mensaje ni se generó la cotización.' }, 422);

    // Mide el consumo de IA del periodo (UI en vivo + cobro de excedente vía Stripe).
    try { await reportUsage(orgId, 'ia', 1); } catch { /* nunca bloquea */ }

    return json({ items });
};

function json(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

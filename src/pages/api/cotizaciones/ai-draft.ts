// POST /api/cotizaciones/ai-draft — arma una cotización desde texto libre con IA.
// Recibe { text } (el pedido del cliente en lenguaje natural, p. ej. de WhatsApp),
// le da a Claude el catálogo de la org y devuelve las líneas ya emparejadas en el
// shape que usa el editor: { items: [{ id, nombre, unidad, lista, negociado, cantidad }] }.
//
// Usa el SDK oficial @anthropic-ai/sdk con tool_choice forzado (salida estructurada).
// Necesita ANTHROPIC_API_KEY en el entorno. Modelo configurable con AI_MODEL
// (default claude-opus-4-8). El emparejamiento se valida en el servidor: la IA
// sugiere producto_id, pero el precio de lista y los datos salen del catálogo real.
export const prerender = false;

import type { APIRoute } from 'astro';
import Anthropic from '@anthropic-ai/sdk';
import { getProductos } from '../../../lib/queries';

const API_KEY = import.meta.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY;
const MODEL = import.meta.env.AI_MODEL || process.env.AI_MODEL || 'claude-opus-4-8';

const SYSTEM = `Eres un asistente experto que arma cotizaciones B2B para un negocio en México.
Recibes (1) el catálogo de productos del negocio en JSON (id, sku, nombre, unidad, precio de lista)
y (2) el mensaje de un cliente en lenguaje natural (español mexicano, suele venir de WhatsApp o correo).
Tu trabajo: identificar qué productos y en qué cantidad pide el cliente, y emparejar cada concepto con
el producto del catálogo más parecido por nombre o SKU, devolviendo su producto_id EXACTO.
Si un concepto no está en el catálogo, devuélvelo como línea libre (producto_id vacío) con su descripción.
Interpreta unidades y cantidades coloquiales (p. ej. "200 sacos", "5 toneladas", "una docena").
No inventes productos que el cliente no pidió. Llama a la herramienta armar_cotizacion con todas las líneas.`;

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
    if (!text) return json({ error: 'Pega el pedido del cliente' }, 400);
    if (text.length > 6000) return json({ error: 'El texto es demasiado largo (máx 6000 caracteres)' }, 400);

    const productos = (await getProductos()).filter((p) => p.activo);
    const catalogo = productos.map((p) => ({ id: p.id, sku: p.sku, nombre: p.nombre, unidad: p.unidad, precio: p.precio }));
    const byId = new Map(productos.map((p) => [p.id, p]));

    const client = new Anthropic({ apiKey: API_KEY });
    let msg: any;
    try {
        msg = await client.messages.create({
            model: MODEL,
            max_tokens: 4096,
            system: SYSTEM,
            tools: [TOOL],
            tool_choice: { type: 'tool', name: 'armar_cotizacion' },
            messages: [{
                role: 'user',
                content: `Catálogo (JSON):\n${JSON.stringify(catalogo)}\n\nMensaje del cliente:\n"""${text}"""`,
            }],
        });
    } catch (err: any) {
        return json({ error: 'La IA no pudo procesar el pedido. Revisa tu llave o intenta de nuevo.' }, 502);
    }

    const tu = (msg.content || []).find((b: any) => b.type === 'tool_use');
    const aiItems: any[] = tu && Array.isArray(tu.input?.items) ? tu.input.items : [];

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

    if (!items.length) return json({ error: 'No identifiqué productos en el mensaje. Sé más específico o agrégalos a mano.' }, 422);

    return json({ items });
};

function json(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

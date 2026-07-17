// src/lib/mcp.ts
// Catálogo de TOOLS del servidor MCP de Cord. Cada tool envuelve una query/acción
// que YA existe (queries.ts / cotizaciones.ts) y devuelve datos crudos — el endpoint
// (/api/mcp) los serializa a texto para el modelo. Las tools corren dentro del
// contexto de la org resuelta por la API key, así que reusan getActiveOrgId() sin
// cambios. Las de ESCRITURA declaran scope:'write' (la key debe tenerlo).

import { getActiveOrgId, reqIp } from './db';
import {
    getCotizaciones, getCotizacion, getClientes, getProductos,
    getCobranza, getAnalytics, getPlanUsage,
} from './queries';
import { createCotizacion, QuoteError } from './cotizaciones';
import type { ApiScope } from './apikey';

export interface McpToolDef {
    name: string;
    description: string;
    inputSchema: Record<string, unknown>;
    scope: ApiScope;
    handler: (args: any, ctx: { ip: string; keyId: string }) => Promise<unknown>;
}

const obj = (props: Record<string, unknown>, required: string[] = []) => ({
    type: 'object', properties: props, required, additionalProperties: false,
});

export const MCP_TOOLS: McpToolDef[] = [
    {
        name: 'listar_cotizaciones',
        description: 'Lista las cotizaciones del negocio. Útil para revisar el estado del pipeline. Se puede filtrar por estado (draft, sent, viewed, approved, rejected, expired, paid, invoiced).',
        inputSchema: obj({
            status: { type: 'string', description: 'Filtra por estado (opcional)' },
            limit: { type: 'number', description: 'Máximo de resultados (default 20)' },
        }),
        scope: 'read',
        handler: async (args) => {
            const all = await getCotizaciones();
            const filtered = args?.status ? all.filter((q) => q.status === args.status) : all;
            const limit = Math.min(100, Math.max(1, Number(args?.limit) || 20));
            return {
                total: filtered.length,
                cotizaciones: filtered.slice(0, limit).map((q) => ({
                    id: q.id, folio: q.folio, cliente: q.cliente, status: q.status,
                    total: q.total, terminos: q.terminos, vigencia: q.vigencia, creada: q.creada,
                })),
            };
        },
    },
    {
        name: 'detalle_cotizacion',
        description: 'Devuelve el detalle completo de una cotización: líneas, totales y su línea de tiempo de eventos (creada, vista, aprobada…).',
        inputSchema: obj({ id: { type: 'string', description: 'ID de la cotización' } }, ['id']),
        scope: 'read',
        handler: async (args) => {
            const q = await getCotizacion(String(args?.id || ''));
            if (!q) throw new McpToolError(`No encontré una cotización con id ${args?.id}`);
            return {
                id: q.id, folio: q.folio, cliente: q.cliente, status: q.status, total: q.total,
                terminos: q.terminos, vigencia: q.vigencia, notas: q.notas ?? null,
                aprobacion: q.aprobEstado ? { estado: q.aprobEstado, motivo: q.aprobMotivo } : null,
                items: q.items.map((it) => ({
                    descripcion: it.descripcion, cantidad: it.cantidad, unidad: it.unidad,
                    precio_lista: it.precioLista, precio_negociado: it.precioNegociado,
                })),
                eventos: q.eventos.map((e) => ({ tipo: e.tipo, detalle: e.detalle, cuando: e.cuando })),
            };
        },
    },
    {
        name: 'cartera_vencida',
        description: 'Resumen de cuentas por cobrar con foco en lo VENCIDO: cuánto se debe, cuántas facturas están en riesgo, aging por antigüedad y el detalle de cada cuenta vencida (con cliente, monto, días vencido e interés moratorio). Ideal para decidir a quién mandar recordatorio.',
        inputSchema: obj({}),
        scope: 'read',
        handler: async () => {
            const cob = await getCobranza();
            const vencidas = cob.items.filter((i) => i.overdue).map(({ token, ...r }) => r);
            return { resumen: cob.resumen, aging: cob.aging, vencidas };
        },
    },
    {
        name: 'resumen_negocio',
        description: 'Panorama del negocio: KPIs (cerrado, tasa de cierre, ticket promedio, días a cierre), embudo de conversión, pronóstico de pipeline, margen cedido y uso del plan. Úsalo para responder "¿cómo va el negocio?".',
        inputSchema: obj({}),
        scope: 'read',
        handler: async () => {
            const [a, plan] = await Promise.all([getAnalytics(), getPlanUsage()]);
            return {
                kpis: a.kpis, funnel: a.funnel, forecast: a.forecast, margen: a.margen,
                topClientes: a.clientes.slice(0, 5), topProductos: a.productos.slice(0, 5),
                plan: { nombre: plan.plan, cotizacionesActivas: plan.usadas, limite: plan.limite, ilimitado: plan.ilimitado },
            };
        },
    },
    {
        name: 'buscar_cliente',
        description: 'Busca clientes del directorio por nombre de empresa, contacto, RFC o correo. Devuelve sus datos incluyendo el id (necesario para crear una cotización), términos y límite de crédito.',
        inputSchema: obj({ query: { type: 'string', description: 'Texto a buscar' } }, ['query']),
        scope: 'read',
        handler: async (args) => {
            const q = String(args?.query || '').trim().toLowerCase();
            const all = await getClientes();
            const hits = !q ? all : all.filter((c) =>
                [c.empresa, c.contacto, c.rfc, c.email].some((f) => (f || '').toLowerCase().includes(q)));
            return { total: hits.length, clientes: hits.slice(0, 20) };
        },
    },
    {
        name: 'listar_productos',
        description: 'Lista el catálogo de productos del negocio (id, SKU, nombre, unidad, precio de lista). Filtra opcionalmente por texto. Útil para armar una cotización.',
        inputSchema: obj({ query: { type: 'string', description: 'Filtra por nombre o SKU (opcional)' } }),
        scope: 'read',
        handler: async (args) => {
            const q = String(args?.query || '').trim().toLowerCase();
            const all = await getProductos();
            const hits = !q ? all : all.filter((p) =>
                [p.nombre, p.sku].some((f) => (f || '').toLowerCase().includes(q)));
            return { total: hits.length, productos: hits.slice(0, 50) };
        },
    },
    {
        name: 'crear_cotizacion_borrador',
        description: 'Crea una cotización en BORRADOR (no la envía al cliente). Pasa las líneas con su descripción, cantidad y precio unitario; opcionalmente el id del cliente (úsalo de buscar_cliente) y notas. Devuelve el folio y el link para revisarla. Requiere una API key con permiso de escritura.',
        inputSchema: obj({
            cliente_id: { type: 'string', description: 'ID del cliente (opcional)' },
            notas: { type: 'string', description: 'Notas internas (opcional)' },
            items: {
                type: 'array',
                description: 'Líneas de la cotización',
                items: obj({
                    producto_id: { type: 'string', description: 'ID de producto del catálogo (opcional)' },
                    descripcion: { type: 'string' },
                    cantidad: { type: 'number' },
                    precio_unitario: { type: 'number' },
                    precio_negociado: { type: 'number', description: 'Precio con descuento (opcional)' },
                }, ['descripcion', 'cantidad', 'precio_unitario']),
            },
        }, ['items']),
        scope: 'write',
        handler: async (args, ctx) => {
            const orgId = await getActiveOrgId();
            try {
                const r = await createCotizacion(orgId, {
                    cliente_id: args?.cliente_id || null,
                    notas: args?.notas || null,
                    items: Array.isArray(args?.items) ? args.items : [],
                    send: false,
                }, { origin: 'https://cordhq.app', ip: ctx.ip, actor: `mcp:${ctx.keyId}` });
                return { id: r.id, folio: r.folio, link_publico: `/q/${r.token}`, estado: 'borrador' };
            } catch (e) {
                if (e instanceof QuoteError) throw new McpToolError(e.message);
                throw e;
            }
        },
    },
];

// Error "de negocio" de una tool (se reporta al modelo como isError, no como
// fallo de protocolo). Para validaciones / not-found.
export class McpToolError extends Error {}

export const findTool = (name: string) => MCP_TOOLS.find((t) => t.name === name);

// reqIp re-exportado por conveniencia del endpoint.
export { reqIp };

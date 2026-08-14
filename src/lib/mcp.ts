// src/lib/mcp.ts
// Catálogo de TOOLS del servidor MCP de Cord. Cada tool envuelve una query/acción
// que YA existe (queries.ts / cotizaciones.ts) y devuelve datos crudos — el endpoint
// (/api/mcp) los serializa a texto para el modelo. Las tools corren dentro del
// contexto de la org resuelta por la API key, así que reusan getActiveOrgId() sin
// cambios. Las de ESCRITURA declaran scope:'write' (la key debe tenerlo).

import { getActiveOrgId, reqIp, sql } from './db';
import {
    getCotizaciones, getCotizacion, getCobranza, getAnalytics, getPlanUsage,
} from './queries';
import { createCotizacion, QuoteError } from './cotizaciones';
import type { ApiScope } from './apikey';
import { checkEntitlement } from './org-entitlements';

// Anotaciones estándar de MCP — le dicen a un cliente si puede AUTO-APROBAR
// una llamada sin confirmación humana (readOnlyHint) o si debe pedir
// confirmación explícita (destructiveHint). Sin esto, todo cliente MCP tiene
// que tratar cada tool como potencialmente peligrosa por igual.
export interface McpToolAnnotations {
    title?: string;
    readOnlyHint?: boolean;
    destructiveHint?: boolean;
    idempotentHint?: boolean;
    openWorldHint?: boolean;
}

export interface McpToolDef {
    name: string;
    description: string;
    inputSchema: Record<string, unknown>;
    outputSchema?: Record<string, unknown>;
    annotations?: McpToolAnnotations;
    scope: ApiScope;
    handler: (args: any, ctx: { ip: string; keyId: string }) => Promise<unknown>;
}

const obj = (props: Record<string, unknown>, required: string[] = []) => ({
    type: 'object', properties: props, required, additionalProperties: false,
});

// Página con cursor simple (offset codificado como string) — suficiente para
// el volumen real de estas tablas (catálogo/directorio de una org, no un
// dataset masivo); un cursor opaco de verdad sería sobre-ingeniería aquí.
function page<T>(items: T[], total: number, offset: number, limit: number) {
    const hasMore = offset + items.length < total;
    return { items, total, has_more: hasMore, next_cursor: hasMore ? String(offset + limit) : null };
}

// Escapa % y _ (comodines de ILIKE) y la barra de escape misma, para que
// buscar literalmente "50%" no se comporte como un patrón — Postgres usa \
// como carácter de escape por defecto en LIKE/ILIKE, sin necesitar ESCAPE explícito.
const likeParam = (q: string) => `%${q.replace(/[%_\\]/g, '\\$&')}%`;

export const MCP_TOOLS: McpToolDef[] = [
    {
        name: 'listar_cotizaciones',
        description: 'Lista las cotizaciones del negocio. Útil para revisar el estado del pipeline. Se puede filtrar por estado (draft, sent, viewed, approved, rejected, expired, paid, invoiced).',
        inputSchema: obj({
            status: { type: 'string', description: 'Filtra por estado (opcional)' },
            limit: { type: 'number', description: 'Máximo de resultados (default 20)' },
        }),
        outputSchema: obj({
            total: { type: 'number' },
            cotizaciones: { type: 'array' },
        }),
        annotations: { title: 'Listar cotizaciones', readOnlyHint: true, idempotentHint: true, openWorldHint: false },
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
        outputSchema: obj({
            id: { type: 'string' }, folio: { type: 'string' }, cliente: { type: 'string' },
            status: { type: 'string' }, total: { type: 'number' },
            items: { type: 'array' }, eventos: { type: 'array' },
        }),
        annotations: { title: 'Detalle de una cotización', readOnlyHint: true, idempotentHint: true, openWorldHint: false },
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
        outputSchema: obj({ resumen: { type: 'object' }, aging: { type: 'object' }, vencidas: { type: 'array' } }),
        annotations: { title: 'Cartera vencida', readOnlyHint: true, idempotentHint: true, openWorldHint: false },
        scope: 'read',
        handler: async () => {
            const entitlement = await checkEntitlement(await getActiveOrgId(), 'collections');
            if (!entitlement.ok) throw new Error('Esta herramienta requiere el plan Scale o superior.');
            const cob = await getCobranza();
            const vencidas = cob.items.filter((i) => i.overdue).map(({ token, ...r }) => r);
            return { resumen: cob.resumen, aging: cob.aging, vencidas };
        },
    },
    {
        name: 'resumen_negocio',
        description: 'Panorama del negocio: KPIs (cerrado, tasa de cierre, ticket promedio, días a cierre), embudo de conversión, pronóstico de pipeline, margen cedido y uso del plan. Úsalo para responder "¿cómo va el negocio?".',
        inputSchema: obj({}),
        outputSchema: obj({ kpis: { type: 'object' }, funnel: { type: 'object' }, forecast: { type: 'object' }, plan: { type: 'object' } }),
        annotations: { title: 'Resumen del negocio', readOnlyHint: true, idempotentHint: true, openWorldHint: false },
        scope: 'read',
        handler: async () => {
            const [a, plan] = await Promise.all([getAnalytics(), getPlanUsage()]);
            const advanced = await checkEntitlement(await getActiveOrgId(), 'advanced_forecast');
            return {
                kpis: a.kpis, funnel: a.funnel,
                ...(advanced.ok ? { forecast: a.forecast, margen: a.margen } : {}),
                topClientes: a.clientes.slice(0, 5), topProductos: a.productos.slice(0, 5),
                plan: { nombre: plan.plan, cotizacionesActivas: plan.usadas, limite: plan.limite, ilimitado: plan.ilimitado },
            };
        },
    },
    {
        name: 'buscar_cliente',
        description: 'Busca clientes del directorio por nombre de empresa, contacto, RFC o correo. Devuelve sus datos incluyendo el id (necesario para crear una cotización), términos y límite de crédito. Paginado: si `has_more` viene true, repite la llamada con `cursor: next_cursor` para la siguiente página.',
        inputSchema: obj({
            query: { type: 'string', description: 'Texto a buscar (vacío = todos)' },
            limit: { type: 'number', description: 'Resultados por página (default 20, máx 100)' },
            cursor: { type: 'string', description: 'Cursor de la página siguiente (viene en next_cursor de la respuesta anterior)' },
        }, ['query']),
        outputSchema: obj({
            items: { type: 'array' }, total: { type: 'number' },
            has_more: { type: 'boolean' }, next_cursor: { type: ['string', 'null'] },
        }),
        annotations: { title: 'Buscar cliente', readOnlyHint: true, idempotentHint: true, openWorldHint: false },
        scope: 'read',
        handler: async (args) => {
            const orgId = await getActiveOrgId();
            const q = String(args?.query || '').trim();
            const limit = Math.min(100, Math.max(1, Number(args?.limit) || 20));
            const offset = Math.max(0, Number(args?.cursor) || 0);
            const like = likeParam(q);
            // Filtrado y paginación EN SQL (antes: cargaba TODO el directorio a
            // JS y filtraba con .includes() — con cientos/miles de clientes, un
            // solo buscar_cliente movía la tabla completa por la red cada vez).
            const rows = await sql`
                select id, empresa, contacto, email, rfc, terminos_default, limite_credito,
                       count(*) over() as total_count
                from clientes
                where org_id = ${orgId}
                  and (${q} = '' or empresa ilike ${like} or contacto ilike ${like} or rfc ilike ${like} or email ilike ${like})
                order by empresa
                limit ${limit} offset ${offset}`;
            const total = rows.length ? Number(rows[0].total_count) : 0;
            const items = (rows as any[]).map((c) => ({
                id: c.id as string, empresa: c.empresa as string, contacto: (c.contacto as string) ?? '',
                email: (c.email as string) ?? '', rfc: (c.rfc as string) ?? '',
                terminos: (c.terminos_default as string) ?? '', limite: Number(c.limite_credito ?? 0),
            }));
            return page(items, total, offset, limit);
        },
    },
    {
        name: 'listar_productos',
        description: 'Lista el catálogo de productos del negocio (id, SKU, nombre, unidad, precio de lista). Filtra opcionalmente por texto. Útil para armar una cotización. Paginado: si `has_more` viene true, repite la llamada con `cursor: next_cursor` para la siguiente página.',
        inputSchema: obj({
            query: { type: 'string', description: 'Filtra por nombre o SKU (opcional)' },
            limit: { type: 'number', description: 'Resultados por página (default 50, máx 100)' },
            cursor: { type: 'string', description: 'Cursor de la página siguiente (viene en next_cursor de la respuesta anterior)' },
        }),
        outputSchema: obj({
            items: { type: 'array' }, total: { type: 'number' },
            has_more: { type: 'boolean' }, next_cursor: { type: ['string', 'null'] },
        }),
        annotations: { title: 'Listar productos', readOnlyHint: true, idempotentHint: true, openWorldHint: false },
        scope: 'read',
        handler: async (args) => {
            const orgId = await getActiveOrgId();
            const q = String(args?.query || '').trim();
            const limit = Math.min(100, Math.max(1, Number(args?.limit) || 50));
            const offset = Math.max(0, Number(args?.cursor) || 0);
            const like = likeParam(q);
            // Igual que buscar_cliente: filtro y paginación en SQL. Nota de
            // seguridad de paso: NUNCA se selecciona `costo` (margen interno) —
            // el catálogo antes venía de getProductos(), que sí lo incluye; una
            // llave de solo lectura podía leer el margen de cada producto sin
            // que la tool lo necesitara para nada.
            const rows = await sql`
                select id, sku, nombre, unidad, precio_lista, activo, count(*) over() as total_count
                from productos
                where org_id = ${orgId}
                  and (${q} = '' or nombre ilike ${like} or sku ilike ${like})
                order by activo desc, nombre
                limit ${limit} offset ${offset}`;
            const total = rows.length ? Number(rows[0].total_count) : 0;
            const items = (rows as any[]).map((p) => ({
                id: p.id as string, sku: (p.sku as string) ?? '', nombre: p.nombre as string,
                unidad: p.unidad as string, precio_lista: Number(p.precio_lista ?? 0), activo: p.activo as boolean,
            }));
            return page(items, total, offset, limit);
        },
    },
    {
        name: 'crear_cotizacion_borrador',
        description: 'Crea una cotización en BORRADOR (no la envía al cliente). Pasa las líneas con su descripción, cantidad y precio unitario; opcionalmente el id del cliente (úsalo de buscar_cliente) y notas. Devuelve el folio y el link para revisarla. Requiere una API key con permiso de escritura. Pasa `idempotency_key` (cualquier string único que tú generes) si vas a reintentar la llamada — un reintento con la MISMA llave devuelve la cotización ya creada en vez de duplicarla.',
        inputSchema: obj({
            cliente_id: { type: 'string', description: 'ID del cliente (opcional)' },
            notas: { type: 'string', description: 'Notas internas (opcional)' },
            idempotency_key: { type: 'string', description: 'Identificador único que tú generas para hacer la llamada segura de reintentar (opcional, pero recomendado)' },
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
        outputSchema: obj({
            id: { type: 'string' }, folio: { type: 'string' },
            link_publico: { type: 'string' }, estado: { type: 'string' },
        }),
        // idempotentHint:false por default honesto: SIN idempotency_key, dos
        // llamadas idénticas SÍ crean dos borradores distintos — la garantía
        // solo aplica si el cliente manda la misma llave (ver handler).
        annotations: { title: 'Crear cotización (borrador)', readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
        scope: 'write',
        handler: async (args, ctx) => {
            const orgId = await getActiveOrgId();
            const idemKey = typeof args?.idempotency_key === 'string' ? args.idempotency_key.trim().slice(0, 200) : '';

            // Replay: si esta MISMA llave (key_id) ya usó este idempotency_key,
            // devuelve la respuesta guardada tal cual — sin tocar createCotizacion
            // de nuevo. Cubre el caso real que motivó esto: un cliente MCP que
            // reintenta tras un timeout de red sin saber si el primer intento
            // sí llegó a crear la cotización.
            // ⚠️ Ventana de carrera aceptada: dos llamadas con la MISMA llave
            // literalmente en paralelo (no secuenciales) podrían las dos pasar
            // el SELECT antes de que cualquiera termine de escribir — el índice
            // único en (key_id, idempotency_key) evita que la segunda fila se
            // duplique en mcp_idempotency, pero no evita una segunda
            // cotización si la carrera es así de ajustada. El caso que sí
            // resuelve al 100%, que es el real (retry después de esperar
            // respuesta/timeout), queda cubierto.
            if (idemKey) {
                const [existing] = await sql`
                    select response from mcp_idempotency
                    where key_id = ${ctx.keyId} and idempotency_key = ${idemKey}`;
                if (existing) return existing.response;
            }

            try {
                const r = await createCotizacion(orgId, {
                    cliente_id: args?.cliente_id || null,
                    notas: args?.notas || null,
                    items: Array.isArray(args?.items) ? args.items : [],
                    send: false,
                }, { origin: 'https://cordhq.app', ip: ctx.ip, actor: `mcp:${ctx.keyId}` });
                const result = { id: r.id, folio: r.folio, link_publico: `/q/${r.token}`, estado: 'borrador' };

                if (idemKey) {
                    // on conflict do nothing: si por la ventana de carrera de
                    // arriba dos llamadas llegan aquí a la vez, la segunda
                    // pierde el insert (silencioso) — su cotización de todos
                    // modos ya se creó, así que su respuesta sigue siendo
                    // válida para ELLA, solo no queda como "la" respuesta
                    // guardada para futuros replays (se queda con la primera).
                    await sql`
                        insert into mcp_idempotency (org_id, key_id, idempotency_key, tool, response)
                        values (${orgId}, ${ctx.keyId}, ${idemKey}, 'crear_cotizacion_borrador', ${JSON.stringify(result)}::jsonb)
                        on conflict (key_id, idempotency_key) do nothing`;
                }
                return result;
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

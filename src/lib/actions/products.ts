import { sql, withOrgTx } from '../db';
import { normVolumen } from '../queries';
import { requireResourceCapacity, resourceLimitError } from '../org-entitlements';
import { type ActionContext, type ActionOutcome, auditAction, done, fromResponse, isUuid } from './outcome';

export function cleanProductInput(input: Record<string, any>) {
    return {
        sku: String(input.sku ?? '').trim().toUpperCase() || null,
        nombre: String(input.nombre ?? '').trim(),
        unidad: String(input.unidad ?? '').trim() || 'pieza',
        descripcion: String(input.descripcion ?? '').trim() || null,
        precio: Math.max(0, Number(input.precio) || 0),
        costo: Math.max(0, Number(input.costo) || 0),
        activo: input.activo === undefined ? true : Boolean(input.activo),
        preciosVolumen: normVolumen(input.precios_volumen),
    };
}

const NOMBRE_OBLIGATORIO = done(400, { error: 'El nombre del producto es obligatorio', code: 'invalid_request' });
const NO_ENCONTRADO = done(404, { error: 'Producto no encontrado', code: 'not_found' });

export async function createProduct(ctx: ActionContext, input: Record<string, any>): Promise<ActionOutcome> {
    const p = cleanProductInput(input);
    if (!p.nombre) return NOMBRE_OBLIGATORIO;
    const capacityDenied = await requireResourceCapacity(ctx.orgId, 'products');
    if (capacityDenied) return fromResponse(capacityDenied);
    let row: any;
    try {
        [[row]] = await withOrgTx(ctx.orgId, sql`
            insert into productos (org_id, sku, nombre, unidad, descripcion, precio_lista, costo, activo, precios_volumen)
            values (${ctx.orgId}, ${p.sku}, ${p.nombre}, ${p.unidad}, ${p.descripcion}, ${p.precio}, ${p.costo}, ${p.activo}, ${JSON.stringify(p.preciosVolumen)})
            returning id`);
    } catch (error) {
        const limit = resourceLimitError(error);
        if (limit) return fromResponse(limit);
        return done(500, { error: 'No se pudo crear el producto.', code: 'server_error' });
    }
    await auditAction(ctx, 'producto.creado', 'producto', row.id as string, ctx.source === 'api' ? `${p.nombre} (vía API)` : p.nombre);
    return done(200, { id: row.id });
}

export async function updateProduct(ctx: ActionContext, id: string, input: Record<string, any>): Promise<ActionOutcome> {
    const p = cleanProductInput(input);
    if (!p.nombre) return NOMBRE_OBLIGATORIO;
    if (!isUuid(id)) return NO_ENCONTRADO;
    const [rows] = await withOrgTx(ctx.orgId, sql`
        update productos set
            sku = ${p.sku}, nombre = ${p.nombre}, unidad = ${p.unidad}, descripcion = ${p.descripcion},
            precio_lista = ${p.precio}, costo = ${p.costo}, activo = ${p.activo},
            precios_volumen = ${JSON.stringify(p.preciosVolumen)}
        where id = ${id} and org_id = ${ctx.orgId}
        returning id`);
    if (!rows.length) return NO_ENCONTRADO;
    return done(200, { ok: true });
}

export async function deleteProduct(ctx: ActionContext, id: string): Promise<ActionOutcome> {
    if (!isUuid(id)) return NO_ENCONTRADO;
    const [rows] = await withOrgTx(ctx.orgId, sql`delete from productos where id = ${id} and org_id = ${ctx.orgId} returning id, nombre`);
    if (!rows.length) return NO_ENCONTRADO;
    await auditAction(ctx, 'producto.eliminado', 'producto', id, rows[0].nombre as string);
    return done(200, { ok: true });
}

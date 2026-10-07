import { sql, withOrgTx } from '../db';
import { normVolumen } from '../queries';
import { TaxCatalogUnavailableError, taxCatalogFor } from '../impuestos-db';
import { requireResourceCapacity, resourceLimitError } from '../org-entitlements';
import { after } from '../after';
import { dispatchEvent } from '../webhooks';
import { productEventData, productPrevData } from '../event-payloads';
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
        // `null` = la tasa predeterminada de la organización. Fracción, no porcentaje.
        taxRate: input.tax_rate === undefined || input.tax_rate === null || input.tax_rate === ''
            ? null : Number(input.tax_rate),
    };
}

/**
 * Una tasa sugerida que no está en el catálogo del negocio no se guarda: el
 * editor la ofrecería en una línea y el servidor la rechazaría al cotizar.
 */
async function invalidTaxRate(orgId: string, rate: number | null): Promise<ActionOutcome | null> {
    if (rate === null) return null;
    if (!Number.isFinite(rate)) return TASA_INVALIDA;
    try {
        const catalog = await taxCatalogFor(orgId);
        return Number.isNaN(catalog.resolve(rate, Number.NaN)) ? TASA_INVALIDA : null;
    } catch (error) {
        if (error instanceof TaxCatalogUnavailableError) {
            return done(503, { error: 'No pudimos leer tu catálogo de impuestos. Intenta de nuevo en un momento.', code: 'service_unavailable' });
        }
        throw error;
    }
}

const NOMBRE_OBLIGATORIO = done(400, { error: 'El nombre del producto es obligatorio', code: 'invalid_request' });
const NO_ENCONTRADO = done(404, { error: 'Producto no encontrado', code: 'not_found' });
const TASA_INVALIDA = done(400, { error: 'Ese impuesto no está en tu catálogo. Revísalo en Ajustes › Impuestos.', code: 'invalid_request' });

export async function createProduct(ctx: ActionContext, input: Record<string, any>): Promise<ActionOutcome> {
    const p = cleanProductInput(input);
    if (!p.nombre) return NOMBRE_OBLIGATORIO;
    const taxDenied = await invalidTaxRate(ctx.orgId, p.taxRate);
    if (taxDenied) return taxDenied;
    const capacityDenied = await requireResourceCapacity(ctx.orgId, 'products');
    if (capacityDenied) return fromResponse(capacityDenied);
    let row: any;
    try {
        [[row]] = await withOrgTx(ctx.orgId, sql`
            insert into productos (org_id, sku, nombre, unidad, descripcion, precio_lista, costo, activo, precios_volumen, tax_rate)
            values (${ctx.orgId}, ${p.sku}, ${p.nombre}, ${p.unidad}, ${p.descripcion}, ${p.precio}, ${p.costo}, ${p.activo}, ${JSON.stringify(p.preciosVolumen)}, ${p.taxRate})
            returning *`);
    } catch (error) {
        const limit = resourceLimitError(error);
        if (limit) return fromResponse(limit);
        return done(500, { error: 'No se pudo crear el producto.', code: 'server_error' });
    }
    await auditAction(ctx, 'producto.creado', 'producto', row.id as string, ctx.source === 'api' ? `${p.nombre} (vía API)` : p.nombre);
    after(dispatchEvent(ctx.orgId, 'product.created', productEventData(row), ctx.actor));
    return done(200, { id: row.id });
}

export async function updateProduct(ctx: ActionContext, id: string, input: Record<string, any>): Promise<ActionOutcome> {
    const p = cleanProductInput(input);
    if (!p.nombre) return NOMBRE_OBLIGATORIO;
    if (!isUuid(id)) return NO_ENCONTRADO;
    const taxDenied = await invalidTaxRate(ctx.orgId, p.taxRate);
    if (taxDenied) return taxDenied;
    const [antes, rows] = await withOrgTx(ctx.orgId,
        sql`select precio_lista, activo from productos where id = ${id} and org_id = ${ctx.orgId}`,
        sql`
        update productos set
            sku = ${p.sku}, nombre = ${p.nombre}, unidad = ${p.unidad}, descripcion = ${p.descripcion},
            precio_lista = ${p.precio}, costo = ${p.costo}, activo = ${p.activo},
            precios_volumen = ${JSON.stringify(p.preciosVolumen)}, tax_rate = ${p.taxRate}
        where id = ${id} and org_id = ${ctx.orgId}
        returning *`);
    if (!rows.length) return NO_ENCONTRADO;
    after(dispatchEvent(ctx.orgId, 'product.updated', { ...productEventData(rows[0]), ...productPrevData(antes[0]) }, ctx.actor));
    return done(200, { ok: true });
}

export async function deleteProduct(ctx: ActionContext, id: string): Promise<ActionOutcome> {
    if (!isUuid(id)) return NO_ENCONTRADO;
    const [rows] = await withOrgTx(ctx.orgId, sql`delete from productos where id = ${id} and org_id = ${ctx.orgId} returning id, nombre`);
    if (!rows.length) return NO_ENCONTRADO;
    await auditAction(ctx, 'producto.eliminado', 'producto', id, rows[0].nombre as string);
    after(dispatchEvent(ctx.orgId, 'product.deleted', { id, object: 'product', nombre: rows[0].nombre }, ctx.actor));
    return done(200, { ok: true });
}

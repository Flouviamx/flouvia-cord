import { sql, withOrgTx } from '../db';
import { normVolumen } from '../queries';
import { TaxCatalogUnavailableError, taxCatalogFor } from '../impuestos-db';
import { isProductKey, isUnitKey, normalizeProductKey, normalizeUnitKey } from '../fiscal/sat-claves';
import { produtoNfeDe } from '../fiscal/latam/nfe/produto';
import { requireResourceCapacity, resourceLimitError } from '../org-entitlements';
import { after } from '../after';
import { dispatchEvent } from '../webhooks';
import { productEventData, productPrevData } from '../event-payloads';
import { type ActionContext, type ActionOutcome, auditAction, done, fromResponse, isUuid } from './outcome';

export function cleanProductInput(input: Record<string, any>) {
    // Brasil, NF-e: NCM, CFOP, origen, unidad y régimen del producto. `undefined`
    // = la petición no los trae y no se tocan; vacío = el producto deja de
    // declararse en NF-e (null).
    const nfe = input.nfe === undefined ? undefined : produtoNfeDe(input.nfe);
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
        // Claves SAT del CFDI (solo México). `null` = sin clasificar: el CFDI usa
        // los defaults del SAT.
        claveSat: normalizeProductKey(input.clave_sat),
        claveUnidadSat: normalizeUnitKey(input.clave_unidad_sat),
        nfe: nfe && nfe.ok ? nfe.valor : null,
        nfeError: nfe && !nfe.ok ? nfe.error : null,
        // Francia: bien (`goods`) o prestación de servicios (`services`). De
        // aquí sale la categoría de la operación de la factura (BT-23) y qué
        // cobros se reportan. `null` = sin declarar.
        naturaleza: input.naturaleza === 'goods' || input.naturaleza === 'services' ? input.naturaleza as 'goods' | 'services' : null,
        // Un campo que no viene en la petición NO se toca al actualizar: la
        // pantalla solo muestra el impuesto si hay más de una tasa y las claves
        // SAT si el negocio factura en México, y omitirlos no puede borrarlos.
        provided: {
            taxRate: input.tax_rate !== undefined,
            claveSat: input.clave_sat !== undefined,
            claveUnidadSat: input.clave_unidad_sat !== undefined,
            nfe: nfe !== undefined,
            naturaleza: input.naturaleza !== undefined,
        },
    };
}

function invalidSatKeys(p: ReturnType<typeof cleanProductInput>): ActionOutcome | null {
    if (p.claveSat !== null && !isProductKey(p.claveSat)) {
        return done(400, { error: 'La clave de producto o servicio del SAT tiene 8 dígitos (por ejemplo 81111500).', code: 'invalid_request' });
    }
    if (p.claveUnidadSat !== null && !isUnitKey(p.claveUnidadSat)) {
        return done(400, { error: 'La clave de unidad del SAT tiene de 1 a 3 letras o números (por ejemplo H87 o E48).', code: 'invalid_request' });
    }
    if (p.nfeError) return done(400, { error: p.nfeError, code: 'invalid_request', field: 'nfe' });
    return null;
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
    const satDenied = invalidSatKeys(p);
    if (satDenied) return satDenied;
    const taxDenied = await invalidTaxRate(ctx.orgId, p.taxRate);
    if (taxDenied) return taxDenied;
    const capacityDenied = await requireResourceCapacity(ctx.orgId, 'products');
    if (capacityDenied) return fromResponse(capacityDenied);
    let row: any;
    try {
        [[row]] = await withOrgTx(ctx.orgId, sql`
            insert into productos (org_id, sku, nombre, unidad, descripcion, precio_lista, costo, activo, precios_volumen, tax_rate,
                                   clave_sat, clave_unidad_sat, naturaleza, nfe)
            values (${ctx.orgId}, ${p.sku}, ${p.nombre}, ${p.unidad}, ${p.descripcion}, ${p.precio}, ${p.costo}, ${p.activo}, ${JSON.stringify(p.preciosVolumen)}, ${p.taxRate},
                    ${p.claveSat}, ${p.claveUnidadSat}, ${p.naturaleza}, ${p.nfe ? JSON.stringify(p.nfe) : null}::jsonb)
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
    const satDenied = invalidSatKeys(p);
    if (satDenied) return satDenied;
    const taxDenied = await invalidTaxRate(ctx.orgId, p.taxRate);
    if (taxDenied) return taxDenied;
    const [antes, rows] = await withOrgTx(ctx.orgId,
        sql`select precio_lista, activo from productos where id = ${id} and org_id = ${ctx.orgId}`,
        sql`
        update productos set
            sku = ${p.sku}, nombre = ${p.nombre}, unidad = ${p.unidad}, descripcion = ${p.descripcion},
            precio_lista = ${p.precio}, costo = ${p.costo}, activo = ${p.activo},
            precios_volumen = ${JSON.stringify(p.preciosVolumen)},
            tax_rate = case when ${p.provided.taxRate} then ${p.taxRate}::numeric else tax_rate end,
            clave_sat = case when ${p.provided.claveSat} then ${p.claveSat}::text else clave_sat end,
            clave_unidad_sat = case when ${p.provided.claveUnidadSat} then ${p.claveUnidadSat}::text else clave_unidad_sat end,
            naturaleza = case when ${p.provided.naturaleza} then ${p.naturaleza}::text else naturaleza end,
            nfe = case when ${p.provided.nfe} then ${p.nfe ? JSON.stringify(p.nfe) : null}::jsonb else nfe end
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

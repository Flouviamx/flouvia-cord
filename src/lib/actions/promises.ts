import { sql, withOrgTx } from '../db';
import { invalidateMoneyCaches } from '../queries';
import { type ActionContext, type ActionOutcome, auditAction, done, isUuid } from './outcome';

const ESTADOS = new Set(['pendiente', 'cumplida', 'incumplida']);
const NO_ENCONTRADA = done(404, { error: 'Promesa no encontrada', code: 'not_found' });

export async function createPromise(ctx: ActionContext, input: Record<string, any>): Promise<ActionOutcome> {
    const cotizacionId = String(input.cotizacion_id ?? '').trim();
    const fecha = String(input.fecha_promesa ?? '').trim();
    if (!cotizacionId) return done(400, { error: 'Falta la cotización', code: 'invalid_request' });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return done(400, { error: 'Elige la fecha en que el cliente promete pagar', code: 'invalid_request' });
    const monto = input.monto != null && input.monto !== '' ? Math.max(0, Number(input.monto) || 0) : null;
    const nota = String(input.nota ?? '').trim().slice(0, 400) || null;

    const [own] = isUuid(cotizacionId)
        ? await withOrgTx(ctx.orgId, sql`select id from cotizaciones where id = ${cotizacionId} and org_id = ${ctx.orgId}`)
        : [[]];
    if (!own.length) return done(404, { error: 'Cotización no encontrada', code: 'not_found' });

    const [[row]] = await withOrgTx(ctx.orgId, sql`
        insert into promesas_pago (org_id, cotizacion_id, fecha_promesa, monto, nota)
        values (${ctx.orgId}, ${cotizacionId}, ${fecha}, ${monto}, ${nota})
        returning id`);
    await auditAction(ctx, 'promesa.creada', 'cotizacion', cotizacionId, `Promesa de pago para ${fecha}`);
    invalidateMoneyCaches(ctx.orgId);
    return done(200, { id: row.id });
}

export async function setPromiseState(ctx: ActionContext, id: string, estado: string): Promise<ActionOutcome> {
    if (!ESTADOS.has(estado)) return done(400, { error: 'Estado inválido', code: 'invalid_request' });
    if (!isUuid(id)) return NO_ENCONTRADA;
    const [rows] = await withOrgTx(ctx.orgId, sql`update promesas_pago set estado = ${estado} where id = ${id} and org_id = ${ctx.orgId} returning id`);
    if (!rows.length) return NO_ENCONTRADA;
    invalidateMoneyCaches(ctx.orgId);
    return done(200, { ok: true });
}

export async function deletePromise(ctx: ActionContext, id: string): Promise<ActionOutcome> {
    if (!isUuid(id)) return NO_ENCONTRADA;
    const [rows] = await withOrgTx(ctx.orgId, sql`delete from promesas_pago where id = ${id} and org_id = ${ctx.orgId} returning id`);
    if (!rows.length) return NO_ENCONTRADA;
    invalidateMoneyCaches(ctx.orgId);
    return done(200, { ok: true });
}

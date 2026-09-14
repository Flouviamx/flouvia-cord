import { sql, withOrgTx } from '../db';
import { currentLocale } from '../context';
import { t } from '../../i18n/app';
import { type ActionContext, type ActionOutcome, done, isUuid } from './outcome';

export const TASK_PERMISSIONS = ['cotizar', 'cobranza', 'clientes'] as const;

const noEncontrada = () => done(404, { error: t(currentLocale(), 'err.tarea.no_encontrada'), code: 'not_found' });

export async function createTask(ctx: ActionContext, input: Record<string, any>): Promise<ActionOutcome> {
    const titulo = String(input.titulo ?? '').trim();
    if (!titulo) return done(400, { error: t(currentLocale(), 'err.tarea.vacia'), code: 'invalid_request' });
    const due = input.due_date ? String(input.due_date) : null;
    if (due && !/^\d{4}-\d{2}-\d{2}$/.test(due)) return done(400, { error: t(currentLocale(), 'err.tarea.fecha'), code: 'invalid_request' });
    const cotizacionId = input.cotizacion_id ? String(input.cotizacion_id) : null;
    if (cotizacionId) {
        const [own] = isUuid(cotizacionId)
            ? await withOrgTx(ctx.orgId, sql`select id from cotizaciones where id = ${cotizacionId} and org_id = ${ctx.orgId}`)
            : [[]];
        if (!own.length) return done(404, { error: 'Cotización no encontrada', code: 'not_found' });
    }
    const [[row]] = await withOrgTx(ctx.orgId, sql`
        insert into tareas (org_id, cotizacion_id, titulo, due_date)
        values (${ctx.orgId}, ${cotizacionId}, ${titulo.slice(0, 200)}, ${due})
        returning id`);
    return done(200, { id: row.id });
}

export async function setTaskDone(ctx: ActionContext, id: string, isDone: boolean): Promise<ActionOutcome> {
    if (!isUuid(id)) return noEncontrada();
    const [rows] = await withOrgTx(ctx.orgId, sql`update tareas set done = ${isDone} where id = ${id} and org_id = ${ctx.orgId} returning id`);
    if (!rows.length) return noEncontrada();
    return done(200, { ok: true });
}

export async function deleteTask(ctx: ActionContext, id: string): Promise<ActionOutcome> {
    if (!isUuid(id)) return noEncontrada();
    const [rows] = await withOrgTx(ctx.orgId, sql`delete from tareas where id = ${id} and org_id = ${ctx.orgId} returning id`);
    if (!rows.length) return noEncontrada();
    return done(200, { ok: true });
}

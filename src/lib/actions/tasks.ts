import { sql, withOrgTx } from '../db';
import { currentLocale } from '../context';
import { t } from '../../i18n/app';
import { after } from '../after';
import { dispatchEvent } from '../webhooks';
import { taskEventData } from '../event-payloads';
import { TASK_NOTES_MAX, TASK_TITLE_MAX, isIsoDay, isTaskPriority } from '../tasks';
import { type ActionContext, type ActionOutcome, done, isUuid } from './outcome';

export const TASK_PERMISSIONS = ['cotizar', 'cobranza', 'clientes'] as const;

const noEncontrada = () => done(404, { error: t(currentLocale(), 'err.tarea.no_encontrada'), code: 'not_found' });
const invalida = (key: 'err.tarea.vacia' | 'err.tarea.fecha' | 'err.tarea.responsable' | 'err.tarea.prioridad') =>
    done(400, { error: t(currentLocale(), key), code: 'invalid_request' });

/** El responsable tiene que ser un miembro ACTIVO de la organización, no cualquier uuid. */
async function isActiveMember(orgId: string, userId: string): Promise<boolean> {
    if (!isUuid(userId)) return false;
    const [rows] = await withOrgTx(orgId, sql`
        select 1 from org_members where org_id = ${orgId} and user_id = ${userId} and estado = 'activo' limit 1`);
    return rows.length > 0;
}

export async function createTask(ctx: ActionContext, input: Record<string, any>): Promise<ActionOutcome> {
    const titulo = String(input.titulo ?? '').trim();
    if (!titulo) return invalida('err.tarea.vacia');
    const due = input.due_date ? String(input.due_date) : null;
    if (due && !isIsoDay(due)) return invalida('err.tarea.fecha');
    const prioridad = input.prioridad == null || input.prioridad === '' ? 'normal' : input.prioridad;
    if (!isTaskPriority(prioridad)) return invalida('err.tarea.prioridad');
    const notas = input.notas ? String(input.notas).trim().slice(0, TASK_NOTES_MAX) : null;
    let asignado = input.asignado_a ? String(input.asignado_a) : null;
    if (asignado && !(await isActiveMember(ctx.orgId, asignado))) return invalida('err.tarea.responsable');
    // Una tarea capturada sin elegir responsable (cuenta de una persona, quick-add)
    // es de quien la escribe — si es miembro activo; si no, queda sin dueño.
    if (!asignado && input.asignar_a_creador === true && isUuid(ctx.userId) && await isActiveMember(ctx.orgId, ctx.userId)) {
        asignado = ctx.userId;
    }
    const cotizacionId = input.cotizacion_id ? String(input.cotizacion_id) : null;
    if (cotizacionId) {
        const [own] = isUuid(cotizacionId)
            ? await withOrgTx(ctx.orgId, sql`select id from cotizaciones where id = ${cotizacionId} and org_id = ${ctx.orgId}`)
            : [[]];
        if (!own.length) return done(404, { error: 'Cotización no encontrada', code: 'not_found' });
    }
    const creadoPor = isUuid(ctx.userId) ? ctx.userId : null;
    const [[row]] = await withOrgTx(ctx.orgId, sql`
        insert into tareas (org_id, cotizacion_id, titulo, due_date, prioridad, notas, asignado_a, creado_por)
        values (${ctx.orgId}, ${cotizacionId}, ${titulo.slice(0, TASK_TITLE_MAX)}, ${due}, ${prioridad},
                ${notas || null}, ${asignado}, ${creadoPor})
        returning *`);
    after(dispatchEvent(ctx.orgId, 'task.created', taskEventData(row), ctx.actor));
    return done(200, { id: row.id });
}

/**
 * Edición parcial: solo cambia lo que viene en `input`. `due_date: null` quita
 * la fecha y `asignado_a: null` la deja sin responsable. Reprogramar limpia la
 * marca del recordatorio: la tarea pospuesta vuelve a avisar en su nueva fecha.
 */
export async function updateTask(ctx: ActionContext, id: string, input: Record<string, any>): Promise<ActionOutcome> {
    if (!isUuid(id)) return noEncontrada();
    const has = (k: string) => Object.prototype.hasOwnProperty.call(input, k);

    const setTitulo = has('titulo');
    const titulo = setTitulo ? String(input.titulo ?? '').trim().slice(0, TASK_TITLE_MAX) : '';
    if (setTitulo && !titulo) return invalida('err.tarea.vacia');

    const setDue = has('due_date');
    const due = setDue && input.due_date ? String(input.due_date) : null;
    if (due && !isIsoDay(due)) return invalida('err.tarea.fecha');

    const setPrioridad = has('prioridad');
    if (setPrioridad && !isTaskPriority(input.prioridad)) return invalida('err.tarea.prioridad');
    const prioridad = setPrioridad ? input.prioridad : 'normal';

    const setNotas = has('notas');
    const notas = setNotas && input.notas ? String(input.notas).trim().slice(0, TASK_NOTES_MAX) : null;

    const setAsignado = has('asignado_a');
    const asignado = setAsignado && input.asignado_a ? String(input.asignado_a) : null;
    if (asignado && !(await isActiveMember(ctx.orgId, asignado))) return invalida('err.tarea.responsable');

    if (!setTitulo && !setDue && !setPrioridad && !setNotas && !setAsignado) return done(200, { ok: true });

    const [rows] = await withOrgTx(ctx.orgId, sql`
        update tareas set
            titulo       = case when ${setTitulo} then ${titulo} else titulo end,
            due_date     = case when ${setDue} then ${due}::date else due_date end,
            recordada_el = case when ${setDue} and due_date is distinct from ${due}::date then null else recordada_el end,
            prioridad    = case when ${setPrioridad} then ${prioridad} else prioridad end,
            notas        = case when ${setNotas} then ${notas || null} else notas end,
            asignado_a   = case when ${setAsignado} then ${asignado}::uuid else asignado_a end
         where id = ${id} and org_id = ${ctx.orgId}
        returning id`);
    if (!rows.length) return noEncontrada();
    return done(200, { ok: true });
}

export async function setTaskDone(ctx: ActionContext, id: string, isDone: boolean): Promise<ActionOutcome> {
    if (!isUuid(id)) return noEncontrada();
    const by = isUuid(ctx.userId) ? ctx.userId : null;
    const [changed, exists] = await withOrgTx(ctx.orgId,
        sql`update tareas set done = ${isDone},
                   completed_at = case when ${isDone} then now() else null end,
                   completed_by = case when ${isDone} then ${by}::uuid else null end
             where id = ${id} and org_id = ${ctx.orgId} and done is distinct from ${isDone}
            returning *`,
        sql`select id from tareas where id = ${id} and org_id = ${ctx.orgId}`);
    if (!exists.length) return noEncontrada();
    if (isDone && changed.length) after(dispatchEvent(ctx.orgId, 'task.completed', taskEventData(changed[0]), ctx.actor));
    return done(200, { ok: true });
}

export async function deleteTask(ctx: ActionContext, id: string): Promise<ActionOutcome> {
    if (!isUuid(id)) return noEncontrada();
    const [rows] = await withOrgTx(ctx.orgId, sql`delete from tareas where id = ${id} and org_id = ${ctx.orgId} returning id`);
    if (!rows.length) return noEncontrada();
    return done(200, { ok: true });
}

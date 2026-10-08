// Tareas — read-model de servidor. Lo consumen el widget del Inicio, la página
// /app/tareas y su fragmento (/app/tareas/lista), así que las tres superficies
// muestran la MISMA tarea con el mismo vencimiento, responsable y referencia.
//
// "Hoy" es el día civil del negocio (`orgs.zona_horaria`, regla 24), y las
// fechas `date` se leen como texto ISO con `to_char`: convertirlas a `Date`
// las vuelve medianoche UTC y en América se mostraban un día antes.

import { sql, getActiveOrgId, withOrgTx } from './db';
import { currentLocale, currentTimeZone, currentUserId } from './context';
import { intlLocale } from './fmt-server';
import { todayInZone } from './report-scope';
import { t, type AppStringKey } from '../i18n/app';
import { TASK_LIST_MAX, dayDiff, taskBucket, type TaskBucket, type TaskPriority, type TaskScope, type TaskState } from './tasks';

export interface TaskPerson { id: string; nombre: string; inicial: string }

export interface TaskRef {
    tipo: 'cotizacion' | 'factura';
    id: string;
    label: string;
    href: string;
    cliente: string | null;
}

export interface TaskItem {
    id: string;
    titulo: string;
    notas: string;
    prioridad: TaskPriority;
    /** yyyy-mm-dd o null. */
    due: string | null;
    dueLabel: string;
    bucket: TaskBucket;
    ref: TaskRef | null;
    asignado: TaskPerson | null;
    esMia: boolean;
    done: boolean;
    /** "Completada por Ana · 7 oct" (solo completadas). */
    completedLabel: string;
}

export interface TaskCounts { vencidas: number; hoy: number; pendientes: number; mias: number; sinAsignar: number }

/** `total` cuenta lo que hay en la vista (estado + responsable), no sólo lo que cupo en `limit`. */
export interface TaskListResult { items: TaskItem[]; total: number; limit: number; counts: TaskCounts; today: string }

const initials = (nombre: string) =>
    nombre.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '—';

/** Día civil de HOY en la zona del negocio. */
export function orgToday(): string {
    return todayInZone(currentTimeZone());
}

function civilLabel(iso: string, withYear: boolean): string {
    const [y, m, d] = iso.split('-').map(Number);
    // timeZone UTC a propósito: es un día civil, no un instante.
    return new Intl.DateTimeFormat(intlLocale(), {
        day: 'numeric', month: 'short', ...(withYear ? { year: 'numeric' } : {}), timeZone: 'UTC',
    }).format(new Date(Date.UTC(y, m - 1, d))).replace('.', '');
}

function weekdayLabel(iso: string): string {
    const [y, m, d] = iso.split('-').map(Number);
    const s = new Intl.DateTimeFormat(intlLocale(), { weekday: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, d)));
    return s.charAt(0).toUpperCase() + s.slice(1);
}

/** "Venció hace 3 días" · "Hoy" · "Mañana" · "Jueves" · "9 oct". */
export function dueLabel(due: string | null, today: string): string {
    const L = currentLocale();
    if (!due) return '';
    const diff = dayDiff(today, due);
    if (diff === -1) return t(L, 'tareas.due.ayer');
    if (diff < 0) return t(L, 'tareas.due.hace').replace('{n}', String(-diff));
    if (diff === 0) return t(L, 'tareas.due.hoy');
    if (diff === 1) return t(L, 'tareas.due.manana');
    if (diff <= 6) return weekdayLabel(due);
    return civilLabel(due, due.slice(0, 4) !== today.slice(0, 4));
}

export function bucketLabel(bucket: TaskBucket): string {
    return t(currentLocale(), `tareas.grupo.${bucket}` as AppStringKey);
}

export interface ListTasksOptions { estado?: TaskState; scope?: TaskScope; limit?: number }

export async function listTasks(opts: ListTasksOptions = {}): Promise<TaskListResult> {
    const estado = opts.estado ?? 'pendientes';
    const scope = opts.scope ?? 'todas';
    const limit = Math.max(1, Math.min(TASK_LIST_MAX, opts.limit ?? 100));
    const orgId = await getActiveOrgId();
    const me = currentUserId();
    const today = orgToday();
    const done = estado === 'completadas';
    const mias = scope === 'mias';
    const sinAsignar = scope === 'sin_asignar';

    const [rows, [countRow]] = await withOrgTx(orgId,
        sql`
        select t.id, t.titulo, coalesce(t.notas, '') as notas, t.prioridad, t.done,
               to_char(t.due_date, 'YYYY-MM-DD') as due,
               to_char(t.completed_at, 'YYYY-MM-DD') as completed_day,
               t.asignado_a, coalesce(ma.nombre, ma.email) as asignado_nombre,
               coalesce(mc.nombre, mc.email) as completo_nombre,
               t.cotizacion_id, c.folio as cot_folio, clc.empresa as cot_cliente,
               t.documento_id, d.invoice_number as doc_folio, coalesce(cld.empresa, clq.empresa) as doc_cliente
        from tareas t
        left join org_members ma on ma.org_id = t.org_id and ma.user_id = t.asignado_a
        left join org_members mc on mc.org_id = t.org_id and mc.user_id = t.completed_by
        left join cotizaciones c on c.id = t.cotizacion_id and c.org_id = t.org_id
        left join clientes clc on clc.id = c.cliente_id
        left join documentos_fiscales d on d.id = t.documento_id and d.org_id = t.org_id
        left join cotizaciones cd on cd.id = d.cotizacion_id
        left join clientes cld on cld.id = d.cliente_id
        left join clientes clq on clq.id = cd.cliente_id
        where t.org_id = ${orgId} and t.done = ${done}
          and (not ${mias} or t.asignado_a = ${me})
          and (not ${sinAsignar} or t.asignado_a is null)
        order by
          case when ${done} then t.completed_at end desc nulls last,
          t.due_date asc nulls last,
          case when t.prioridad = 'alta' then 0 else 1 end,
          t.created_at asc
        limit ${limit}`,
        sql`
        select
          count(*) filter (where not t.done and t.due_date < ${today}::date)::int as vencidas,
          count(*) filter (where not t.done and t.due_date = ${today}::date)::int as hoy,
          count(*) filter (where not t.done)::int as pendientes,
          count(*) filter (where not t.done and t.asignado_a = ${me})::int as mias,
          count(*) filter (where not t.done and t.asignado_a is null)::int as sin_asignar,
          count(*) filter (where t.done = ${done}
                             and (not ${mias} or t.asignado_a = ${me})
                             and (not ${sinAsignar} or t.asignado_a is null))::int as en_vista
        from tareas t
        where t.org_id = ${orgId}`,
    );

    const L = currentLocale();
    const items: TaskItem[] = rows.map((r) => {
        const due = (r.due as string) || null;
        let ref: TaskRef | null = null;
        if (r.documento_id) {
            ref = {
                tipo: 'factura', id: r.documento_id as string,
                label: (r.doc_folio as string) || t(L, 'tareas.ref.factura'),
                href: `/app/facturas/${r.documento_id}`, cliente: (r.doc_cliente as string) ?? null,
            };
        } else if (r.cotizacion_id && r.cot_folio) {
            ref = {
                tipo: 'cotizacion', id: r.cotizacion_id as string, label: r.cot_folio as string,
                href: `/app/cotizaciones/${r.cotizacion_id}`, cliente: (r.cot_cliente as string) ?? null,
            };
        }
        const asignadoNombre = (r.asignado_nombre as string) || '';
        const completedDay = (r.completed_day as string) || '';
        const completo = (r.completo_nombre as string) || '';
        return {
            id: r.id as string,
            titulo: r.titulo as string,
            notas: r.notas as string,
            prioridad: (r.prioridad === 'alta' ? 'alta' : 'normal') as TaskPriority,
            due,
            dueLabel: dueLabel(due, today),
            bucket: taskBucket(due, today),
            ref,
            asignado: r.asignado_a && asignadoNombre
                ? { id: r.asignado_a as string, nombre: asignadoNombre, inicial: initials(asignadoNombre) }
                : null,
            esMia: !!me && r.asignado_a === me,
            done: r.done === true,
            completedLabel: done && completedDay
                ? [completo ? t(L, 'tareas.completada_por').replace('{nombre}', completo) : t(L, 'tareas.completada'),
                   civilLabel(completedDay, completedDay.slice(0, 4) !== today.slice(0, 4))].join(' · ')
                : '',
        };
    });

    return {
        items,
        total: Number(countRow?.en_vista ?? items.length),
        limit,
        today,
        counts: {
            vencidas: Number(countRow?.vencidas ?? 0),
            hoy: Number(countRow?.hoy ?? 0),
            pendientes: Number(countRow?.pendientes ?? 0),
            mias: Number(countRow?.mias ?? 0),
            sinAsignar: Number(countRow?.sin_asignar ?? 0),
        },
    };
}

/** Miembros activos a los que se les puede asignar una tarea (tienen cuenta). */
export async function taskAssignees(): Promise<(TaskPerson & { esYo: boolean })[]> {
    const orgId = await getActiveOrgId();
    const me = currentUserId();
    const [rows] = await withOrgTx(orgId, sql`
        select user_id, coalesce(nullif(nombre, ''), email) as nombre
        from org_members
        where org_id = ${orgId} and estado = 'activo' and user_id is not null
        order by case when user_id = ${me} then 0 else 1 end, coalesce(nullif(nombre, ''), email)`);
    return rows.map((r) => ({
        id: r.user_id as string,
        nombre: r.nombre as string,
        inicial: initials(r.nombre as string),
        esYo: !!me && r.user_id === me,
    }));
}

/**
 * Badge de la sidebar: lo que pide atención HOY y es de quien mira (suyo o sin
 * dueño). Las tareas de otra persona no le encienden el contador a nadie más.
 */
export async function taskBadge(): Promise<{ n: number; vencidas: number }> {
    const orgId = await getActiveOrgId();
    const me = currentUserId();
    const today = orgToday();
    const [[r]] = await withOrgTx(orgId, sql`
        select count(*)::int as n,
               count(*) filter (where due_date < ${today}::date)::int as vencidas
        from tareas
        where org_id = ${orgId} and done = false and due_date <= ${today}::date
          and (asignado_a is null or asignado_a = ${me})`);
    return { n: Number(r?.n ?? 0), vencidas: Number(r?.vencidas ?? 0) };
}

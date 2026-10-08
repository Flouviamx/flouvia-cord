// Tareas — reglas PURAS de fecha y agrupación (sin DOM ni base de datos).
//
// Las consume el servidor (src/lib/tasks-db.ts arma la lista) y el navegador
// (TaskBoard.astro calcula los atajos "Hoy / Mañana / Lunes"). Las dos puntas
// trabajan con el DÍA CIVIL del negocio en ISO (yyyy-mm-dd), nunca con
// `new Date(iso)`: eso parsea como UTC y al oeste de Greenwich cae en el día
// anterior. Antes "vencida" se decidía con `new Date(due) < new Date(hoy del
// servidor)`, así que en la noche de Ciudad de México una tarea de hoy ya salía
// vencida porque en UTC era mañana.

export const TASK_PRIORITIES = ['normal', 'alta'] as const;
export type TaskPriority = typeof TASK_PRIORITIES[number];

export const TASK_SCOPES = ['mias', 'todas', 'sin_asignar'] as const;
export type TaskScope = typeof TASK_SCOPES[number];

export const TASK_STATES = ['pendientes', 'completadas'] as const;
export type TaskState = typeof TASK_STATES[number];

/** Orden de los grupos en pantalla: lo urgente arriba, lo que no tiene fecha al final. */
export const TASK_BUCKETS = ['vencidas', 'hoy', 'manana', 'semana', 'despues', 'sin_fecha'] as const;
export type TaskBucket = typeof TASK_BUCKETS[number];

export const TASK_TITLE_MAX = 200;
export const TASK_NOTES_MAX = 2000;

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** yyyy-mm-dd real (rechaza 2026-02-31, que `Date` convertiría en marzo sin avisar). */
export function isIsoDay(value: unknown): value is string {
    if (typeof value !== 'string') return false;
    const m = ISO_RE.exec(value);
    if (!m) return false;
    const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
    return d.getUTCFullYear() === Number(m[1]) && d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCDate() === Number(m[3]);
}

const toUtc = (iso: string) => {
    const m = ISO_RE.exec(iso)!;
    return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
};

export function addDays(iso: string, days: number): string {
    return new Date(toUtc(iso) + days * 86_400_000).toISOString().slice(0, 10);
}

/** Días de `a` a `b` (positivo si `b` es posterior). */
export function dayDiff(a: string, b: string): number {
    return Math.round((toUtc(b) - toUtc(a)) / 86_400_000);
}

/** 0 = lunes … 6 = domingo. */
export function weekdayMon0(iso: string): number {
    return (new Date(toUtc(iso)).getUTCDay() + 6) % 7;
}

/** El próximo lunes ESTRICTO: desde un lunes es el de la semana siguiente. */
export function nextMonday(today: string): string {
    return addDays(today, 7 - weekdayMon0(today));
}

export type DueShortcut = 'hoy' | 'manana' | 'lunes' | 'semana';

/** Fechas de los atajos del capturador y de "Posponer". */
export function dueShortcut(kind: DueShortcut, today: string): string {
    switch (kind) {
        case 'hoy': return today;
        case 'manana': return addDays(today, 1);
        case 'lunes': return nextMonday(today);
        case 'semana': return addDays(today, 7);
    }
}

export function taskBucket(due: string | null | undefined, today: string): TaskBucket {
    if (!due || !isIsoDay(due)) return 'sin_fecha';
    const diff = dayDiff(today, due);
    if (diff < 0) return 'vencidas';
    if (diff === 0) return 'hoy';
    if (diff === 1) return 'manana';
    if (diff <= 7) return 'semana';
    return 'despues';
}

/** Lo que la vista agrupa: cualquier objeto con su bucket. Mantiene el orden de entrada dentro de cada grupo. */
export function groupTasks<T extends { bucket: TaskBucket }>(items: T[]): { bucket: TaskBucket; items: T[] }[] {
    return TASK_BUCKETS
        .map((bucket) => ({ bucket, items: items.filter((it) => it.bucket === bucket) }))
        .filter((g) => g.items.length > 0);
}

export const isTaskPriority = (v: unknown): v is TaskPriority => (TASK_PRIORITIES as readonly unknown[]).includes(v);
export const isTaskScope = (v: unknown): v is TaskScope => (TASK_SCOPES as readonly unknown[]).includes(v);
export const isTaskState = (v: unknown): v is TaskState => (TASK_STATES as readonly unknown[]).includes(v);

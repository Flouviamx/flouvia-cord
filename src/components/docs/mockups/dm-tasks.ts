// Datos de demo de Tareas, compartidos por DmTasksPage (/app/tareas) y
// DmTasksWidget (el widget del Inicio): las dos superficies leen las MISMAS
// tareas, como en la app, donde las tres (widget, página y fragmento) salen de
// listTasks().
//
// La agrupación y el vencimiento NO se copian a mano: se calculan con las reglas
// puras reales de src/lib/tasks.ts (taskBucket, groupTasks, dayDiff) contra el
// "hoy" del universo de demo (dm-gestion.ts → TODAY, jueves 8 oct 2026). La
// etiqueta de fecha replica dueLabel() de src/lib/tasks-db.ts con los textos del
// diccionario real (tareas.due.*).
//
// Cuadre de los contadores de la página (counts de listTasks):
//   vencidas 2 · para hoy 3 · mías pendientes 5 (Ana Torres) · sin responsable 1.
// Badge de la sidebar (taskBadge): vencen hoy o antes y son mías o sin dueño = 3,
// una de ellas vencida → en rojo.
// No es un módulo de la app y no se registra en index.ts (solo toma Dm*.astro).

import { dayDiff, groupTasks, taskBucket, type TaskBucket, type TaskPriority } from '../../../lib/tasks';
import { TODAY, SELLER } from './dm-gestion';
import { dmMoney, dmT, initials, type DmLang } from './format';

export type DmPersonId = 'ana' | 'mariana' | 'carlos';

/** Miembros activos de Materiales del Valle (taskAssignees: quien mira va primero). */
export const PEOPLE: Record<DmPersonId, { nombre: string; esYo: boolean }> = {
    ana: { nombre: SELLER, esYo: true },
    mariana: { nombre: 'Mariana Ortega', esYo: false },
    carlos: { nombre: 'Carlos Ibarra', esYo: false },
};

type L10n = { es: string; en: string };

interface DmTaskSeed {
    titulo: L10n;
    notas?: L10n;
    prioridad: TaskPriority;
    /** yyyy-mm-dd o null. */
    due: string | null;
    ref?: { tipo: 'cotizacion' | 'factura'; label: string; cliente: string };
    asignado: DmPersonId | null;
}

// Orden de creación (created_at asc): listTasks ordena por fecha, luego prioridad alta, luego creación.
const SEEDS: DmTaskSeed[] = [
    {
        titulo: { es: `Responder contracargo de ${dmMoney(37120, 'MXN', 'es')}`, en: `Respond to the ${dmMoney(37120, 'MXN', 'en')} chargeback` },
        notas: { es: 'El banco pide el contrato firmado y la prueba de entrega antes del viernes.', en: 'The bank needs the signed contract and proof of delivery by Friday.' },
        prioridad: 'alta',
        due: '2026-10-06',
        ref: { tipo: 'cotizacion', label: 'COT-0153', cliente: 'Ferretera Industrial del Bajío' },
        asignado: 'ana',
    },
    {
        titulo: { es: 'Confirmar fecha de entrega con Raúl Mendoza', en: 'Confirm the delivery date with Raúl Mendoza' },
        prioridad: 'normal',
        due: '2026-10-07',
        ref: { tipo: 'cotizacion', label: 'COT-0144', cliente: 'Distribuidora El Zarco' },
        asignado: 'carlos',
    },
    {
        titulo: { es: 'Llamar a Luis Herrera: quiere revisar el flete a obra', en: 'Call Luis Herrera: he wants to review the site delivery fee' },
        prioridad: 'normal',
        due: '2026-10-08',
        ref: { tipo: 'cotizacion', label: 'COT-0149', cliente: 'Constructora Apex' },
        asignado: 'ana',
    },
    {
        titulo: { es: `Transferir reembolso SPEI por ${dmMoney(3500, 'MXN', 'es')}`, en: `Send the ${dmMoney(3500, 'MXN', 'en')} SPEI refund` },
        prioridad: 'normal',
        due: '2026-10-08',
        ref: { tipo: 'cotizacion', label: 'COT-0143', cliente: 'Acabados Monterrey' },
        asignado: 'mariana',
    },
    {
        titulo: { es: 'Revisar si aplica descuento por volumen', en: 'Check whether a volume discount applies' },
        prioridad: 'normal',
        due: '2026-10-08',
        ref: { tipo: 'cotizacion', label: 'COT-0151', cliente: 'Constructora GAMA' },
        asignado: null,
    },
    {
        titulo: { es: 'Llamar a cuentas por pagar de El Zarco por la factura vencida', en: "Call El Zarco's accounts payable about the overdue invoice" },
        prioridad: 'normal',
        due: '2026-10-09',
        ref: { tipo: 'factura', label: 'F-0042', cliente: 'Distribuidora El Zarco' },
        asignado: 'ana',
    },
    {
        titulo: { es: 'Enviar catálogo actualizado', en: 'Send the updated catalog' },
        notas: { es: 'Con los precios nuevos de varilla corrugada y block de concreto.', en: 'With the new prices for rebar and concrete block.' },
        prioridad: 'normal',
        due: '2026-10-13',
        asignado: 'ana',
    },
    {
        titulo: { es: 'Dar seguimiento a la propuesta enviada', en: 'Follow up on the sent proposal' },
        prioridad: 'normal',
        due: '2026-10-12',
        ref: { tipo: 'cotizacion', label: 'COT-0154', cliente: 'Grupo Edificador Norte' },
        asignado: 'carlos',
    },
    {
        titulo: { es: 'Actualizar precios de varilla corrugada en el catálogo', en: 'Update rebar prices in the catalog' },
        prioridad: 'normal',
        due: null,
        asignado: 'ana',
    },
];

export interface DmTask {
    titulo: string;
    notas: string;
    prioridad: TaskPriority;
    due: string | null;
    dueLabel: string;
    bucket: TaskBucket;
    ref: DmTaskSeed['ref'] | null;
    asignado: { nombre: string; inicial: string } | null;
    esMia: boolean;
}

const LOCALE: Record<DmLang, string> = { es: 'es-MX', en: 'en-US' };
const utc = (iso: string) => {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d));
};

/** Calca de dueLabel() (tasks-db.ts): "Venció hace 2 días" · "Hoy" · "Mañana" · "Lunes" · "15 oct". */
export function dmDueLabel(due: string | null, lang: DmLang, today = TODAY): string {
    if (!due) return '';
    const diff = dayDiff(today, due);
    if (diff === -1) return dmT(lang, 'tareas.due.ayer');
    if (diff < 0) return dmT(lang, 'tareas.due.hace').replace('{n}', String(-diff));
    if (diff === 0) return dmT(lang, 'tareas.due.hoy');
    if (diff === 1) return dmT(lang, 'tareas.due.manana');
    if (diff <= 6) {
        const s = new Intl.DateTimeFormat(LOCALE[lang], { weekday: 'long', timeZone: 'UTC' }).format(utc(due));
        return s.charAt(0).toUpperCase() + s.slice(1);
    }
    return new Intl.DateTimeFormat(LOCALE[lang], { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(utc(due)).replace('.', '');
}

/** Todas las tareas pendientes, ya resueltas al idioma y en el orden de listTasks(). */
export function dmTasks(lang: DmLang): DmTask[] {
    const items = SEEDS.map((s, i) => ({ s, i }));
    items.sort((a, b) => {
        const da = a.s.due ?? '9999-12-31';
        const db = b.s.due ?? '9999-12-31';
        if (da !== db) return da < db ? -1 : 1;
        const pa = a.s.prioridad === 'alta' ? 0 : 1;
        const pb = b.s.prioridad === 'alta' ? 0 : 1;
        return pa - pb || a.i - b.i;
    });
    return items.map(({ s }) => {
        const p = s.asignado ? PEOPLE[s.asignado] : null;
        return {
            titulo: s.titulo[lang],
            notas: s.notas?.[lang] ?? '',
            prioridad: s.prioridad,
            due: s.due,
            dueLabel: dmDueLabel(s.due, lang),
            bucket: taskBucket(s.due, TODAY),
            ref: s.ref ?? null,
            asignado: p ? { nombre: p.nombre, inicial: initials(p.nombre) } : null,
            esMia: !!p?.esYo,
        };
    });
}

export type DmTaskScope = 'mias' | 'todas' | 'sin_asignar';

/** Filtro por responsable + agrupación real (groupTasks). */
export function dmTaskGroups(lang: DmLang, scope: DmTaskScope) {
    const all = dmTasks(lang);
    const items = all.filter((t) => scope === 'todas' || (scope === 'mias' ? t.esMia : !t.asignado));
    return { groups: groupTasks(items), total: items.length };
}

/** Contadores de la página: siempre sobre TODAS las pendientes, como listTasks().counts. */
export function dmTaskCounts() {
    const all = dmTasks('es');
    return {
        vencidas: all.filter((t) => t.bucket === 'vencidas').length,
        hoy: all.filter((t) => t.bucket === 'hoy').length,
        pendientes: all.length,
        mias: all.filter((t) => t.esMia).length,
        sinAsignar: all.filter((t) => !t.asignado).length,
    };
}

/** Badge de la sidebar (taskBadge): vencen hoy o antes y son de quien mira o sin dueño. */
export function dmTaskBadge() {
    const mine = dmTasks('es').filter((t) => (t.bucket === 'vencidas' || t.bucket === 'hoy') && (t.esMia || !t.asignado));
    return { n: mine.length, vencidas: mine.filter((t) => t.bucket === 'vencidas').length };
}

/** "Ana Torres (yo)" del selector de responsable. */
export const yoLabel = (lang: DmLang) => dmT(lang, 'tareas.yo').replace('{nombre}', SELLER);

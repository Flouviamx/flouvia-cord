// Cálculo del siguiente tic de un workflow con disparador programado.
//
// La hora la elige el negocio y se interpreta en SU zona horaria (regla 24):
// "cada lunes a las 9" significa las 9 de Madrid para una cuenta en Madrid,
// no las 9 del servidor. Por eso nada de `new Date(y, m, d, h)`, que usaría la
// zona del proceso, ni de sumar 24 horas, que se rompe con el horario de verano
// (un día dura 23 o 25 horas dos veces al año).
//
// Funciones puras, sin base de datos: el cron y la publicación comparten esto y
// los tests lo cubren sin levantar nada.

export type ScheduleFreq = 'daily' | 'weekly' | 'monthly';

export interface Schedule {
    freq: ScheduleFreq;
    /** Hora local de la organización, 0-23. */
    hour: number;
    /** 1 = lunes … 7 = domingo. Solo para `weekly`. */
    weekday?: number;
    /** Día del mes, 1-28. Solo para `monthly`. */
    monthday?: number;
}

export const SCHEDULE_FREQS: ScheduleFreq[] = ['daily', 'weekly', 'monthly'];

/**
 * Tope de 28 a propósito: un "31" se salta febrero en silencio, y un aviso
 * mensual que no sale es peor que uno que sale tres días antes. Mismo criterio
 * que la recurrencia de facturas (regla 25).
 */
export const MAX_MONTHDAY = 28;

export function sanitizeSchedule(input: unknown): Schedule {
    const raw = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
    const freq = SCHEDULE_FREQS.includes(raw.freq as ScheduleFreq) ? (raw.freq as ScheduleFreq) : 'weekly';
    const hour = clamp(Math.floor(Number(raw.hour)), 0, 23, 9);
    const schedule: Schedule = { freq, hour };
    if (freq === 'weekly') schedule.weekday = clamp(Math.floor(Number(raw.weekday)), 1, 7, 1);
    if (freq === 'monthly') schedule.monthday = clamp(Math.floor(Number(raw.monthday)), 1, MAX_MONTHDAY, 1);
    return schedule;
}

const clamp = (v: number, min: number, max: number, fallback: number) =>
    (Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback);

interface LocalParts { year: number; month: number; day: number; hour: number; minute: number; second: number; weekday: number }

/** Descompone un instante en la hora de pared de `timeZone`. */
export function localParts(date: Date, timeZone: string): LocalParts {
    const fmt = new Intl.DateTimeFormat('en-US', {
        timeZone, hour12: false,
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit', weekday: 'short',
    });
    const parts: Record<string, string> = {};
    for (const p of fmt.formatToParts(date)) parts[p.type] = p.value;
    const DAYS: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
    return {
        year: Number(parts.year),
        month: Number(parts.month),
        day: Number(parts.day),
        // Medianoche sale como "24" en algunos runtimes con hour12:false.
        hour: Number(parts.hour) % 24,
        minute: Number(parts.minute),
        second: Number(parts.second),
        weekday: DAYS[parts.weekday] ?? 1,
    };
}

/**
 * Instante UTC de una hora de pared concreta en `timeZone`. Se resuelve con dos
 * pasadas: la primera estima el desfase y la segunda lo corrige, que es lo que
 * hace falta cuando el cambio de horario mueve el reloj entre una y otra.
 */
export function zonedTimeToUtc(year: number, month: number, day: number, hour: number, timeZone: string): Date {
    const target = Date.UTC(year, month - 1, day, hour, 0, 0);
    let instante = new Date(target);
    for (let i = 0; i < 2; i++) {
        const p = localParts(instante, timeZone);
        const visto = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
        const desfase = visto - instante.getTime();
        const corregido = new Date(target - desfase);
        if (corregido.getTime() === instante.getTime()) break;
        instante = corregido;
    }
    return instante;
}

const daysInMonth = (year: number, month: number) => new Date(Date.UTC(year, month, 0)).getUTCDate();

/**
 * Siguiente instante en que toca el tic, ESTRICTAMENTE posterior a `from`.
 * Devuelve null solo si la zona horaria no existe.
 */
export function nextScheduleAt(schedule: Schedule, timeZone: string, from: Date = new Date()): Date | null {
    const s = sanitizeSchedule(schedule);
    let base: LocalParts;
    try { base = localParts(from, timeZone); } catch { return null; }

    // 400 intentos cubren de sobra un salto mensual; el límite existe para que
    // una zona o un dato raro no cuelguen el cron en un while infinito.
    for (let i = 0; i < 400; i++) {
        const candidato = candidateDay(s, base, i);
        if (!candidato) continue;
        const instante = zonedTimeToUtc(candidato.year, candidato.month, candidato.day, s.hour, timeZone);
        // El cambio de horario puede dejar una hora inexistente (la 2 en el
        // salto de primavera): si la hora local no coincide, ese día se salta.
        const real = localParts(instante, timeZone);
        if (real.hour !== s.hour) continue;
        if (instante.getTime() > from.getTime()) return instante;
    }
    return null;
}

/** Día candidato número `i` a partir de la fecha local de hoy. */
function candidateDay(s: Schedule, base: LocalParts, i: number): { year: number; month: number; day: number } | null {
    if (s.freq === 'monthly') {
        const month0 = base.month - 1 + i;
        const year = base.year + Math.floor(month0 / 12);
        const month = (month0 % 12 + 12) % 12 + 1;
        const day = Math.min(s.monthday ?? 1, daysInMonth(year, month));
        return { year, month, day };
    }
    const dia = new Date(Date.UTC(base.year, base.month - 1, base.day + i));
    const year = dia.getUTCFullYear();
    const month = dia.getUTCMonth() + 1;
    const day = dia.getUTCDate();
    if (s.freq === 'weekly') {
        const weekday = dia.getUTCDay() === 0 ? 7 : dia.getUTCDay();
        if (weekday !== (s.weekday ?? 1)) return null;
    }
    return { year, month, day };
}

/** Datos que el evento del tic entrega al workflow. */
export function scheduleEventData(instante: Date, timeZone: string, locale: string) {
    const p = localParts(instante, timeZone);
    const iso = `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
    let diaSemana = '';
    try {
        diaSemana = new Intl.DateTimeFormat(locale, { timeZone, weekday: 'long' }).format(instante);
    } catch { /* locale inválido: se queda vacío en vez de reventar el tic */ }
    return { fecha: iso, dia_semana: diaSemana, hora: p.hour, dia_mes: p.day };
}

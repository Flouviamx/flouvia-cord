import { describe, expect, it } from 'vitest';
import { localParts, nextScheduleAt, sanitizeSchedule, zonedTimeToUtc } from '../src/lib/workflows/schedule';

const enZona = (d: Date, tz: string) => {
    const p = localParts(d, tz);
    return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')} ${String(p.hour).padStart(2, '0')}:00 (${p.weekday})`;
};

describe('sanitizeSchedule', () => {
    it('acota la hora, el día de la semana y el día del mes', () => {
        expect(sanitizeSchedule({ freq: 'daily', hour: 99 })).toEqual({ freq: 'daily', hour: 23 });
        expect(sanitizeSchedule({ freq: 'weekly', hour: -3, weekday: 9 })).toEqual({ freq: 'weekly', hour: 0, weekday: 7 });
        // 31 se topa en 28: un mensual "el 31" se salta febrero en silencio.
        expect(sanitizeSchedule({ freq: 'monthly', hour: 9, monthday: 31 })).toEqual({ freq: 'monthly', hour: 9, monthday: 28 });
    });

    it('un disparador sin datos cae en algo publicable, no en NaN', () => {
        expect(sanitizeSchedule(undefined)).toEqual({ freq: 'weekly', hour: 9, weekday: 1 });
        expect(sanitizeSchedule({ freq: 'anual', hour: 'tarde' })).toEqual({ freq: 'weekly', hour: 9, weekday: 1 });
    });
});

describe('nextScheduleAt', () => {
    it('la hora es la del negocio, no la del servidor', () => {
        const from = new Date('2026-09-20T12:00:00Z');
        const madrid = nextScheduleAt({ freq: 'daily', hour: 9 }, 'Europe/Madrid', from)!;
        const mexico = nextScheduleAt({ freq: 'daily', hour: 9 }, 'America/Mexico_City', from)!;
        // A las 12:00 UTC en Madrid ya son las 14:00 (el tic de hoy pasó) y en
        // México las 06:00 (todavía no llega). Misma consigna, días distintos.
        expect(enZona(madrid, 'Europe/Madrid')).toBe('2026-09-21 09:00 (1)');
        expect(enZona(mexico, 'America/Mexico_City')).toBe('2026-09-20 09:00 (7)');
        expect(mexico.getTime()).toBeGreaterThan(from.getTime());
    });

    it('semanal cae en el día elegido y nunca en el instante que ya pasó', () => {
        const from = new Date('2026-09-21T16:00:00Z'); // lunes
        const siguiente = nextScheduleAt({ freq: 'weekly', hour: 9, weekday: 1 }, 'America/Mexico_City', from)!;
        expect(enZona(siguiente, 'America/Mexico_City')).toBe('2026-09-28 09:00 (1)');
        expect(siguiente.getTime()).toBeGreaterThan(from.getTime());
    });

    it('mensual respeta el día y avanza al mes siguiente', () => {
        const from = new Date('2026-09-20T12:00:00Z');
        const uno = nextScheduleAt({ freq: 'monthly', hour: 8, monthday: 1 }, 'America/Mexico_City', from)!;
        expect(enZona(uno, 'America/Mexico_City')).toBe('2026-10-01 08:00 (4)');
        const siguiente = nextScheduleAt({ freq: 'monthly', hour: 8, monthday: 1 }, 'America/Mexico_City', uno)!;
        expect(enZona(siguiente, 'America/Mexico_City')).toBe('2026-11-01 08:00 (7)');
    });

    it('el cambio de horario no corre la hora ni duplica el tic', () => {
        // Madrid pasa a horario de invierno la madrugada del 25 de octubre de 2026.
        const antes = new Date('2026-10-23T12:00:00Z');
        const paso1 = nextScheduleAt({ freq: 'daily', hour: 9 }, 'Europe/Madrid', antes)!;
        const paso2 = nextScheduleAt({ freq: 'daily', hour: 9 }, 'Europe/Madrid', paso1)!;
        const paso3 = nextScheduleAt({ freq: 'daily', hour: 9 }, 'Europe/Madrid', paso2)!;
        expect(enZona(paso1, 'Europe/Madrid')).toBe('2026-10-24 09:00 (6)');
        expect(enZona(paso2, 'Europe/Madrid')).toBe('2026-10-25 09:00 (7)');
        expect(enZona(paso3, 'Europe/Madrid')).toBe('2026-10-26 09:00 (1)');
        // Entre el 24 y el 25 hay 25 horas reales: sumar 86400000 habría
        // corrido el aviso a las 8 de la mañana a partir de ese domingo.
        expect(paso2.getTime() - paso1.getTime()).toBe(25 * 3600000);
        expect(paso3.getTime() - paso2.getTime()).toBe(24 * 3600000);
    });

    it('una zona horaria inexistente devuelve null en vez de un instante inventado', () => {
        expect(nextScheduleAt({ freq: 'daily', hour: 9 }, 'Marte/Olympus')).toBeNull();
    });
});

describe('zonedTimeToUtc', () => {
    it('convierte la hora de pared al instante correcto en verano e invierno', () => {
        expect(zonedTimeToUtc(2026, 7, 15, 9, 'Europe/Madrid').toISOString()).toBe('2026-07-15T07:00:00.000Z');
        expect(zonedTimeToUtc(2026, 12, 15, 9, 'Europe/Madrid').toISOString()).toBe('2026-12-15T08:00:00.000Z');
    });
});

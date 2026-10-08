import { describe, expect, it } from 'vitest';
import { reqContext } from '../src/lib/context';
import { fmtCalendarDate, fmtDate } from '../src/lib/fmt-server';

// Una columna `date` (vencimiento, vigencia, prestación) llega del driver como
// la medianoche LOCAL del servidor. Formatearla como instante en la zona del
// negocio la corría un día hacia atrás en todo huso al oeste del servidor.
const enMexico = <T>(fn: () => T): T =>
    reqContext.run({ userId: null, locale: 'es', formatLocale: 'es-MX', timeZone: 'America/Mexico_City' }, fn);

describe('fmtCalendarDate', () => {
    it('no corre el día de una columna date al formatear en la zona del negocio', () => {
        const comoLlegaDelDriver = new Date(2026, 9, 7); // 7 oct, medianoche del servidor
        enMexico(() => {
            expect(fmtCalendarDate(comoLlegaDelDriver)).toBe('7 oct 2026');
            expect(fmtCalendarDate('2026-10-07')).toBe('7 oct 2026');
        });
    });

    it('acepta el ISO con hora sin reinterpretarlo', () => {
        enMexico(() => expect(fmtCalendarDate('2026-02-28T00:00:00')).toBe('28 feb 2026'));
    });

    it('vacío sigue siendo el guion de fmtDate', () => {
        expect(fmtCalendarDate(null)).toBe(fmtDate(null));
        expect(fmtCalendarDate('')).toBe('—');
    });
});

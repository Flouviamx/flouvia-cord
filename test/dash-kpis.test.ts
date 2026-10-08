import { describe, expect, it } from 'vitest';
import { deltaPct, deltaPts, sparkValues, totalsFor } from '../src/lib/dash-kpis';

const dia = (fecha: string, o: Partial<Record<string, number>> = {}) => ({
    fecha, cotizado: 0, cerrado: 0, cobrado: 0, enviadas: 0, ganadas: 0, ganadasCreadas: 0, ...o,
});

describe('KPIs del dashboard por rango', () => {
    const dias = [
        dia('2026-09-01', { enviadas: 4, ganadasCreadas: 1, cerrado: 1000, ganadas: 1, cobrado: 500 }),
        dia('2026-09-02', { enviadas: 6, ganadasCreadas: 3, cerrado: 3000, ganadas: 2, cobrado: 700 }),
        dia('2026-09-03', { enviadas: 0 }),
    ];

    it('la tasa es de la cohorte que salió en el rango y el ticket divide entre las ventas', () => {
        const t = totalsFor(dias, '2026-09-01', '2026-09-03');
        expect(t.tasa).toBe(40);
        expect(t.ticket).toBe(4000 / 3);
        expect(t.cobrado).toBe(1200);
    });

    it('sin envíos ni ventas no inventa 0%: devuelve null', () => {
        const t = totalsFor(dias, '2026-09-03', '2026-09-03');
        expect(t.tasa).toBeNull();
        expect(t.ticket).toBeNull();
    });

    it('la variación necesita una base: contra cero no hay porcentaje', () => {
        expect(deltaPct(120, 100)).toBe(20);
        expect(deltaPct(100, 0)).toBeNull();
        expect(deltaPct(null, 100)).toBeNull();
        expect(deltaPts(43, 38)).toBe(5);
        expect(deltaPts(43, null)).toBeNull();
    });

    it('la sparkline agrupa por semana cuando el rango es largo', () => {
        const largo = Array.from({ length: 90 }, (_, i) => dia(`2026-01-${String(i + 1).padStart(2, '0')}`, { cobrado: 1 }));
        // Fechas inválidas no importan aquí: el filtro es lexicográfico, igual que en la app.
        const v = sparkValues(largo, '2026-01-01', '2026-01-99', 'cobrado');
        expect(v.length).toBe(Math.ceil(90 / 7));
        expect(v[0]).toBe(7);
        expect(sparkValues(dias, '2026-09-01', '2026-09-03', 'cobrado')).toEqual([500, 700, 0]);
    });
});
